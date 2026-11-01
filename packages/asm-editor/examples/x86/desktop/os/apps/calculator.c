/*
 * Calculator: the four operations, percent and sign, on a pocket calculator's keys. Keys work
 * too: digits, + - * / . %, Enter or = for the result, Backspace, and Escape to clear.
 */

typedef struct {
    double total;        /* the left operand */
    char entry[24];      /* what is being typed, or the last result */
    int operation;       /* the pending one: + - * / or 0 */
    int fresh;           /* the next digit starts a new number */
    int error;
    ButtonTracker buttons;
} Calculator;

enum { CALC_W = 212, CALC_H = 248, PAD_W = 44, PAD_H = 32, PAD_GAP = 6, PADS_TOP = 54 };

static const char DIVIDE_LABEL[] = { (char)CH_DIVIDE, 0 };
static const char TIMES_LABEL[] = { (char)CH_TIMES, 0 };
static const char BACK_LABEL[] = { (char)CH_LEFT, 0 };

/* The keys, row by row, and what each one does. */
static const char *const CALC_LABELS[20] = {
    "C", "+/-", "%", DIVIDE_LABEL, "7", "8", "9", TIMES_LABEL, "4", "5",
    "6", "-",   "1", "2",          "3", "+", "0", ".",         BACK_LABEL, "=",
};
static const char CALC_ACTIONS[20] = { 'C', 'n', '%', '/', '7', '8', '9', '*', '4', '5',
                                       '6', '-', '1', '2', '3', '+', '0', '.', 'b', '=' };

static Rect calc_key(int index) {
    int row = index / 4, column = index % 4;
    return rect(12 + column * (PAD_W + PAD_GAP), PADS_TOP + row * (PAD_H + PAD_GAP), PAD_W, PAD_H);
}

static void calc_show(Calculator *calc, double value) {
    if (!isfinite(value)) {
        copy_text(calc->entry, sizeof calc->entry, "Error");
        calc->error = 1;
        desktop_beep();
        return;
    }
    snprintf(calc->entry, sizeof calc->entry, "%.10g", value);
}

static double calc_apply(double left, int operation, double right) {
    switch (operation) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right == 0 ? NAN : left / right;
    }
    return right;
}

static void calc_press(Calculator *calc, int action) {
    if (calc->error && action != 'C') return;
    double value = atof(calc->entry);
    size_t length = strlen(calc->entry);
    if (action >= '0' && action <= '9') {
        if (calc->fresh || strcmp(calc->entry, "0") == 0) {
            calc->entry[0] = 0;
            length = 0;
            calc->fresh = 0;
        }
        if (length < 15) {
            calc->entry[length] = (char)action;
            calc->entry[length + 1] = 0;
        }
    } else if (action == '.') {
        if (calc->fresh) {
            copy_text(calc->entry, sizeof calc->entry, "0");
            calc->fresh = 0;
        }
        if (!strchr(calc->entry, '.') && strlen(calc->entry) < 15) strcat(calc->entry, ".");
    } else if (action == 'b') {
        if (!calc->fresh && length > 1) calc->entry[length - 1] = 0;
        else if (!calc->fresh) copy_text(calc->entry, sizeof calc->entry, "0");
    } else if (action == 'n') {
        calc_show(calc, -value);
    } else if (action == '%') {
        calc_show(calc, calc->operation ? calc->total * value / 100 : value / 100);
    } else if (action == 'C') {
        memset(calc, 0, offsetof(Calculator, buttons));
        copy_text(calc->entry, sizeof calc->entry, "0");
    } else {
        /* an operation, or =: finish the one pending first */
        if (calc->operation && !calc->fresh) {
            value = calc_apply(calc->total, calc->operation, value);
            calc_show(calc, value);
            if (calc->error) return;
        }
        calc->total = value;
        calc->operation = action == '=' ? 0 : action;
        calc->fresh = 1;
    }
}

static void calc_paint(Window *win) {
    Calculator *calc = win->data;
    fill_rect(0, 0, CALC_W, CALC_H, FACE);
    draw_field(12, 12, CALC_W - 24, 32, 0xe8f4e0);
    draw_text_bold(CALC_W - 22 - text_width(calc->entry), 22, calc->entry, BLACK);
    if (calc->operation) {
        char pending[2] = { (char)calc->operation, 0 };
        if (calc->operation == '/') pending[0] = (char)CH_DIVIDE;
        if (calc->operation == '*') pending[0] = (char)CH_TIMES;
        draw_text(18, 22, pending, SHADOW);
    }
    for (int i = 0; i < 20; i++) {
        Rect key = calc_key(i);
        int down = button_down(&calc->buttons, i);
        draw_button(key.x, key.y, key.w, key.h, "", down);
        char action = CALC_ACTIONS[i];
        uint32_t colour = action >= '0' && action <= '9' ? NAVY
                          : action == 'C' || action == 'b' ? 0xb00000 : BLACK;
        const char *label = CALC_LABELS[i];
        draw_text_bold(key.x + (key.w - text_width(label)) / 2 + down, key.y + 10 + down, label,
                       colour);
    }
}

static void calc_mouse(Window *win, const MouseEvent *event) {
    Calculator *calc = win->data;
    Rect keys[20];
    for (int i = 0; i < 20; i++) keys[i] = calc_key(i);
    int clicked = track_buttons(win, &calc->buttons, keys, 20, event);
    if (clicked >= 0) {
        calc_press(calc, CALC_ACTIONS[clicked]);
        window_invalidate_rect(win, 0, 0, CALC_W, PADS_TOP);
    }
}

static void calc_key_event(Window *win, const KeyEvent *event) {
    Calculator *calc = win->data;
    int action = 0;
    if (event->ch && strchr("0123456789.+-*/%=", event->ch)) action = event->ch;
    else if (event->code == KEY_ENTER || event->code == KEY_KPENTER) action = '=';
    else if (event->code == KEY_BACKSPACE) action = 'b';
    else if (event->code == KEY_ESC || event->code == KEY_DELETE) action = 'C';
    if (!action) return;
    calc_press(calc, action);
    window_invalidate_rect(win, 0, 0, CALC_W, PADS_TOP);
}

static void calc_close(Window *win) { free(win->data); }

void calculator_open(const char *argument) {
    (void)argument;
    Window *win = window_open(APP_CALCULATOR, "Calculator", CALC_W, CALC_H);
    if (!win) return;
    Calculator *calc = calloc(1, sizeof *calc);
    copy_text(calc->entry, sizeof calc->entry, "0");
    calc->buttons.pressed = -1;
    win->data = calc;
    win->paint = calc_paint;
    win->mouse = calc_mouse;
    win->key = calc_key_event;
    win->close = calc_close;
}
