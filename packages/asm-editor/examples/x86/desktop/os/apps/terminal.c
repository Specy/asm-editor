/*
 * Terminal: a small shell. It lists, prints and writes the Project's files, opens applications
 * and windows, and works out arithmetic. `help` lists the commands.
 */

enum { TERM_COLS = 64, TERM_ROWS = 21, TERM_LINES = 200, TERM_HISTORY = 16, TERM_INPUT = 120 };
enum { TERM_W = TERM_COLS * FONT_W + 12, TERM_H = TERM_ROWS * FONT_HEIGHT + 10 };

typedef struct {
    char lines[TERM_LINES][TERM_COLS + 1];
    uint32_t colours[TERM_LINES];
    int first, count;                 /* a ring of the lines written */
    char input[TERM_INPUT + 1];
    int input_length;
    char history[TERM_HISTORY][TERM_INPUT + 1];
    int history_count, history_at;
    int scroll;                       /* lines scrolled back from the end */
    int blink;
} Terminal;

static const char PROMPT[] = "/project$ ";
enum { TERM_TEXT = 0xc0c0c0, TERM_GREEN = 0x40e040, TERM_YELLOW = 0xf0e060, TERM_BLUE = 0x6090ff,
       TERM_RED = 0xff6060 };

static void term_line(Terminal *term, const char *text, int length, uint32_t colour) {
    int slot = (term->first + term->count) % TERM_LINES;
    if (term->count == TERM_LINES) term->first = (term->first + 1) % TERM_LINES;
    else term->count++;
    length = min_int(length, TERM_COLS);
    memcpy(term->lines[slot], text, length);
    term->lines[slot][length] = 0;
    term->colours[slot] = colour;
}

/* Writes text, a line at a time, wrapping long lines at the width of the window. */
static void term_write(Terminal *term, uint32_t colour, const char *text) {
    while (*text) {
        const char *end = strchr(text, '\n');
        int length = end ? (int)(end - text) : (int)strlen(text);
        do {
            int part = min_int(length, TERM_COLS);
            term_line(term, text, part, colour);
            text += part;
            length -= part;
        } while (length > 0);
        if (!end) break;
        text = end + 1;
    }
}

static void term_printf(Terminal *term, uint32_t colour, const char *format, ...) {
    char text[512];
    va_list arguments;
    va_start(arguments, format);
    vsnprintf(text, sizeof text, format, arguments);
    va_end(arguments);
    term_write(term, colour, text);
}

/* ------------------------------------------------------------------ arithmetic: calc */

typedef struct {
    const char *at;
    int error;
} Parser;

static double parse_sum(Parser *parser);

static void skip_spaces(Parser *parser) {
    while (*parser->at == ' ') parser->at++;
}

static double parse_value(Parser *parser) {
    skip_spaces(parser);
    if (*parser->at == '(') {
        parser->at++;
        double value = parse_sum(parser);
        skip_spaces(parser);
        if (*parser->at == ')') parser->at++;
        else parser->error = 1;
        return value;
    }
    if (*parser->at == '-') {
        parser->at++;
        return -parse_value(parser);
    }
    char *end;
    double value = strtod(parser->at, &end);
    if (end == parser->at) parser->error = 1;
    parser->at = end;
    return value;
}

static double parse_product(Parser *parser) {
    double value = parse_value(parser);
    for (;;) {
        skip_spaces(parser);
        char op = *parser->at;
        if (op != '*' && op != '/' && op != '%') return value;
        parser->at++;
        double right = parse_value(parser);
        value = op == '*' ? value * right : op == '/' ? value / right : fmod(value, right);
    }
}

static double parse_sum(Parser *parser) {
    double value = parse_product(parser);
    for (;;) {
        skip_spaces(parser);
        char op = *parser->at;
        if (op != '+' && op != '-') return value;
        parser->at++;
        double right = parse_product(parser);
        value = op == '+' ? value + right : value - right;
    }
}

/* ------------------------------------------------------------------ commands */

static const char *const FORTUNES[] = {
    "Real programmers count from zero.",
    "There are 10 kinds of people: those who read binary and those who don't.",
    "The best code is no code at all.",
    "Premature optimization is the root of all evil. -- Knuth",
    "It works on my machine. This is the machine.",
    "mov eax, 1  ; the loneliest number",
};

/* The application a name means: notepad, calc, paint, mines, clock, terminal, files, about. */
static int app_named(const char *name) {
    static const char *const names[APP_COUNT][2] = {
        { "notepad", "edit" }, { "calculator", "calc" }, { "paint", "paint" },
        { "minesweeper", "mines" }, { "clock", "clock" }, { "terminal", "term" },
        { "files", "files" }, { "about", "about" },
    };
    for (int i = 0; i < APP_COUNT; i++)
        if (!strcmp(name, names[i][0]) || !strcmp(name, names[i][1])) return i;
    return -1;
}

static void term_ls(Terminal *term, const char *path) {
    DIR *dir = opendir(path[0] ? path : ".");
    if (!dir) {
        term_printf(term, TERM_RED, "ls: cannot open %s", path);
        return;
    }
    struct dirent *entry;
    int shown = 0;
    while ((entry = readdir(dir))) {
        if (entry->d_name[0] == '.') continue;
        char full[400];
        snprintf(full, sizeof full, "%.120s%s%.256s", path, path[0] ? "/" : "", entry->d_name);
        struct stat info = { 0 };
        int is_dir = stat(full, &info) == 0 && S_ISDIR(info.st_mode);
        if (is_dir) term_printf(term, TERM_BLUE, "       -  %s/", entry->d_name);
        else term_printf(term, TERM_TEXT, "%8ld  %s", (long)info.st_size, entry->d_name);
        shown++;
    }
    closedir(dir);
    if (!shown) term_write(term, TERM_TEXT, "(empty)");
}

static void term_cat(Terminal *term, const char *path) {
    FILE *file = fopen(path, "r");
    if (!file) {
        term_printf(term, TERM_RED, "cat: %s: no such file", path);
        return;
    }
    char line[256];
    int lines = 0;
    while (fgets(line, sizeof line, file) && lines < 400) {
        line[strcspn(line, "\r\n")] = 0;
        term_write(term, TERM_TEXT, line[0] ? line : " ");
        lines++;
    }
    fclose(file);
}

static void term_run(Window *win, Terminal *term, char *command) {
    while (*command == ' ') command++;
    char *argument = strchr(command, ' ');
    if (argument) {
        *argument++ = 0;
        while (*argument == ' ') argument++;
    } else {
        argument = command + strlen(command);
    }
    if (!command[0]) return;
    if (!strcmp(command, "help")) {
        term_write(term, TERM_YELLOW, "Commands:");
        term_write(term, TERM_TEXT,
                   "  ls [dir]          list the Project's files\n"
                   "  cat FILE          print a file\n"
                   "  echo TEXT [> FILE] print text, or write it to a file\n"
                   "  edit FILE         open a file in Notepad\n"
                   "  open APP          notepad calc paint mines clock files about\n"
                   "  ps / kill N       list windows / close window N\n"
                   "  calc EXPRESSION   work out (1 + 2) * 3 / 4\n"
                   "  date  uptime  whoami  uname  fortune  beep  clear\n"
                   "  exit              close this window\n"
                   "  shutdown          turn asmOS off");
    } else if (!strcmp(command, "ls")) {
        term_ls(term, argument);
    } else if (!strcmp(command, "cat")) {
        if (argument[0]) term_cat(term, argument);
        else term_write(term, TERM_RED, "cat: which file?");
    } else if (!strcmp(command, "echo")) {
        char *into = strchr(argument, '>');
        if (into) {
            *into++ = 0;
            while (*into == ' ') into++;
            char *end = argument + strlen(argument);
            while (end > argument && end[-1] == ' ') *--end = 0;
            FILE *file = into[0] ? fopen(into, "w") : NULL;
            if (!file) {
                term_printf(term, TERM_RED, "echo: cannot write %s", into);
            } else {
                fprintf(file, "%s\n", argument);
                fclose(file);
                term_printf(term, TERM_TEXT, "wrote %s", into);
            }
        } else {
            term_write(term, TERM_TEXT, argument[0] ? argument : " ");
        }
    } else if (!strcmp(command, "edit")) {
        app_launch(APP_NOTEPAD, argument);
    } else if (!strcmp(command, "open")) {
        int app = app_named(argument);
        if (app >= 0) app_launch(app, NULL);
        else term_printf(term, TERM_RED, "open: no application called '%s'", argument);
    } else if (!strcmp(command, "ps")) {
        term_write(term, TERM_YELLOW, "  N  WINDOW");
        for (int slot = 0; slot < MAX_WINDOWS; slot++)
            if (window_slots[slot].w)
                term_printf(term, TERM_TEXT, "%3d  %s%s", slot + 1, window_slots[slot].title,
                            window_slots[slot].minimized ? " (minimized)" : "");
    } else if (!strcmp(command, "kill")) {
        int slot = atoi(argument) - 1;
        if (slot < 0 || slot >= MAX_WINDOWS || !window_slots[slot].w)
            term_printf(term, TERM_RED, "kill: no window %s", argument);
        else if (&window_slots[slot] == win)
            term_write(term, TERM_RED, "kill: use exit to close this one");
        else
            window_close(&window_slots[slot]);
    } else if (!strcmp(command, "calc")) {
        Parser parser = { argument, 0 };
        double value = parse_sum(&parser);
        skip_spaces(&parser);
        if (parser.error || *parser.at) term_write(term, TERM_RED, "calc: cannot read that");
        else term_printf(term, TERM_GREEN, "%.12g", value);
    } else if (!strcmp(command, "date")) {
        time_t now = time(NULL);
        struct tm *t = gmtime(&now);
        term_printf(term, TERM_TEXT, "%s %d %s %d, %02d:%02d:%02d UTC", WEEKDAYS[t->tm_wday],
                    t->tm_mday, MONTHS[t->tm_mon], t->tm_year + 1900, t->tm_hour, t->tm_min,
                    t->tm_sec);
    } else if (!strcmp(command, "uptime")) {
        long seconds = (now_ms() - boot_time) / 1000;
        term_printf(term, TERM_TEXT, "up %ld:%02ld:%02ld, %d windows", seconds / 3600,
                    seconds / 60 % 60, seconds % 60, window_count);
    } else if (!strcmp(command, "whoami")) {
        term_write(term, TERM_TEXT, "root");
    } else if (!strcmp(command, "uname")) {
        term_write(term, TERM_TEXT, "asmOS 1.0 x86_64");
    } else if (!strcmp(command, "fortune")) {
        term_write(term, TERM_YELLOW, FORTUNES[now_ms() % (sizeof FORTUNES / sizeof FORTUNES[0])]);
    } else if (!strcmp(command, "beep")) {
        desktop_beep();
    } else if (!strcmp(command, "clear")) {
        term->count = 0;
    } else if (!strcmp(command, "exit")) {
        window_close(win);
    } else if (!strcmp(command, "shutdown")) {
        desktop_shutdown();
    } else {
        term_printf(term, TERM_RED, "%s: command not found (try help)", command);
    }
}

/* ------------------------------------------------------------------ the window */

static void term_paint(Window *win) {
    Terminal *term = win->data;
    fill_rect(0, 0, TERM_W, TERM_H, BLACK);
    /* the last lines, then the prompt with what is being typed */
    int rows = TERM_ROWS - 1;
    int last = term->count - term->scroll;
    int first = max_int(0, last - rows);
    int y = 5 + (rows - (last - first)) * FONT_HEIGHT;
    for (int i = first; i < last; i++, y += FONT_HEIGHT) {
        int slot = (term->first + i) % TERM_LINES;
        draw_text(6, y, term->lines[slot], term->colours[slot]);
    }
    if (term->scroll) {
        draw_text(6, y, "-- scrolled back: wheel down to return --", SHADOW);
        return;
    }
    draw_text(6, y, PROMPT, TERM_GREEN);
    int prompt = (int)strlen(PROMPT);
    int visible = TERM_COLS - prompt - 1;
    int skip = max_int(0, term->input_length - visible);
    draw_text_n(6 + prompt * FONT_W, y, term->input + skip, visible, WHITE);
    if (term->blink && window_is_focused(win))
        fill_rect(6 + (prompt + term->input_length - skip) * FONT_W, y, FONT_W, FONT_HEIGHT,
                  TERM_TEXT);
}

static void term_invalidate_prompt(Window *win) {
    window_invalidate_rect(win, 0, TERM_H - FONT_HEIGHT - 6, TERM_W, FONT_HEIGHT + 6);
}

static void term_key(Window *win, const KeyEvent *event) {
    Terminal *term = win->data;
    term->blink = 1;
    if (term->scroll) {
        term->scroll = 0;
        window_invalidate(win);
    }
    if (event->code == KEY_ENTER || event->code == KEY_KPENTER) {
        term->input[term->input_length] = 0;
        term_printf(term, TERM_GREEN, "%s%s", PROMPT, term->input);
        if (term->input_length) {
            int slot = term->history_count % TERM_HISTORY;
            copy_text(term->history[slot], sizeof term->history[slot], term->input);
            term->history_count++;
        }
        term->history_at = term->history_count;
        char command[TERM_INPUT + 1];
        copy_text(command, sizeof command, term->input);
        term->input_length = 0;
        term->input[0] = 0;
        term_run(win, term, command);
        if (stack_index(win) >= 0) window_invalidate(win);
        return;
    }
    if (event->code == KEY_UP || event->code == KEY_DOWN) {
        int oldest = max_int(0, term->history_count - TERM_HISTORY);
        int at = term->history_at + (event->code == KEY_UP ? -1 : 1);
        if (at < oldest || at > term->history_count) return;
        term->history_at = at;
        if (at == term->history_count) term->input[0] = 0;
        else copy_text(term->input, sizeof term->input, term->history[at % TERM_HISTORY]);
        term->input_length = (int)strlen(term->input);
    } else if (event->code == KEY_BACKSPACE) {
        if (term->input_length) term->input[--term->input_length] = 0;
    } else if (event->mods & MOD_CTRL && event->code == KEY_L) {
        term->count = 0;
        window_invalidate(win);
    } else if (event->mods & MOD_CTRL && event->code == KEY_C) {
        term_printf(term, TERM_GREEN, "%s%s^C", PROMPT, term->input);
        term->input_length = 0;
        term->input[0] = 0;
        window_invalidate(win);
    } else if (event->ch >= 32 && event->ch < 127 && term->input_length < TERM_INPUT) {
        term->input[term->input_length++] = (char)event->ch;
        term->input[term->input_length] = 0;
    } else {
        return;
    }
    term_invalidate_prompt(win);
}

static void term_mouse(Window *win, const MouseEvent *event) {
    Terminal *term = win->data;
    if (event->kind != MOUSE_WHEEL) return;
    int most = max_int(0, term->count - (TERM_ROWS - 1));
    term->scroll = clamp_int(term->scroll + event->wheel * 3, 0, most);
    window_invalidate(win);
}

static void term_tick(Window *win) {
    Terminal *term = win->data;
    term->blink = !term->blink;
    term_invalidate_prompt(win);
}

static void term_close(Window *win) { free(win->data); }

void terminal_open(const char *argument) {
    (void)argument;
    Window *win = window_open(APP_TERMINAL, "Terminal", TERM_W, TERM_H);
    if (!win) return;
    Terminal *term = calloc(1, sizeof *term);
    term->blink = 1;
    term_write(term, TERM_YELLOW, "asmOS 1.0 shell. Type help for the commands.");
    win->data = term;
    win->paint = term_paint;
    win->key = term_key;
    win->mouse = term_mouse;
    win->tick = term_tick;
    win->close = term_close;
    window_set_tick(win, 530);
}
