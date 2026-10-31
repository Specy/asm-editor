/*
 * The keyboard and the pointer, read as Linux input events from /dev/input. The keyboard is the
 * device that has a key A; the pointer is the USB tablet, the device that reports an absolute
 * position. Key codes become characters with a US layout, and the tablet's positions become
 * pixels. Events go to the window manager as MouseEvent and KeyEvent.
 */

void wm_mouse_event(const MouseEvent *event);
void wm_key_event(const KeyEvent *event);

static int keyboard_fd = -1, tablet_fd = -1;
static struct input_absinfo axis_x, axis_y;
static int modifiers, caps_lock;

/* What each key types, by its Linux code: unshifted, then shifted. */
static const char KEYMAP[] =
    "\0\0331234567890-=\b\tqwertyuiop[]\n\0asdfghjkl;'`\0\\zxcvbnm,./\0*\0 ";
static const char KEYMAP_SHIFT[] =
    "\0\033!@#$%^&*()_+\b\tQWERTYUIOP{}\n\0ASDFGHJKL:\"~\0|ZXCVBNM<>?\0*\0 ";

long now_ms(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return now.tv_sec * 1000L + now.tv_nsec / 1000000;
}

static int has_bit(const unsigned char *bits, int bit) { return bits[bit / 8] >> (bit % 8) & 1; }

/* The first event device that sends the event type `type` and, for EV_KEY, has the key `key`. */
static int find_device(int type, int key) {
    for (int number = 0; number < 32; number++) {
        char path[32];
        snprintf(path, sizeof path, "/dev/input/event%d", number);
        int fd = open(path, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;
        unsigned char types[EV_MAX / 8 + 1] = { 0 };
        unsigned char keys[KEY_MAX / 8 + 1] = { 0 };
        ioctl(fd, EVIOCGBIT(0, sizeof types), types);
        ioctl(fd, EVIOCGBIT(EV_KEY, sizeof keys), keys);
        if (has_bit(types, type) && (key < 0 || has_bit(keys, key))) return fd;
        close(fd);
    }
    return -1;
}

static int input_open(void) {
    keyboard_fd = find_device(EV_KEY, KEY_A);
    tablet_fd = find_device(EV_ABS, -1);
    if (tablet_fd >= 0) {
        ioctl(tablet_fd, EVIOCGABS(ABS_X), &axis_x);
        ioctl(tablet_fd, EVIOCGABS(ABS_Y), &axis_y);
    }
    return keyboard_fd >= 0 && tablet_fd >= 0;
}

static int to_pixel(int value, int size, const struct input_absinfo *axis) {
    int maximum = axis->maximum > 0 ? axis->maximum : 32767;
    return clamp_int((int)(((long)value * size + maximum - 1) / maximum), 0, size - 1);
}

/* ------------------------------------------------------------------ the keyboard */

static int key_character(int code) {
    int ch = 0;
    if (code < (int)sizeof KEYMAP - 1)
        ch = (modifiers & MOD_SHIFT ? KEYMAP_SHIFT : KEYMAP)[code];
    else if (code >= KEY_KP7 && code <= KEY_KPDOT)
        ch = "789-456+1230."[code - KEY_KP7];
    else if (code == KEY_KPENTER)
        ch = '\n';
    else if (code == KEY_KPSLASH)
        ch = '/';
    if (caps_lock && ch >= 'a' && ch <= 'z') ch -= 32;
    else if (caps_lock && ch >= 'A' && ch <= 'Z') ch += 32;
    return ch;
}

static int modifier_of(int code) {
    switch (code) {
    case KEY_LEFTSHIFT: case KEY_RIGHTSHIFT: return MOD_SHIFT;
    case KEY_LEFTCTRL: case KEY_RIGHTCTRL: return MOD_CTRL;
    case KEY_LEFTALT: case KEY_RIGHTALT: return MOD_ALT;
    }
    return 0;
}

static void keyboard_event(const struct input_event *event) {
    if (event->type != EV_KEY || event->code >= BTN_MISC) return;
    int modifier = modifier_of(event->code);
    if (modifier) {
        if (event->value) modifiers |= modifier;
        else modifiers &= ~modifier;
        return;
    }
    if (event->value == 0) return;          /* a release */
    if (event->code == KEY_CAPSLOCK) {
        caps_lock = !caps_lock;
        return;
    }
    KeyEvent key = { event->code, key_character(event->code), modifiers };
    if (modifiers & (MOD_CTRL | MOD_ALT)) key.ch = 0;
    wm_key_event(&key);
}

/* ------------------------------------------------------------------ the pointer */

static int pointer_x, pointer_y, pointer_buttons;
static int moved;                       /* a move not yet given to the window manager */
static long last_press_time;
static int last_press_x, last_press_y, last_press_button;

static void send_pointer(int kind, int button, int wheel) {
    MouseEvent event = { kind, pointer_x, pointer_y, button, pointer_buttons, 1, wheel };
    if (kind == MOUSE_DOWN) {
        long now = now_ms();
        int near = abs(pointer_x - last_press_x) < 5 && abs(pointer_y - last_press_y) < 5;
        if (button == last_press_button && near && now - last_press_time < 450) {
            event.clicks = 2;
            last_press_time = 0;            /* a third press starts again */
        } else {
            last_press_time = now;
        }
        last_press_x = pointer_x;
        last_press_y = pointer_y;
        last_press_button = button;
    }
    wm_mouse_event(&event);
}

/* Moves wait until the batch of events is read, or until a button changes, so that a fast drag
 * redraws once per batch rather than once per pixel. */
static void flush_move(void) {
    if (moved) {
        moved = 0;
        send_pointer(MOUSE_MOVE, 0, 0);
    }
}

static void tablet_event(const struct input_event *event) {
    if (event->type == EV_ABS && event->code == ABS_X) {
        pointer_x = to_pixel(event->value, screen_w, &axis_x);
        moved = 1;
    } else if (event->type == EV_ABS && event->code == ABS_Y) {
        pointer_y = to_pixel(event->value, screen_h, &axis_y);
        moved = 1;
    } else if (event->type == EV_KEY) {
        int button = event->code == BTN_LEFT ? BUTTON_LEFT
                     : event->code == BTN_RIGHT ? BUTTON_RIGHT
                     : event->code == BTN_MIDDLE ? BUTTON_MIDDLE : 0;
        if (!button) return;
        flush_move();
        if (event->value) pointer_buttons |= button;
        else pointer_buttons &= ~button;
        send_pointer(event->value ? MOUSE_DOWN : MOUSE_UP, button, 0);
    } else if (event->type == EV_REL && event->code == REL_WHEEL) {
        flush_move();
        send_pointer(MOUSE_WHEEL, 0, event->value);
    }
}

/* Waits up to timeout milliseconds (-1: for ever) for input, then hands over every event that
 * arrived. */
static void input_wait(int timeout) {
    struct pollfd waiting[2] = { { keyboard_fd, POLLIN, 0 }, { tablet_fd, POLLIN, 0 } };
    if (poll(waiting, 2, timeout) <= 0) return;
    struct input_event events[64];
    for (;;) {
        int got = 0;
        ssize_t bytes = read(keyboard_fd, events, sizeof events);
        for (int i = 0; i < bytes / (ssize_t)sizeof events[0]; i++) keyboard_event(&events[i]);
        got += bytes > 0;
        bytes = read(tablet_fd, events, sizeof events);
        for (int i = 0; i < bytes / (ssize_t)sizeof events[0]; i++) tablet_event(&events[i]);
        got += bytes > 0;
        if (!got) break;
    }
    flush_move();
}
