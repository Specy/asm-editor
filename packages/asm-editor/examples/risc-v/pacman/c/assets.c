/*
 * Loading the game's pictures and maze from the Project's Files, with the C library's fopen and
 * fread, which reach the Files through the simulator's file services. Paths start at the Project's
 * root, so this reads the same assets/ folder as the assembly version.
 *
 * The pictures are BMP files, unpacked here into words of 0x00RRGGBB, the Screen's own format, so
 * drawing them is a copy. Black is transparent in sprites.bmp, so a sprite needs no mask.
 */

static uint8_t file_buffer[FILE_BUFFER_BYTES];

/* Says which File is wrong and how, and ends the program. */
static void fail(const char *name, const char *problem) {
    printf("pacman: %s: %s\n", name, problem);
    exit(1);
}

/* The whole File into file_buffer; returns its length. */
static long read_file(const char *name) {
    FILE *file = fopen(name, "rb");
    if (!file) fail(name, "cannot open it. It has to be a File of this Project.");
    size_t length = fread(file_buffer, 1, sizeof file_buffer, file);
    int more = length == sizeof file_buffer && fgetc(file) != EOF;
    fclose(file);
    if (more) fail(name, "it is larger than the 256 KB the program reads.");
    return (long)length;
}

/* Little-endian fields, a byte at a time: BMP header fields are not word aligned. */
static uint32_t read_u16(const uint8_t *bytes) {
    return bytes[0] | (uint32_t)bytes[1] << 8;
}
static uint32_t read_u32(const uint8_t *bytes) {
    return bytes[0] | (uint32_t)bytes[1] << 8 | (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
}

/*
 * Unpacks the BMP in file_buffer into `target`, `stride` words a row. It must be exactly width by
 * height pixels, 24 or 32 bits a pixel, uncompressed, rows bottom-up or top-down. A 32 bit
 * picture with an alpha channel makes its transparent pixels black, which is transparent to the
 * sprite routines.
 */
static void decode_bmp(const char *name, long length, uint32_t *target, int width, int height,
                       int stride) {
    const uint8_t *file = file_buffer;
    if (length < 54 || file[0] != 'B' || file[1] != 'M') fail(name, "not a BMP picture.");
    uint32_t pixels = read_u32(file + 10);
    uint32_t header = read_u32(file + 14);
    if (header < 40)
        fail(name, "the BMP header is not one this program reads (save it as a plain 24 bit BMP).");
    int32_t file_width = (int32_t)read_u32(file + 18);
    int32_t file_height = (int32_t)read_u32(file + 22);
    int top_down = file_height < 0;
    if (top_down) file_height = -file_height;
    if (file_width != width || file_height != height) {
        printf("pacman: %s: the picture has the wrong size. It must be %d by %d pixels.\n", name,
               width, height);
        exit(1);
    }
    int bits = (int)read_u16(file + 28);
    uint32_t compression = read_u32(file + 30);
    int alpha = 0;
    if (bits == 24 && compression == 0) {
        /* the usual BMP */
    } else if (bits == 32 && compression == 0) {
        /* the fourth byte is padding */
    } else if (bits == 32 && compression == 3) {
        /* bit fields: an alpha channel when the header has a mask for it */
        alpha = header >= 56 && read_u32(file + 66) != 0;
    } else {
        fail(name, "save it as a 24 or 32 bit BMP, without compression.");
    }
    int bytes_per_pixel = bits / 8;
    long row_bytes = ((long)width * bytes_per_pixel + 3) & ~3L;
    if ((long)pixels + row_bytes * height > length)
        fail(name, "the file ends before its last row of pixels.");
    for (int y = 0; y < height; y++) {
        const uint8_t *source = file + pixels + row_bytes * (top_down ? y : height - 1 - y);
        uint32_t *row = target + y * stride;
        for (int x = 0; x < width; x++, source += bytes_per_pixel) {
            uint32_t color = source[0] | (uint32_t)source[1] << 8 | (uint32_t)source[2] << 16;
            if (alpha && source[3] < 128) color = 0; /* see-through */
            row[x] = color;
        }
    }
}

static void bad_line(const char *name, int line) {
    printf("pacman: %s: every line must be 28 characters long; this one is not: line %d\n", name,
           line);
    exit(1);
}

/*
 * maze.txt into maze_layout: 31 lines of 28 characters. '#' is a wall, '.' a dot, 'o' an
 * energizer, ' ' an empty corridor and '-' the ghost house door; any other character is a wall
 * too. Blank lines and carriage returns are skipped.
 */
static void parse_maze(const char *name, long length) {
    int row = 0, column = 0, line = 1;
    dots_total = 0;
    for (long i = 0; i < length; i++) {
        char c = (char)file_buffer[i];
        if (c == '\r') continue;
        if (c == '\n') {
            if (column != 0 && column != MAZE_COLS) bad_line(name, line);
            if (column != 0) row++; /* a blank line counts for nothing */
            column = 0;
            line++;
            continue;
        }
        if (row >= MAZE_ROWS) fail(name, "the maze must be 31 lines of 28 characters.");
        if (column >= MAZE_COLS) bad_line(name, line);
        maze_layout[row][column++] = c;
        if (c == '.' || c == 'o') dots_total++;
    }
    if (column != 0 && column != MAZE_COLS) bad_line(name, line);
    if (column != 0) row++; /* the last line had no newline */
    if (row != MAZE_ROWS) fail(name, "the maze must be 31 lines of 28 characters.");
}

/* Where every lit pixel of the maze picture is, so the end-of-level flash repaints only those. */
static void collect_wall_pixels(void) {
    wall_pixel_count = 0;
    for (int index = MAZE_TOP * GAME_W; index < (MAZE_TOP + MAZE_IMAGE_H) * GAME_W; index++)
        if (maze_image[index] && wall_pixel_count < MAX_WALL_PIXELS)
            wall_pixels[wall_pixel_count++] = index;
}

/*
 * Reads assets/maze.txt, assets/maze.bmp, assets/sprites.bmp and assets/tiles.bmp. A File that is
 * missing or not what the game expects stops the program with a message saying which File and
 * what is wrong.
 */
static void load_assets(void) {
    static const char maze_txt[] = "assets/maze.txt", maze_bmp[] = "assets/maze.bmp";
    static const char sprites[] = "assets/sprites.bmp", tiles_bmp[] = "assets/tiles.bmp";
    parse_maze(maze_txt, read_file(maze_txt));
    decode_bmp(maze_bmp, read_file(maze_bmp), maze_image + MAZE_TOP * GAME_W, MAZE_IMAGE_W,
               MAZE_IMAGE_H, GAME_W);
    decode_bmp(sprites, read_file(sprites), sprite_sheet, SHEET_W, SHEET_H, SHEET_W);
    decode_bmp(tiles_bmp, read_file(tiles_bmp), tile_sheet, TILES_W, TILES_H, TILES_W);
    collect_wall_pixels();
}
