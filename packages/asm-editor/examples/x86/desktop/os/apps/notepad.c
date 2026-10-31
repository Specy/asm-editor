/*
 * Notepad: plain text, one file at a time. The program's working directory is the Project, so
 * Save writes a File you can open in the editor, and the files of the Project open here (from
 * Files, or `edit name` in the Terminal). Ctrl+S saves and Ctrl+N starts a new note.
 */

enum { NOTE_W = 440, NOTE_H = 300, NOTE_BAR = 30, NOTE_STATUS = 20, LINE_H = 14,
       NOTE_CAPACITY = 32768 };

typedef struct {
    char *text;
    int length, cursor;
    int top, left;           /* the first line and the first column shown */
    int goal;                /* the column up and down try to keep */
    int blink, modified;
    char path[64];           /* empty for a note not saved yet */
    char message[64];
    ButtonTracker buttons;
} Notepad;

static Rect note_buttons[2];

static Rect note_area(void) { return rect(2, NOTE_BAR, NOTE_W - 4, NOTE_H - NOTE_BAR - NOTE_STATUS); }
static int note_rows(void) { return (note_area().h - 8) / LINE_H; }
static int note_columns(void) { return (note_area().w - 8) / FONT_W; }

static int line_start(const Notepad *note, int index) {
    while (index > 0 && note->text[index - 1] != '\n') index--;
    return index;
}
static int line_end(const Notepad *note, int index) {
    while (index < note->length && note->text[index] != '\n') index++;
    return index;
}
static int line_number(const Notepad *note, int index) {
    int line = 0;
    for (int i = 0; i < index; i++) line += note->text[i] == '\n';
    return line;
}
/* Where line `line` starts, or the end of the text when it has fewer lines. */
static int index_of_line(const Notepad *note, int line) {
    int index = 0;
    while (line > 0 && index < note->length) {
        if (note->text[index++] == '\n') line--;
    }
    return index;
}
static int index_at(const Notepad *note, int line, int column) {
    int start = index_of_line(note, line), end = line_end(note, start);
    return start + min_int(column, end - start);
}

static void note_update_title(Window *win, Notepad *note) {
    char title[96];
    snprintf(title, sizeof title, "%s%s - Notepad", note->modified ? "*" : "",
             note->path[0] ? note->path : "Untitled");
    window_set_title(win, title);
}

/* Scrolls so that the cursor shows; returns whether anything scrolled. */
static int note_follow(Notepad *note) {
    int line = line_number(note, note->cursor);
    int column = note->cursor - line_start(note, note->cursor);
    int top = note->top, left = note->left;
    if (line < note->top) note->top = line;
    if (line >= note->top + note_rows()) note->top = line - note_rows() + 1;
    if (column < note->left) note->left = max_int(0, column - 8);
    if (column >= note->left + note_columns()) note->left = column - note_columns() + 8;
    return top != note->top || left != note->left;
}

static Rect note_row_rect(Notepad *note, int line) {
    Rect area = note_area();
    return rect(area.x + 2, area.y + 4 + (line - note->top) * LINE_H, area.w - 4, LINE_H);
}

static void note_invalidate_line(Window *win, Notepad *note, int line) {
    Rect row = note_row_rect(note, line);
    window_invalidate_rect(win, row.x, row.y, row.w, row.h);
}

static void note_invalidate_text(Window *win) {
    Rect area = note_area();
    window_invalidate_rect(win, area.x, area.y, area.w, area.h + NOTE_STATUS);
}

static void note_paint(Window *win) {
    Notepad *note = win->data;
    fill_rect(0, 0, NOTE_W, NOTE_H, FACE);
    draw_button(note_buttons[0].x, note_buttons[0].y, note_buttons[0].w, note_buttons[0].h, "New",
                button_down(&note->buttons, 0));
    draw_button(note_buttons[1].x, note_buttons[1].y, note_buttons[1].w, note_buttons[1].h,
                "Save", button_down(&note->buttons, 1));
    draw_text(136, 9, note->path[0] ? note->path : "(not saved yet)", note->path[0] ? BLACK : SHADOW);
    Rect area = note_area();
    draw_field(area.x, area.y, area.w, area.h, WHITE);
    int ox, oy;
    gfx_get_origin(&ox, &oy);
    Rect saved_clip = gfx_get_clip();
    gfx_clip(rect_intersect(saved_clip, rect(ox + area.x + 2, oy + area.y + 2, area.w - 4,
                                             area.h - 4)));
    int index = index_of_line(note, note->top);
    int cursor_line = line_number(note, note->cursor);
    for (int row = 0; row < note_rows() && index <= note->length; row++) {
        int end = line_end(note, index);
        int y = area.y + 4 + row * LINE_H;
        if (end - index > note->left)
            draw_text_n(area.x + 4, y, note->text + index + note->left,
                        min_int(end - index - note->left, note_columns() + 1), BLACK);
        if (note->top + row == cursor_line && note->blink && window_is_focused(win)) {
            int column = note->cursor - index - note->left;
            if (column >= 0 && column <= note_columns())
                fill_rect(area.x + 4 + column * FONT_W - 1, y - 1, 2, LINE_H, BLACK);
        }
        if (end >= note->length) break;
        index = end + 1;
    }
    gfx_clip(saved_clip);
    char status[96];
    int column = note->cursor - line_start(note, note->cursor);
    snprintf(status, sizeof status, "Ln %d, Col %d", cursor_line + 1, column + 1);
    int y = NOTE_H - NOTE_STATUS + 2;
    bevel_thin_sunken(2, y, 120, NOTE_STATUS - 4);
    bevel_thin_sunken(126, y, NOTE_W - 128, NOTE_STATUS - 4);
    draw_text(8, y + 2, status, BLACK);
    draw_text(132, y + 2, note->message, BLACK);
}

/* ------------------------------------------------------------------ editing */

static void note_insert(Notepad *note, const char *text, int count) {
    if (note->length + count >= NOTE_CAPACITY) {
        desktop_beep();
        return;
    }
    memmove(note->text + note->cursor + count, note->text + note->cursor,
            note->length - note->cursor);
    memcpy(note->text + note->cursor, text, count);
    note->length += count;
    note->cursor += count;
    note->text[note->length] = 0;
    note->modified = 1;
}

static void note_delete(Notepad *note, int at, int count) {
    if (at < 0 || at + count > note->length) return;
    memmove(note->text + at, note->text + at + count, note->length - at - count);
    note->length -= count;
    note->text[note->length] = 0;
    if (note->cursor > at) note->cursor = max_int(at, note->cursor - count);
    note->modified = 1;
}

static int note_load(Notepad *note, const char *path) {
    FILE *file = fopen(path, "r");
    if (!file) return 0;
    note->length = (int)fread(note->text, 1, NOTE_CAPACITY - 1, file);
    note->text[note->length] = 0;
    fclose(file);
    /* the editor keeps line ends as \n, but a file from elsewhere may use \r\n */
    int kept = 0;
    for (int i = 0; i < note->length; i++)
        if (note->text[i] != '\r') note->text[kept++] = note->text[i];
    note->length = kept;
    note->text[kept] = 0;
    return 1;
}

static void note_save(Window *win, Notepad *note) {
    if (!note->path[0]) {
        /* the first free name of note1.txt, note2.txt and so on */
        for (int number = 1; number < 1000; number++) {
            struct stat info;
            snprintf(note->path, sizeof note->path, "note%d.txt", number);
            if (stat(note->path, &info) != 0) break;
        }
    }
    FILE *file = fopen(note->path, "w");
    if (!file || fwrite(note->text, 1, note->length, file) != (size_t)note->length) {
        if (file) fclose(file);
        snprintf(note->message, sizeof note->message, "Could not save %.40s", note->path);
        desktop_beep();
    } else {
        fclose(file);
        note->modified = 0;
        snprintf(note->message, sizeof note->message, "Saved %.32s, %d bytes", note->path,
                 note->length);
    }
    note_update_title(win, note);
    window_invalidate(win);
}

static void note_new(Window *win, Notepad *note) {
    note->length = note->cursor = note->top = note->left = note->goal = 0;
    note->text[0] = 0;
    note->path[0] = 0;
    note->modified = 0;
    copy_text(note->message, sizeof note->message, "New note");
    note_update_title(win, note);
    window_invalidate(win);
}

static void note_key(Window *win, const KeyEvent *event) {
    Notepad *note = win->data;
    int before_line = line_number(note, note->cursor), was_modified = note->modified;
    int whole = 0;           /* whether more than the cursor's line changed */
    int moved_vertically = 0;
    if (event->mods & MOD_CTRL) {
        if (event->code == KEY_S) note_save(win, note);
        if (event->code == KEY_N) note_new(win, note);
        return;
    }
    int line_begin = line_start(note, note->cursor);
    switch (event->code) {
    case KEY_LEFT: if (note->cursor > 0) note->cursor--; break;
    case KEY_RIGHT: if (note->cursor < note->length) note->cursor++; break;
    case KEY_HOME: note->cursor = line_begin; break;
    case KEY_END: note->cursor = line_end(note, note->cursor); break;
    case KEY_UP: case KEY_DOWN: case KEY_PAGEUP: case KEY_PAGEDOWN: {
        int step = event->code == KEY_UP ? -1 : event->code == KEY_DOWN ? 1
                 : event->code == KEY_PAGEUP ? -note_rows() : note_rows();
        int line = max_int(0, before_line + step);
        note->cursor = index_at(note, line, note->goal);
        moved_vertically = 1;
        break;
    }
    case KEY_BACKSPACE:
        if (note->cursor > 0) {
            whole = note->text[note->cursor - 1] == '\n';
            note_delete(note, note->cursor - 1, 1);
        }
        break;
    case KEY_DELETE:
        if (note->cursor < note->length) {
            whole = note->text[note->cursor] == '\n';
            note_delete(note, note->cursor, 1);
        }
        break;
    case KEY_ENTER: case KEY_KPENTER:
        note_insert(note, "\n", 1);
        whole = 1;
        break;
    case KEY_TAB:
        note_insert(note, "    ", 4);
        break;
    default:
        if (event->ch >= 32 && event->ch < 127) {
            char ch = (char)event->ch;
            note_insert(note, &ch, 1);
        } else {
            return;
        }
    }
    if (!moved_vertically) note->goal = note->cursor - line_start(note, note->cursor);
    note->blink = 1;
    if (note_follow(note)) whole = 1;
    if (note->modified != was_modified) note_update_title(win, note);
    if (whole) {
        note_invalidate_text(win);
    } else {
        note_invalidate_line(win, note, before_line);
        note_invalidate_line(win, note, line_number(note, note->cursor));
        window_invalidate_rect(win, 0, NOTE_H - NOTE_STATUS, 126, NOTE_STATUS);
    }
}

static void note_mouse(Window *win, const MouseEvent *event) {
    Notepad *note = win->data;
    int clicked = track_buttons(win, &note->buttons, note_buttons, 2, event);
    if (clicked == 0) note_new(win, note);
    if (clicked == 1) note_save(win, note);
    if (note->buttons.pressed >= 0 || clicked >= 0) return;
    Rect area = note_area();
    if (event->kind == MOUSE_WHEEL) {
        int lines = line_number(note, note->length) + 1;
        note->top = clamp_int(note->top - event->wheel * 3, 0, max_int(0, lines - note_rows()));
        note_invalidate_text(win);
        return;
    }
    int dragging = event->kind == MOUSE_MOVE && event->buttons & BUTTON_LEFT;
    if ((event->kind == MOUSE_DOWN || dragging) && rect_contains(area, event->x, event->y)) {
        int before = line_number(note, note->cursor);
        int line = note->top + max_int(0, (event->y - area.y - 4) / LINE_H);
        int column = note->left + max_int(0, (event->x - area.x - 4 + FONT_W / 2) / FONT_W);
        note->cursor = index_at(note, line, column);
        note->goal = column;
        note->blink = 1;
        note_invalidate_line(win, note, before);
        note_invalidate_line(win, note, line_number(note, note->cursor));
        window_invalidate_rect(win, 0, NOTE_H - NOTE_STATUS, 126, NOTE_STATUS);
    }
}

static void note_tick(Window *win) {
    Notepad *note = win->data;
    note->blink = !note->blink;
    note_invalidate_line(win, note, line_number(note, note->cursor));
}

static void note_close(Window *win) {
    Notepad *note = win->data;
    free(note->text);
    free(note);
}

void notepad_open(const char *argument) {
    Window *win = window_open(APP_NOTEPAD, "Notepad", NOTE_W, NOTE_H);
    if (!win) return;
    Notepad *note = calloc(1, sizeof *note);
    note->text = calloc(NOTE_CAPACITY, 1);
    note->buttons.pressed = -1;
    note->blink = 1;
    note_buttons[0] = rect(4, 4, 60, 22);
    note_buttons[1] = rect(68, 4, 60, 22);
    if (argument && argument[0]) {
        copy_text(note->path, sizeof note->path, argument);
        if (note_load(note, argument))
            snprintf(note->message, sizeof note->message, "Opened %.32s, %d bytes", argument,
                     note->length);
        else
            snprintf(note->message, sizeof note->message, "New file %.48s", argument);
    } else {
        copy_text(note->message, sizeof note->message, "Type, then Save (Ctrl+S)");
    }
    win->data = note;
    win->paint = note_paint;
    win->key = note_key;
    win->mouse = note_mouse;
    win->tick = note_tick;
    win->close = note_close;
    note_update_title(win, note);
    window_set_tick(win, 530);
}
