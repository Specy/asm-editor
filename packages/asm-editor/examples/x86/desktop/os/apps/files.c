/*
 * Files: the Project's files and folders. Double-click a folder to go into it, a text file to open
 * it in Notepad and a .bmp picture to open it in Paint.
 */

enum { FILES_W = 380, FILES_H = 280, FILES_BAR = 30, FILE_ROW = 18, FILES_MAX = 128 };

typedef struct {
    char name[64];
    int is_dir;
    long size;
} FileEntry;

typedef struct {
    char dir[128];                    /* from the Project's root; empty for the root itself */
    FileEntry entries[FILES_MAX];
    int count, selected, top;
    ButtonTracker buttons;
} Files;

static Rect files_buttons[2];

static Rect files_list(void) { return rect(2, FILES_BAR, FILES_W - 4, FILES_H - FILES_BAR - 2); }
static int files_rows(void) { return (files_list().h - 4 - FILE_ROW) / FILE_ROW; }

static int entry_order(const void *a, const void *b) {
    const FileEntry *x = a, *y = b;
    if (x->is_dir != y->is_dir) return y->is_dir - x->is_dir;
    return strcmp(x->name, y->name);
}

static void files_read(Files *files) {
    files->count = 0;
    files->selected = -1;
    files->top = 0;
    DIR *dir = opendir(files->dir[0] ? files->dir : ".");
    if (!dir) return;
    struct dirent *entry;
    while ((entry = readdir(dir)) && files->count < FILES_MAX) {
        if (entry->d_name[0] == '.') continue;
        FileEntry *item = &files->entries[files->count++];
        copy_text(item->name, sizeof item->name, entry->d_name);
        char path[200];
        snprintf(path, sizeof path, "%s%s%s", files->dir, files->dir[0] ? "/" : "", item->name);
        struct stat info = { 0 };
        item->is_dir = stat(path, &info) == 0 && S_ISDIR(info.st_mode);
        item->size = item->is_dir ? 0 : (long)info.st_size;
    }
    closedir(dir);
    qsort(files->entries, files->count, sizeof files->entries[0], entry_order);
}

static const Icon *file_icon(const FileEntry *entry) {
    if (entry->is_dir) return &ICON_FOLDER;
    if (ends_with(entry->name, ".bmp")) return &ICON_PICTURE;
    if (ends_with(entry->name, ".asm") || ends_with(entry->name, ".c") ||
        ends_with(entry->name, ".h"))
        return &ICON_CHIP;
    return &ICON_NOTEPAD;
}

static void files_paint(Window *win) {
    Files *files = win->data;
    fill_rect(0, 0, FILES_W, FILES_H, FACE);
    draw_button(files_buttons[0].x, files_buttons[0].y, files_buttons[0].w, files_buttons[0].h,
                "Up", button_down(&files->buttons, 0));
    draw_button(files_buttons[1].x, files_buttons[1].y, files_buttons[1].w, files_buttons[1].h,
                "Refresh", button_down(&files->buttons, 1));
    draw_field(144, 4, FILES_W - 148, 22, WHITE);
    char where[160];
    snprintf(where, sizeof where, "/project%s%s", files->dir[0] ? "/" : "", files->dir);
    draw_text(150, 9, where, BLACK);
    Rect list = files_list();
    draw_field(list.x, list.y, list.w, list.h, WHITE);
    /* column headings */
    draw_button(list.x + 2, list.y + 2, list.w - 84, FILE_ROW, "", 0);
    draw_button(list.x + list.w - 82, list.y + 2, 80, FILE_ROW, "", 0);
    draw_text(list.x + 8, list.y + 4, "Name", BLACK);
    draw_text(list.x + list.w - 76, list.y + 4, "Size", BLACK);
    for (int row = 0; row < files_rows(); row++) {
        int index = files->top + row;
        if (index >= files->count) break;
        FileEntry *entry = &files->entries[index];
        int y = list.y + 2 + FILE_ROW + row * FILE_ROW;
        int chosen = index == files->selected;
        draw_icon(file_icon(entry), list.x + 6, y + 1, 1);
        if (chosen) fill_rect(list.x + 26, y + 1, text_width(entry->name) + 4, FILE_ROW - 2, NAVY);
        draw_text(list.x + 28, y + 3, entry->name, chosen ? WHITE : BLACK);
        char size[24];
        if (entry->is_dir) copy_text(size, sizeof size, "Folder");
        else if (entry->size < 10000) snprintf(size, sizeof size, "%ld B", entry->size);
        else snprintf(size, sizeof size, "%ld KB", (entry->size + 1023) / 1024);
        draw_text(list.x + list.w - 8 - text_width(size), y + 3, size, BLACK);
    }
    if (!files->count) draw_text(list.x + 28, list.y + 26, "(empty)", SHADOW);
}

static void files_go(Window *win, Files *files, const char *dir) {
    copy_text(files->dir, sizeof files->dir, dir);
    files_read(files);
    char title[160];
    snprintf(title, sizeof title, "Files - /project%s%s", dir[0] ? "/" : "", dir);
    window_set_title(win, title);
    window_invalidate(win);
}

static void files_up(Window *win, Files *files) {
    char parent[128];
    copy_text(parent, sizeof parent, files->dir);
    char *slash = strrchr(parent, '/');
    if (slash) *slash = 0;
    else parent[0] = 0;
    files_go(win, files, parent);
}

static void files_activate(Window *win, Files *files, int index) {
    FileEntry *entry = &files->entries[index];
    char path[200];
    snprintf(path, sizeof path, "%s%s%s", files->dir, files->dir[0] ? "/" : "", entry->name);
    if (entry->is_dir) files_go(win, files, path);
    else if (ends_with(entry->name, ".bmp")) app_launch(APP_PAINT, path);
    else if (is_text_file(entry->name)) app_launch(APP_NOTEPAD, path);
    else desktop_beep();
}

static void files_select(Window *win, Files *files, int index) {
    files->selected = index;
    if (index >= 0) {
        if (index < files->top) files->top = index;
        if (index >= files->top + files_rows()) files->top = index - files_rows() + 1;
    }
    Rect list = files_list();
    window_invalidate_rect(win, list.x, list.y, list.w, list.h);
}

static void files_mouse(Window *win, const MouseEvent *event) {
    Files *files = win->data;
    int clicked = track_buttons(win, &files->buttons, files_buttons, 2, event);
    if (clicked == 0) files_up(win, files);
    if (clicked == 1) files_go(win, files, files->dir);
    if (files->buttons.pressed >= 0 || clicked >= 0) return;
    Rect list = files_list();
    if (event->kind == MOUSE_WHEEL) {
        files->top = clamp_int(files->top - event->wheel * 3, 0,
                               max_int(0, files->count - files_rows()));
        window_invalidate_rect(win, list.x, list.y, list.w, list.h);
        return;
    }
    if (event->kind != MOUSE_DOWN || event->button != BUTTON_LEFT) return;
    int row = (event->y - list.y - 2 - FILE_ROW) / FILE_ROW;
    int index = event->y >= list.y + 2 + FILE_ROW ? files->top + row : -1;
    if (index >= files->count || !rect_contains(list, event->x, event->y)) index = -1;
    files_select(win, files, index);
    if (index >= 0 && event->clicks == 2) files_activate(win, files, index);
}

static void files_key(Window *win, const KeyEvent *event) {
    Files *files = win->data;
    if (event->code == KEY_DOWN || event->code == KEY_UP) {
        int step = event->code == KEY_DOWN ? 1 : -1;
        if (files->count) files_select(win, files, clamp_int(files->selected + step, 0, files->count - 1));
    } else if (event->code == KEY_ENTER && files->selected >= 0) {
        files_activate(win, files, files->selected);
    } else if (event->code == KEY_BACKSPACE) {
        files_up(win, files);
    } else if (event->code == KEY_F5) {
        files_go(win, files, files->dir);
    }
}

static void files_close(Window *win) { free(win->data); }

void files_open(const char *argument) {
    Window *win = window_open(APP_FILES, "Files", FILES_W, FILES_H);
    if (!win) return;
    Files *files = calloc(1, sizeof *files);
    files->buttons.pressed = -1;
    files_buttons[0] = rect(4, 4, 60, 22);
    files_buttons[1] = rect(68, 4, 70, 22);
    win->data = files;
    win->paint = files_paint;
    win->mouse = files_mouse;
    win->key = files_key;
    win->close = files_close;
    files_go(win, files, argument ? argument : "");
}
