import { glyphRows, SCREEN_CELL_8X16, type ScreenCellSize } from './bitmapFont'
import { BLACK, WHITE, type ScreenColor } from './color'
import {
    DEFAULT_SCREEN_HISTORY_BYTES,
    ScreenHistory,
    type ScreenPixelRecord,
    type ScreenRecord,
    type ScreenState
} from './ScreenHistory'

/**
 * The Screen peripheral: the image a program draws on, plus the text cursor its console output
 * lands on, since EASy68K and the Z80 have one output window where text and graphics share the
 * image ([ADR 0003](../../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)).
 * Every environment's graphics interface is translated into these operations by its adapter; the
 * Screen itself knows no tasks, syscalls or ports.
 *
 * Plain TypeScript with no Svelte runes, like the other peripherals: a Core calls into it from
 * inside its synchronous execution, and it has to run under node in tests. The GUI does not observe
 * it reactively either — it paints the visible image with `putImageData` on an animation frame when
 * `dirty` is set, the pattern the upstream TRS-80 web screen uses, so the machine never waits for a
 * frame ([ADR 0006](../../../../../docs/adr/0006-screen-double-buffering.md)).
 *
 * Conventions worth knowing before reading the operations:
 *
 * - Colors are 24-bit RGB; the images are RGBA bytes because `putImageData` takes those.
 * - The origin is the top left, coordinates are logical pixels, and anything outside the Screen is
 *   clipped instead of being an error: a program drawing off the edge is normal.
 * - Rectangles and ellipses exclude their right and bottom edges, because EASy68K draws through
 *   Windows GDI, whose `Rectangle` and `Ellipse` do; see `drawRectangle`.
 * - With double buffering on, drawing changes an off-screen image that only `present` copies to the
 *   visible one; with it off the two are the same array, which is what direct drawing means.
 */

export type ScreenSize = {
    width: number
    height: number
}

/** The shape of a cell-mapped display: how many character cells the mirrored memory holds. */
export type ScreenCellGrid = {
    columns: number
    rows: number
}

export type ScreenOptions = {
    width: number
    height: number
    /** What a clear, a resize and a scrolled text row fill with; also the initial image. */
    backgroundColor?: ScreenColor
    penColor?: ScreenColor
    fillColor?: ScreenColor
    /** 8 by 8 for the Z80, 8 by 16 for EASy68K's 640 by 480 window. */
    cell?: ScreenCellSize
    historyByteBudget?: number
}

type Rect = {
    x: number
    y: number
    width: number
    height: number
}

const CARRIAGE_RETURN = 0x0d
const LINE_FEED = 0x0a

const BYTES_PER_PIXEL = 4

/**
 * How many dropped images a Screen keeps to draw on again. A double-buffered frame needs two — one
 * for the `clear` and one for the `present` — and evicts two, so anything above that is memory
 * held for nothing; the third covers a frame that also resizes or presents twice. At 640 by 480
 * they are 1.2 MB each, which is why this is not simply generous.
 */
const MAX_SPARE_IMAGES = 3

/**
 * Which end of a 32-bit word the red byte lands on when the images are written a word at a time.
 * The images are RGBA bytes in memory order, so the word a little-endian host has to store for
 * them is ABGR; every desktop and phone this runs on is little-endian, and the other branch is
 * there because a typed-array view is defined to use the host's order, not the array's.
 */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

export class Screen {
    readonly history: ScreenHistory
    private readonly options: ScreenOptions

    private _width: number
    private _height: number
    /** The image drawing operations write to. The same array as `visible` unless double buffering. */
    private drawing: Uint8ClampedArray
    /** The image the renderer paints. */
    private visible: Uint8ClampedArray

    private _backgroundColor: ScreenColor
    private _penColor: ScreenColor
    private _fillColor: ScreenColor
    private _penWidth = 1
    private _penX = 0
    private _penY = 0
    private _cursorColumn = 0
    private _cursorRow = 0
    private _cell: ScreenCellSize
    private _doubleBuffering = false
    /** The drawing geometry `useCells` replaced, restored when the program leaves cell mode. */
    private beforeCells: { cell: ScreenCellSize } | null = null
    private _framebuffer: ScreenSize | null = null
    private _cells: ScreenCellGrid | null = null
    /** The glyph sheet cell mode paints with: 256 glyphs of one byte per pixel, non-zero for ink. */
    private cellGlyphs: Uint8Array | null = null

    private _version = 0
    private _dirty = true
    /** How many renderers are painting this Screen; see `watch`. */
    private watchers = 0
    /** Depth of the open compound operations and the records they have collected so far. */
    private compoundDepth = 0
    private compoundRecords: ScreenRecord[] = []
    /** The scalar state the last record took, reused while it still describes the Screen. */
    private lastState: ScreenState | null = null
    /**
     * Images the journal's budget has dropped, kept to be drawn on again. A `clear` and a `present`
     * each hand their old image to the journal and need a new one, and at 640 by 480 the budget is
     * dropping two of exactly that size every frame — allocating a fresh one instead measured as
     * expensive as the copy the transfer was meant to save, because a fresh page has to be zeroed.
     *
     * Only the images an eviction dropped go in here, and only those: they are unreachable by
     * construction, where a record being undone is still being read from.
     */
    private spareImages: Uint8ClampedArray[] = []

    constructor(options: ScreenOptions) {
        this.options = options
        this.history = new ScreenHistory(
            options.historyByteBudget ?? DEFAULT_SCREEN_HISTORY_BYTES,
            (record) => this.reclaim(record)
        )
        this._width = Math.max(1, Math.trunc(options.width))
        this._height = Math.max(1, Math.trunc(options.height))
        this._backgroundColor = options.backgroundColor ?? BLACK
        this._penColor = options.penColor ?? WHITE
        this._fillColor = options.fillColor ?? WHITE
        this._cell = options.cell ?? SCREEN_CELL_8X16
        this.drawing = this.newImage(this._width, this._height, this._backgroundColor)
        this.visible = this.drawing
    }

    // ---------------------------------------------------------------- state

    get width(): number {
        return this._width
    }

    get height(): number {
        return this._height
    }

    /** EASy68K's task 33 get-size request and the Z80's size reads answer with this. */
    getSize(): ScreenSize {
        return { width: this._width, height: this._height }
    }

    get penColor(): ScreenColor {
        return this._penColor
    }

    get fillColor(): ScreenColor {
        return this._fillColor
    }

    get backgroundColor(): ScreenColor {
        return this._backgroundColor
    }

    get penWidth(): number {
        return this._penWidth
    }

    /** The drawing position `lineTo` draws from, moved by every line and `moveTo`. */
    get penX(): number {
        return this._penX
    }

    get penY(): number {
        return this._penY
    }

    get cursorColumn(): number {
        return this._cursorColumn
    }

    get cursorRow(): number {
        return this._cursorRow
    }

    get cell(): ScreenCellSize {
        return this._cell
    }

    get columns(): number {
        return Math.max(1, Math.floor(this._width / this._cell.width))
    }

    get rows(): number {
        return Math.max(1, Math.floor(this._height / this._cell.height))
    }

    get doubleBuffering(): boolean {
        return this._doubleBuffering
    }

    /** The framebuffer this Screen mirrors, or null when programs draw with the operations below. */
    get framebuffer(): ScreenSize | null {
        return this._framebuffer
    }

    /** The cell grid this Screen mirrors, or null when it is not in cell mode. */
    get cells(): ScreenCellGrid | null {
        return this._cells
    }

    /**
     * Whether the image comes from Core memory rather than from drawing operations. Both memory
     * modes journal nothing and are restored by re-reading that memory after the Core's own
     * rollback ([ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    get memoryBacked(): boolean {
        return this._framebuffer !== null || this._cells !== null
    }

    /** The pixels the renderer paints, RGBA, `width * height * 4` bytes. */
    get visiblePixels(): Uint8ClampedArray {
        return this.visible
    }

    /** The pixels drawing operations write to; the same array as `visiblePixels` unless buffered. */
    get drawingPixels(): Uint8ClampedArray {
        return this.drawing
    }

    /** Set whenever the visible image changed; the renderer clears it after painting. */
    get dirty(): boolean {
        return this._dirty
    }

    /** Bumped with every visible change, so a renderer can tell two frames apart without diffing. */
    get version(): number {
        return this._version
    }

    markPainted(): void {
        this._dirty = false
    }

    /** Whether a renderer is painting this Screen, and so whether `dirty` can ever come back down. */
    get watched(): boolean {
        return this.watchers > 0
    }

    /**
     * Registers a renderer and answers with the function that unregisters it. The scheduler asks for
     * the short slice budget only for a watched Screen
     * ([ADR 0007](../../../../../docs/adr/0007-generic-emulator-run-scheduling.md)): a Screen nobody
     * paints — x86's, which has no panel, or any surface whose Screen toggle is closed — stays dirty
     * for the whole run and would otherwise hold every program at the animation budget.
     */
    watch(): () => void {
        this.watchers++
        let released = false
        return () => {
            if (released) return
            released = true
            this.watchers = Math.max(0, this.watchers - 1)
        }
    }

    setPenColor(color: ScreenColor): void {
        this.journal({ kind: 'none' })
        this._penColor = color & 0xffffff
    }

    setFillColor(color: ScreenColor): void {
        this.journal({ kind: 'none' })
        this._fillColor = color & 0xffffff
    }

    setBackgroundColor(color: ScreenColor): void {
        this.journal({ kind: 'none' })
        this._backgroundColor = color & 0xffffff
    }

    setPenWidth(width: number): void {
        this.journal({ kind: 'none' })
        this._penWidth = Math.max(1, Math.trunc(width))
    }

    setCell(cell: ScreenCellSize): void {
        this.journal({ kind: 'none' })
        this._cell = cell
        this.clampCursor()
    }

    /** EASy68K's task 11 set-cursor, in character cells, clamped to the Screen. */
    setCursor(column: number, row: number): void {
        this.journal({ kind: 'none' })
        this._cursorColumn = clamp(Math.trunc(column), 0, this.columns - 1)
        this._cursorRow = clamp(Math.trunc(row), 0, this.rows - 1)
    }

    /**
     * Double buffering on gives drawing its own image, started as a copy of what is on screen, so a
     * program can compose a frame and show it with `present`. Turning it off drops the off-screen
     * image without showing it: presenting is the explicit operation, and EASy68K's mode 16 does not
     * repaint either.
     */
    setDoubleBuffering(enabled: boolean): void {
        if (enabled === this._doubleBuffering) {
            this.journal({ kind: 'none' })
            return
        }
        this.journalImages()
        this._doubleBuffering = enabled
        this.drawing = enabled ? new Uint8ClampedArray(this.visible) : this.visible
    }

    // ----------------------------------------------------------- operations

    /** One pixel in the pen color. The pen width does not apply, as it does not to GDI's SetPixel. */
    drawPixel(x: number, y: number): void {
        const px = Math.trunc(x)
        const py = Math.trunc(y)
        this.journalPixel('drawing', px, py)
        this.paint(this.drawing, px, py, this._penColor)
        this.markDrawn()
    }

    /** The color at a point of the image being drawn on; outside the Screen it is the background. */
    getPixel(x: number, y: number): ScreenColor {
        const px = Math.trunc(x)
        const py = Math.trunc(y)
        if (px < 0 || py < 0 || px >= this._width || py >= this._height)
            return this._backgroundColor
        const offset = (py * this._width + px) * BYTES_PER_PIXEL
        return (
            (this.drawing[offset] << 16) |
            (this.drawing[offset + 1] << 8) |
            this.drawing[offset + 2]
        )
    }

    /** Moves the drawing position without drawing, EASy68K's task 92 mode 2 and the Z80's move-to. */
    moveTo(x: number, y: number): void {
        this.journal({ kind: 'none' })
        this._penX = Math.trunc(x)
        this._penY = Math.trunc(y)
    }

    drawLine(x1: number, y1: number, x2: number, y2: number): void {
        const from = { x: Math.trunc(x1), y: Math.trunc(y1) }
        const to = { x: Math.trunc(x2), y: Math.trunc(y2) }
        this.journalPatch('drawing', this.penBounds(boundsOf([from, to])))
        this.strokeLine(from.x, from.y, to.x, to.y)
        this._penX = to.x
        this._penY = to.y
        this.markDrawn()
    }

    /** Draws from the drawing position to a point and leaves the position there, like GDI's LineTo. */
    lineTo(x: number, y: number): void {
        this.drawLine(this._penX, this._penY, x, y)
    }

    /**
     * A rectangle whose right and bottom edges are exclusive: `drawRectangle(10, 10, 20, 20)` covers
     * the columns 10 to 19 and the rows 10 to 19, and a rectangle with equal edges draws nothing.
     * EASy68K draws through the Windows GDI `Rectangle` function, which excludes them
     * (https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-rectangle: "the
     * rectangle ... extends up to, but does not include, the right and bottom coordinates"), so
     * preserving its examples pixel for pixel means excluding them here
     * ([ADR 0003](../../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)).
     * The interior is the fill color and the border the pen, as GDI's brush and pen are.
     */
    drawRectangle(x1: number, y1: number, x2: number, y2: number): void {
        this.rectangle(x1, y1, x2, y2, true)
    }

    /** The same rectangle as `drawRectangle`, border only. */
    drawUnfilledRectangle(x1: number, y1: number, x2: number, y2: number): void {
        this.rectangle(x1, y1, x2, y2, false)
    }

    /** The ellipse inscribed in `drawRectangle`'s rectangle, with the same excluded edges. */
    drawEllipse(x1: number, y1: number, x2: number, y2: number): void {
        this.ellipse(x1, y1, x2, y2, true)
    }

    drawUnfilledEllipse(x1: number, y1: number, x2: number, y2: number): void {
        this.ellipse(x1, y1, x2, y2, false)
    }

    /**
     * Replaces the connected area of the color at the starting point with the fill color, four way,
     * the way EASy68K's flood fill spreads until it meets a different color. The area is only known
     * once it has been walked, so this journals the whole image.
     */
    floodFill(x: number, y: number): void {
        const startX = Math.trunc(x)
        const startY = Math.trunc(y)
        if (startX < 0 || startY < 0 || startX >= this._width || startY >= this._height) {
            this.journal({ kind: 'none' })
            return
        }
        const target = this.getPixel(startX, startY)
        if (target === (this._fillColor & 0xffffff)) {
            //nothing to spread into, and journaling a whole image for a no-op would eat the budget
            this.journal({ kind: 'none' })
            return
        }
        this.journalPatch('drawing', this.fullRect())
        //a run at a time rather than a pixel at a time: the region is the same four-way connected
        //one, but each row of it is filled as words and only one seed per run of the rows above and
        //below goes on the stack, instead of four neighbours for every pixel visited. Comparing
        //packed words is comparing colors because every write to an image is opaque — `paint`,
        //`fillImage`, `fillRegion` and `syncFramebuffer` all set alpha to 255
        const words = imageWords(this.drawing)
        const width = this._width
        const height = this._height
        const targetWord = words[startY * width + startX]
        const fillWord = packColor(this._fillColor)
        const stack: number[] = [startX, startY]
        while (stack.length > 0) {
            const y = stack.pop() as number
            const x = stack.pop() as number
            const row = y * width
            if (words[row + x] !== targetWord) continue
            let from = x
            while (from > 0 && words[row + from - 1] === targetWord) from--
            let to = x
            while (to < width - 1 && words[row + to + 1] === targetWord) to++
            words.fill(fillWord, row + from, row + to + 1)
            if (y > 0) this.seedRun(words, stack, y - 1, from, to, targetWord)
            if (y < height - 1) this.seedRun(words, stack, y + 1, from, to, targetWord)
        }
        this.markDrawn()
    }

    /**
     * Puts one seed on the flood fill's stack per run of `targetWord` in `[from, to]` of row `y`.
     * One per run rather than one per pixel is the whole difference: a row of a thousand pixels
     * still to fill costs one stack entry.
     */
    private seedRun(
        words: Uint32Array,
        stack: number[],
        y: number,
        from: number,
        to: number,
        targetWord: number
    ): void {
        const row = y * this._width
        let x = from
        while (x <= to) {
            if (words[row + x] !== targetWord) {
                x++
                continue
            }
            stack.push(x, y)
            while (x <= to && words[row + x] === targetWord) x++
        }
    }

    /**
     * Wipes text and graphics together and homes the text cursor, as EASy68K's task 11 $FF00 does.
     *
     * The journal is given the image this replaces rather than a copy of it, which is one whole
     * image copy less per call — a megabyte and a quarter at 640 by 480, on the operation an
     * animating program reaches once a frame. Nothing aliases a `patch` record's pixels: `apply`
     * reads them through `pasteRegion`, so handing the array over is safe in a way that handing
     * over an `images` record's arrays, which `apply` adopts, would not be.
     */
    clear(color: ScreenColor = this._backgroundColor): void {
        if (this.journalsPixels) {
            const replaced = this.drawing
            const fresh = this.newImage(this._width, this._height, color)
            this.journal({ kind: 'patch', target: 'drawing', ...this.fullRect(), pixels: replaced })
            this.drawing = fresh
            //direct drawing is two names for one array, so the visible image follows it
            if (!this._doubleBuffering) this.visible = fresh
        } else {
            //nothing is keeping the old pixels, so the fill in place is the cheaper of the two
            this.journalPatch('drawing', this.fullRect())
            fillImage(this.drawing, color)
        }
        this._cursorColumn = 0
        this._cursorRow = 0
        this.markDrawn()
    }

    /**
     * Resizes the Screen the way a program asks for a window size, clearing both images: the pixels
     * of a differently shaped image cannot be carried over meaningfully, and the programs that
     * resize do it before they draw.
     */
    resize(width: number, height: number): void {
        const newWidth = Math.max(1, Math.trunc(width))
        const newHeight = Math.max(1, Math.trunc(height))
        if (newWidth === this._width && newHeight === this._height) {
            this.journal({ kind: 'none' })
            return
        }
        this.journalImages()
        this._width = newWidth
        this._height = newHeight
        this.drawing = this.newImage(newWidth, newHeight, this._backgroundColor)
        this.visible = this._doubleBuffering
            ? this.newImage(newWidth, newHeight, this._backgroundColor)
            : this.drawing
        this._penX = 0
        this._penY = 0
        this.clampCursor()
        this.markVisible()
    }

    /**
     * Shows what has been drawn: EASy68K's task 94 repaint. With double buffering off there is one
     * image and nothing to copy, so this only asks the renderer for a frame.
     */
    present(): void {
        if (!this._doubleBuffering) {
            this.journal({ kind: 'none' })
            this.markVisible()
            return
        }
        if (this.journalsPixels) {
            //the same transfer `clear` does: the record takes the image being replaced, and the
            //copy of the drawing buffer becomes the new one
            const replaced = this.visible
            const fresh = this.takeImage(this.drawing.length)
            fresh.set(this.drawing)
            this.journal({ kind: 'patch', target: 'visible', ...this.fullRect(), pixels: replaced })
            this.visible = fresh
        } else {
            this.journalPatch('visible', this.fullRect())
            this.visible.set(this.drawing)
        }
        this.markVisible()
    }

    /**
     * Text at a pixel position, in the pen color and over whatever is already there, EASy68K's way
     * of putting a label on a drawing. It never wraps: what falls off the edge is clipped.
     */
    drawText(x: number, y: number, text: string): void {
        const left = Math.trunc(x)
        const top = Math.trunc(y)
        const width = this._cell.width * [...text].length
        this.journalPatch('drawing', { x: left, y: top, width, height: this._cell.height })
        let cellX = left
        //one word view for the whole label, not one a glyph
        const words = imageWords(this.drawing)
        for (const character of text) {
            this.paintGlyph(words, cellX, top, character.codePointAt(0) ?? 0, false)
            cellX += this._cell.width
        }
        this.markDrawn()
    }

    /**
     * Text at the text cursor, the path console output and input echo take on a Screen. The cursor
     * advances by one cell, wraps at the right edge and scrolls the whole image up one cell row at
     * the bottom — text and graphics move together, because they are one image. A carriage return
     * returns to the first column and a line feed starts a new line, the pairing a terminal shows
     * (and the one the Terminal transcript records), so both views of the same output agree.
     */
    writeText(text: string): void {
        const plan = this.runText(text, false)
        this.journalPatch('drawing', plan.scrolled ? this.fullRect() : plan.rect)
        this.runText(text, true)
        this.markDrawn()
    }

    // ---------------------------------------------------------- framebuffer

    /**
     * Switches to the memory-backed image of the MARS and RARS bitmap display: one word of Core
     * memory is one logical pixel, and the adapter re-reads the mapped range into the Screen instead
     * of the Screen journaling pixels, because the Core's own rollback already restores them
     * ([ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    useFramebuffer(width: number, height: number): void {
        this.discardCompound()
        this.history.clear()
        this._framebuffer = null
        this._cells = null
        this.cellGlyphs = null
        this.resize(width, height)
        this.history.clear()
        this._framebuffer = { width: this._width, height: this._height }
    }

    /**
     * Switches to a cell-mapped display, where one byte of Core memory is one character cell drawn
     * from `glyphs`: the TRS-80's memory-mapped screen
     * ([ADR 0020](../../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)). Like
     * the framebuffer it is memory-backed, so it journals nothing and Undo re-reads the memory.
     *
     * `glyphs` holds 256 glyphs of `cell.width * cell.height` bytes, non-zero for ink.
     */
    useCells(grid: ScreenCellGrid, cell: ScreenCellSize, glyphs: Uint8Array): void {
        const columns = Math.max(1, Math.trunc(grid.columns))
        const rows = Math.max(1, Math.trunc(grid.rows))
        this.discardCompound()
        this.history.clear()
        this._framebuffer = null
        this._cells = null
        //A cell display is memory-backed and has no present step, and the commands that would
        //present or leave double buffering are refused while it is on, so leaving the flag set
        //froze the visible image with nothing the program could do about it. Through the setter,
        //not the field: it is what re-points `drawing` at `visible`, and the `resize` below only
        //rebuilds them when the size actually changes.
        this.setDoubleBuffering(false)
        //Remembered so leaving the mode gives text back a cell the program did not choose and has
        //no way to change; the image size it can still set for itself with a resize.
        this.beforeCells = { cell: this._cell }
        this._cell = cell
        this.resize(columns * cell.width, rows * cell.height)
        this.history.clear()
        this.cellGlyphs = glyphs
        this._cells = { columns, rows }
    }

    /** Leaves framebuffer or cell mode; the image stays as it is until something draws on it. */
    useDrawing(): void {
        const leavingCells = this._cells !== null
        this._framebuffer = null
        this._cells = null
        this.cellGlyphs = null
        this.discardCompound()
        //The image is left exactly as it is; only the text cell goes back to what it was, so
        //console output and input echo are not stuck at the cell height the display imposed.
        if (leavingCells && this.beforeCells) this._cell = this.beforeCells.cell
        this.beforeCells = null
        this.history.clear()
    }

    /**
     * Paints cell codes into the image, all of them or the range `[from, to)` that a memory hook
     * reported dirty. Ink is the pen color and paper is the background color: the display is
     * monochrome, as the machine's was, and those two ports are how a program chooses its phosphor.
     */
    syncCells(codes: ArrayLike<number>, from = 0, to = codes.length): void {
        const grid = this._cells
        const glyphs = this.cellGlyphs
        if (grid === null || glyphs === null) return
        const { width: cellWidth, height: cellHeight } = this._cell
        const glyphSize = cellWidth * cellHeight
        const ink = packColor(this._penColor)
        const paper = packColor(this._backgroundColor)
        const image = imageWords(this.drawing)
        const last = Math.min(to, codes.length, grid.columns * grid.rows)
        for (let index = Math.max(0, from); index < last; index++) {
            const left = (index % grid.columns) * cellWidth
            const top = Math.floor(index / grid.columns) * cellHeight
            const glyph = (codes[index] & 0xff) * glyphSize
            for (let row = 0; row < cellHeight; row++) {
                let target = (top + row) * this._width + left
                const source = glyph + row * cellWidth
                for (let column = 0; column < cellWidth; column++) {
                    image[target++] = glyphs[source + column] === 0 ? paper : ink
                }
            }
        }
        this.markDrawn()
    }

    /**
     * Copies framebuffer words into the image, all of them or the range `[from, to)` that a memory
     * observer reported dirty. Only the low 24 bits of a word are the color, as in MARS.
     */
    syncFramebuffer(words: ArrayLike<number>, from = 0, to = words.length): void {
        const last = Math.min(to, words.length, this._width * this._height)
        const image = imageWords(this.drawing)
        for (let index = Math.max(0, from); index < last; index++) {
            image[index] = packColor(words[index])
        }
        this.markDrawn()
    }

    // ----------------------------------------------------------------- undo

    canUndo(): boolean {
        return this.history.canUndo()
    }

    /** Rolls back one operation. Returns false when the history is empty or the budget ate it. */
    undo(): boolean {
        const record = this.history.pop()
        if (record === undefined) return false
        this.apply(record)
        return true
    }

    /**
     * Rolls back to a point noted earlier from `history.sequence`. Returns false when the budget had
     * already dropped some of those records, which is how the Undo depth ends up being the smaller
     * of the Core's history and the Screen's.
     */
    undoToSequence(sequence: number): boolean {
        while (this.history.sequence > sequence) {
            if (!this.undo()) return false
        }
        return true
    }

    /**
     * Opens a compound operation: everything journaled until the matching `endCompoundOperation`
     * becomes one record, which undoes it all newest first. An adapter associates the journal range
     * with the CPU instruction that caused it (ADR 0005); grouping also keeps the byte budget from
     * retaining only part of a compound operation.
     * The Z80's clear (adopt the fill color, then clear) and the echo of typed input (one glyph per
     * character while a single trap is suspended) are the two that need it. Nesting is counted, and
     * a compound that journaled nothing pushes nothing.
     */
    beginCompoundOperation(): void {
        this.compoundDepth++
    }

    endCompoundOperation(): void {
        if (this.compoundDepth === 0) return
        this.compoundDepth--
        if (this.compoundDepth > 0) return
        const records = this.compoundRecords
        this.compoundRecords = []
        if (records.length === 0) return
        //one operation is its own record: a compound wrapper would only cost bytes and indirection
        if (records.length === 1) {
            this.history.push(records[0])
            return
        }
        //the state is the one the first operation found, which is where undoing them all ends up
        this.history.push({ state: records[0].state, pixels: { kind: 'compound', records } })
    }

    /** Back to the state a fresh Screen has, on the same path as the Terminal's clear. */
    reset(): void {
        //Stop can land while a compound is open, on a program suspended in the middle of a read
        this.discardCompound()
        this.history.clear()
        //a Build can change the Screen size, and holding megabytes of the old one costs more than
        //the allocation the next program's first frame pays
        this.spareImages = []
        this._framebuffer = null
        this._cells = null
        this.cellGlyphs = null
        this.beforeCells = null
        this._width = Math.max(1, Math.trunc(this.options.width))
        this._height = Math.max(1, Math.trunc(this.options.height))
        this._backgroundColor = this.options.backgroundColor ?? BLACK
        this._penColor = this.options.penColor ?? WHITE
        this._fillColor = this.options.fillColor ?? WHITE
        this._cell = this.options.cell ?? SCREEN_CELL_8X16
        this._penWidth = 1
        this._penX = 0
        this._penY = 0
        this._cursorColumn = 0
        this._cursorRow = 0
        this._doubleBuffering = false
        this.drawing = this.newImage(this._width, this._height, this._backgroundColor)
        this.visible = this.drawing
        this.markVisible()
    }

    // -------------------------------------------------------------- drawing

    private rectangle(x1: number, y1: number, x2: number, y2: number, filled: boolean): void {
        const left = Math.min(Math.trunc(x1), Math.trunc(x2))
        const right = Math.max(Math.trunc(x1), Math.trunc(x2))
        const top = Math.min(Math.trunc(y1), Math.trunc(y2))
        const bottom = Math.max(Math.trunc(y1), Math.trunc(y2))
        this.journalPatch(
            'drawing',
            this.penBounds({ x: left, y: top, width: right - left, height: bottom - top })
        )
        if (right <= left || bottom <= top) return
        if (filled) {
            this.fillRegion(
                { x: left, y: top, width: right - left, height: bottom - top },
                this._fillColor
            )
        }
        this.strokeLine(left, top, right - 1, top)
        this.strokeLine(right - 1, top, right - 1, bottom - 1)
        this.strokeLine(right - 1, bottom - 1, left, bottom - 1)
        this.strokeLine(left, bottom - 1, left, top)
        this.markDrawn()
    }

    private ellipse(x1: number, y1: number, x2: number, y2: number, filled: boolean): void {
        const left = Math.min(Math.trunc(x1), Math.trunc(x2))
        const right = Math.max(Math.trunc(x1), Math.trunc(x2))
        const top = Math.min(Math.trunc(y1), Math.trunc(y2))
        const bottom = Math.max(Math.trunc(y1), Math.trunc(y2))
        this.journalPatch(
            'drawing',
            this.penBounds({ x: left, y: top, width: right - left, height: bottom - top })
        )
        if (right <= left || bottom <= top) return
        //the ellipse is the one inscribed in the rectangle, tested at pixel centers: a pixel is
        //inside when its center is, and the border is the inside pixels touching an outside one
        const centerX = (left + right) / 2
        const centerY = (top + bottom) / 2
        const radiusX = (right - left) / 2
        const radiusY = (bottom - top) / 2
        const inside = (x: number, y: number): boolean => {
            if (x < left || x >= right || y < top || y >= bottom) return false
            const dx = (x + 0.5 - centerX) / radiusX
            const dy = (y + 0.5 - centerY) / radiusY
            return dx * dx + dy * dy <= 1
        }
        /**
         * The inside pixels of one row, which for an ellipse are always one interval. Solving for
         * the interval instead of testing every pixel of the bounding box is what lets the interior
         * be a word fill; the square root can land a boundary pixel on the wrong side, so the ends
         * are walked out against `inside` itself and the shape is the predicate's, not the solver's.
         */
        const span = (y: number): [number, number] | null => {
            if (y < top || y >= bottom) return null
            const dy = (y + 0.5 - centerY) / radiusY
            const remaining = 1 - dy * dy
            if (remaining < 0) return null
            const half = radiusX * Math.sqrt(remaining)
            let from = Math.max(left, Math.ceil(centerX - half - 0.5))
            let to = Math.min(right - 1, Math.floor(centerX + half - 0.5))
            while (from > left && inside(from - 1, y)) from--
            while (from <= to && !inside(from, y)) from++
            while (to < right - 1 && inside(to + 1, y)) to++
            while (to >= from && !inside(to, y)) to--
            return to < from ? null : [from, to]
        }
        let previous = span(top - 1)
        let current = span(top)
        for (let y = top; y < bottom; y++) {
            const next = span(y + 1)
            if (current !== null) {
                const [from, to] = current
                //a pixel is border when one of its four neighbours is outside: within the row that
                //is the two ends, and vertically it is whatever the rows above and below leave
                //uncovered, which is the same set the four-neighbour test picked out
                const coveredFrom = Math.max(
                    previous === null ? Infinity : previous[0],
                    next === null ? Infinity : next[0]
                )
                const coveredTo = Math.min(
                    previous === null ? -Infinity : previous[1],
                    next === null ? -Infinity : next[1]
                )
                if (filled && this._penWidth > 1) {
                    //a pen wider than one pixel reaches its neighbours, and then the order the two
                    //colors go down in is visible: GDI fills a pixel and stamps it before moving on,
                    //so a stamp survives on the pixel to its right only until that one is filled.
                    //The row is still only its inside pixels, and the border test is still the
                    //spans, so this is the old order without the old bounding-box walk
                    for (let x = from; x <= to; x++) {
                        this.paint(this.drawing, x, y, this._fillColor)
                        if (x === from || x === to || x < coveredFrom || x > coveredTo) {
                            this.stampPen(x, y)
                        }
                    }
                } else {
                    if (filled) {
                        this.fillRegion(
                            { x: from, y, width: to - from + 1, height: 1 },
                            this._fillColor
                        )
                    }
                    const leftRun = Math.min(to, coveredFrom - 1)
                    for (let x = from; x <= leftRun; x++) this.stampPen(x, y)
                    const rightRun = Math.max(from, coveredTo + 1)
                    for (let x = Math.max(rightRun, leftRun + 1); x <= to; x++) this.stampPen(x, y)
                    //the ends themselves, when neither run reached them
                    if (from > leftRun) this.stampPen(from, y)
                    if (to < rightRun) this.stampPen(to, y)
                }
            }
            previous = current
            current = next
        }
        this.markDrawn()
    }

    private strokeLine(x1: number, y1: number, x2: number, y2: number): void {
        //Bresenham, stamping the pen at every point of the path
        let x = x1
        let y = y1
        const stepX = x1 < x2 ? 1 : -1
        const stepY = y1 < y2 ? 1 : -1
        const deltaX = Math.abs(x2 - x1)
        const deltaY = -Math.abs(y2 - y1)
        let error = deltaX + deltaY
        for (;;) {
            this.stampPen(x, y)
            if (x === x2 && y === y2) return
            const doubled = 2 * error
            if (doubled >= deltaY) {
                error += deltaY
                x += stepX
            }
            if (doubled <= deltaX) {
                error += deltaX
                y += stepY
            }
        }
    }

    /** A square pen centered on the path, as a GDI pen of that width is. */
    private stampPen(x: number, y: number): void {
        if (this._penWidth === 1) {
            this.paint(this.drawing, x, y, this._penColor)
            return
        }
        const before = Math.floor((this._penWidth - 1) / 2)
        for (let offsetY = 0; offsetY < this._penWidth; offsetY++) {
            for (let offsetX = 0; offsetX < this._penWidth; offsetX++) {
                this.paint(this.drawing, x - before + offsetX, y - before + offsetY, this._penColor)
            }
        }
    }

    /**
     * A rectangle of one color, a row of words at a time. The clipping and the color are settled
     * once for the whole rectangle instead of once per pixel, which is what `paint` in a double
     * loop does; the pixels covered are the same ones that loop would have kept.
     */
    private fillRegion(rect: Rect, color: ScreenColor): void {
        const clipped = this.clip(rect)
        if (clipped === null) return
        const words = imageWords(this.drawing)
        const value = packColor(color)
        for (let row = 0; row < clipped.height; row++) {
            const start = (clipped.y + row) * this._width + clipped.x
            words.fill(value, start, start + clipped.width)
        }
    }

    private paint(image: Uint8ClampedArray, x: number, y: number, color: ScreenColor): void {
        if (x < 0 || y < 0 || x >= this._width || y >= this._height) return
        const offset = (y * this._width + x) * BYTES_PER_PIXEL
        image[offset] = (color >> 16) & 0xff
        image[offset + 1] = (color >> 8) & 0xff
        image[offset + 2] = color & 0xff
        image[offset + 3] = 0xff
    }

    // ----------------------------------------------------------------- text

    /**
     * Walks a string over the text cursor, drawing and scrolling only when committing. The dry walk
     * gives `writeText` the rectangle to journal before anything is overwritten, and tells it when a
     * scroll makes that rectangle the whole image.
     */
    private runText(text: string, commit: boolean): { rect: Rect | null; scrolled: boolean } {
        const columns = this.columns
        const rows = this.rows
        let column = this._cursorColumn
        let row = this._cursorRow
        let scrolled = false
        let words: Uint32Array | null = null
        let minColumn = Number.POSITIVE_INFINITY
        let minRow = Number.POSITIVE_INFINITY
        let maxColumn = Number.NEGATIVE_INFINITY
        let maxRow = Number.NEGATIVE_INFINITY
        const newLine = () => {
            column = 0
            row += 1
            if (row < rows) return
            row = rows - 1
            scrolled = true
            if (commit) this.scrollUp()
        }
        for (const character of text) {
            const code = character.codePointAt(0) ?? 0
            if (code === CARRIAGE_RETURN) {
                column = 0
                continue
            }
            if (code === LINE_FEED) {
                newLine()
                continue
            }
            if (commit) {
                //`scrollUp` moves the image inside the same buffer, so the view stays this one's
                words ??= imageWords(this.drawing)
                this.paintGlyph(
                    words,
                    column * this._cell.width,
                    row * this._cell.height,
                    code,
                    true
                )
            }
            minColumn = Math.min(minColumn, column)
            maxColumn = Math.max(maxColumn, column)
            minRow = Math.min(minRow, row)
            maxRow = Math.max(maxRow, row)
            column += 1
            if (column >= columns) newLine()
        }
        if (commit) {
            this._cursorColumn = column
            this._cursorRow = row
        }
        const drewNothing = maxColumn < minColumn
        return {
            scrolled,
            rect: drewNothing
                ? null
                : {
                      x: minColumn * this._cell.width,
                      y: minRow * this._cell.height,
                      width: (maxColumn - minColumn + 1) * this._cell.width,
                      height: (maxRow - minRow + 1) * this._cell.height
                  }
        }
    }

    /**
     * One glyph with its top left at a pixel position. Text at the cursor paints the cell
     * background first, the way a terminal cell is opaque, so scrolled rows leave nothing behind;
     * text at a pixel position draws only the glyph, so a label can sit on a drawing.
     */
    private paintGlyph(
        words: Uint32Array,
        x: number,
        y: number,
        code: number,
        opaque: boolean
    ): void {
        const rows = glyphRows(code, this._cell.height)
        //the cell is clipped once and then written as words, rather than clipping and storing four
        //bytes per pixel: a cell is a hundred and twenty-eight pixels and a run of text is one per
        //character. The word view is the caller's, so a line of text builds one instead of one a
        //glyph — the array it views cannot be replaced inside a text run, since a scroll moves the
        //image within the same buffer
        const clipped = this.clip({ x, y, width: this._cell.width, height: rows.length })
        if (clipped === null) return
        const penWord = packColor(this._penColor)
        const paperWord = packColor(this._backgroundColor)
        const firstColumn = clipped.x - x
        const lastColumn = firstColumn + clipped.width
        const firstRow = clipped.y - y
        const lastRow = firstRow + clipped.height
        for (let row = firstRow; row < lastRow; row++) {
            const bits = rows[row]
            if (bits === 0 && !opaque) continue
            const base = (y + row) * this._width + x
            for (let column = firstColumn; column < lastColumn; column++) {
                if ((bits & (1 << column)) !== 0) words[base + column] = penWord
                else if (opaque) words[base + column] = paperWord
            }
        }
    }

    /** Moves the whole image, text and graphics alike, up one cell row. */
    private scrollUp(): void {
        const shift = this._cell.height * this._width * BYTES_PER_PIXEL
        const total = this.drawing.length
        if (shift < total) this.drawing.copyWithin(0, shift)
        const from = Math.max(0, total - shift) / BYTES_PER_PIXEL
        imageWords(this.drawing).fill(packColor(this._backgroundColor), from)
    }

    private clampCursor(): void {
        this._cursorColumn = clamp(this._cursorColumn, 0, this.columns - 1)
        this._cursorRow = clamp(this._cursorRow, 0, this.rows - 1)
    }

    // -------------------------------------------------------------- journal

    private journal(pixels: ScreenPixelRecord): void {
        //a memory-backed image is restored by re-reading Core memory after the Core's own rollback,
        //so neither memory mode journals anything (ADR 0005)
        if (this.memoryBacked) return
        const record: ScreenRecord = { state: this.captureState(), pixels }
        if (this.compoundDepth > 0) this.compoundRecords.push(record)
        else this.history.push(record)
    }

    /**
     * Whether copying pixels into a record buys anything. A Screen whose history budget is zero
     * evicts every record as it arrives, so the copy a `patch` carries is allocated and dropped
     * inside the same call — a `clear` and a `present` at 640 by 480 were paying two full image
     * copies a frame for a journal the user had turned off.
     *
     * The record itself is still pushed, as a `none`: `sequence` and `depth` are what
     * `ScreenInstructionHistory` reads to decide that the Screen cannot be rolled back, and a
     * Screen that stopped counting its operations would let a CPU Undo run while the image stayed
     * where it was, which is exactly what [ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)
     * forbids.
     */
    private get journalsPixels(): boolean {
        return !this.memoryBacked && this.history.byteBudget > 0
    }

    private discardCompound(): void {
        this.compoundDepth = 0
        this.compoundRecords = []
    }

    private journalPatch(target: 'drawing' | 'visible', rect: Rect | null): void {
        if (this.memoryBacked) return
        const clipped = rect === null ? null : this.clip(rect)
        if (clipped === null || !this.journalsPixels) {
            this.journal({ kind: 'none' })
            return
        }
        const image = target === 'visible' ? this.visible : this.drawing
        this.journal({ kind: 'patch', target, ...clipped, pixels: this.copyRegion(image, clipped) })
    }

    /**
     * The one pixel `drawPixel` is about to overwrite, as a number rather than a four-byte image.
     * Clipping is the same contract `journalPatch` has: a point outside the Screen overwrites
     * nothing, so its record carries no pixels.
     */
    private journalPixel(target: 'drawing' | 'visible', x: number, y: number): void {
        if (this.memoryBacked) return
        if (!this.journalsPixels || x < 0 || y < 0 || x >= this._width || y >= this._height) {
            this.journal({ kind: 'none' })
            return
        }
        const image = target === 'visible' ? this.visible : this.drawing
        const offset = (y * this._width + x) * BYTES_PER_PIXEL
        this.journal({
            kind: 'pixel',
            target,
            x,
            y,
            value:
                ((image[offset] << 24) |
                    (image[offset + 1] << 16) |
                    (image[offset + 2] << 8) |
                    image[offset + 3]) >>>
                0
        })
    }

    private journalImages(): void {
        if (this.memoryBacked) return
        if (!this.journalsPixels) {
            this.journal({ kind: 'none' })
            return
        }
        this.journal({
            kind: 'images',
            drawing: new Uint8ClampedArray(this.drawing),
            //null records that the two were one array, which is what direct drawing is
            visible: this._doubleBuffering ? new Uint8ClampedArray(this.visible) : null
        })
    }

    /**
     * The scalar state a record restores. Records share one object for as long as none of it has
     * changed, which is what a drawing loop does: a plotting program allocates a thirteen-field
     * snapshot per pixel otherwise, and that alone was worth 1.7 times the throughput of
     * `drawPixel` when it went away.
     *
     * Sharing is decided by comparing the fields rather than by invalidating the cache from every
     * setter, so a scalar that grows a new way of changing cannot leave records holding a state
     * the Screen was never in. The object handed out is never written to: `apply` only reads it,
     * and `endCompoundOperation` only passes it along.
     */
    private captureState(): ScreenState {
        const last = this.lastState
        if (
            last !== null &&
            last.width === this._width &&
            last.height === this._height &&
            last.penColor === this._penColor &&
            last.fillColor === this._fillColor &&
            last.backgroundColor === this._backgroundColor &&
            last.penWidth === this._penWidth &&
            last.penX === this._penX &&
            last.penY === this._penY &&
            last.cursorColumn === this._cursorColumn &&
            last.cursorRow === this._cursorRow &&
            last.cellWidth === this._cell.width &&
            last.cellHeight === this._cell.height &&
            last.doubleBuffering === this._doubleBuffering
        ) {
            return last
        }
        return (this.lastState = {
            width: this._width,
            height: this._height,
            penColor: this._penColor,
            fillColor: this._fillColor,
            backgroundColor: this._backgroundColor,
            penWidth: this._penWidth,
            penX: this._penX,
            penY: this._penY,
            cursorColumn: this._cursorColumn,
            cursorRow: this._cursorRow,
            cellWidth: this._cell.width,
            cellHeight: this._cell.height,
            doubleBuffering: this._doubleBuffering
        })
    }

    private apply(record: ScreenRecord): void {
        if (record.pixels.kind === 'compound') {
            //undoing a compound is undoing the operations inside it newest first, which is exactly
            //what separate Undos would have done; each carries the state it has to restore
            const inner = record.pixels.records
            for (let index = inner.length - 1; index >= 0; index--) this.apply(inner[index])
            return
        }
        const state = record.state
        this._width = state.width
        this._height = state.height
        this._penColor = state.penColor
        this._fillColor = state.fillColor
        this._backgroundColor = state.backgroundColor
        this._penWidth = state.penWidth
        this._penX = state.penX
        this._penY = state.penY
        this._cursorColumn = state.cursorColumn
        this._cursorRow = state.cursorRow
        this._cell = { width: state.cellWidth, height: state.cellHeight }
        this._doubleBuffering = state.doubleBuffering
        const pixels = record.pixels
        if (pixels.kind === 'images') {
            this.drawing = pixels.drawing
            this.visible = pixels.visible ?? pixels.drawing
            this.markVisible()
        } else if (pixels.kind === 'patch') {
            const image = pixels.target === 'visible' ? this.visible : this.drawing
            this.pasteRegion(image, pixels)
            if (image === this.visible) this.markVisible()
        } else if (pixels.kind === 'pixel') {
            const image = pixels.target === 'visible' ? this.visible : this.drawing
            const offset = (pixels.y * this._width + pixels.x) * BYTES_PER_PIXEL
            image[offset] = (pixels.value >>> 24) & 0xff
            image[offset + 1] = (pixels.value >>> 16) & 0xff
            image[offset + 2] = (pixels.value >>> 8) & 0xff
            image[offset + 3] = pixels.value & 0xff
            if (image === this.visible) this.markVisible()
        }
    }

    // --------------------------------------------------------------- pixels

    private newImage(width: number, height: number, color: ScreenColor): Uint8ClampedArray {
        const image = this.takeImage(width * height * BYTES_PER_PIXEL)
        fillImage(image, color)
        return image
    }

    /**
     * An image of `bytes` to draw on, from what the journal dropped if one of the right size is
     * there. Every caller overwrites the whole of it — `newImage` fills it and `present` copies the
     * drawing buffer over it — so what the last owner left in it is never seen.
     */
    private takeImage(bytes: number): Uint8ClampedArray {
        for (let index = this.spareImages.length - 1; index >= 0; index--) {
            if (this.spareImages[index].length !== bytes) continue
            const image = this.spareImages[index]
            this.spareImages.splice(index, 1)
            return image
        }
        return new Uint8ClampedArray(bytes)
    }

    /**
     * Keeps the images of a record the budget dropped, up to `MAX_SPARE_IMAGES`. Only a `patch`
     * holds pixels nothing else can reach: an `images` record's arrays are the ones `apply` hands
     * straight back to the Screen, so a Screen that had been rolled back onto one would then be
     * drawing on a buffer this had also given to someone else.
     */
    private reclaim(record: ScreenRecord): void {
        const pixels = record.pixels
        if (pixels.kind === 'compound') {
            for (const inner of pixels.records) this.reclaim(inner)
            return
        }
        if (pixels.kind !== 'patch') return
        if (this.spareImages.length >= MAX_SPARE_IMAGES) return
        //a patch smaller than the image is not worth keeping: it can only be reused by an
        //operation dirtying exactly the same rectangle, and the pool would fill up with sizes
        //nothing asks for
        if (pixels.pixels.length !== this._width * this._height * BYTES_PER_PIXEL) return
        this.spareImages.push(pixels.pixels)
    }

    private fullRect(): Rect {
        return { x: 0, y: 0, width: this._width, height: this._height }
    }

    /** The rectangle a pen-stroked path dirties: the path plus the pen's overhang on every side. */
    private penBounds(rect: Rect): Rect {
        const before = Math.floor((this._penWidth - 1) / 2)
        const after = this._penWidth - 1 - before
        return {
            x: rect.x - before,
            y: rect.y - before,
            //a line from x1 to x2 covers x2 as well, which the caller's width does not include
            width: rect.width + 1 + before + after,
            height: rect.height + 1 + before + after
        }
    }

    private clip(rect: Rect): Rect | null {
        const left = Math.max(0, rect.x)
        const top = Math.max(0, rect.y)
        const right = Math.min(this._width, rect.x + rect.width)
        const bottom = Math.min(this._height, rect.y + rect.height)
        if (right <= left || bottom <= top) return null
        return { x: left, y: top, width: right - left, height: bottom - top }
    }

    private copyRegion(image: Uint8ClampedArray, rect: Rect): Uint8ClampedArray {
        const pixels = new Uint8ClampedArray(rect.width * rect.height * BYTES_PER_PIXEL)
        const rowBytes = rect.width * BYTES_PER_PIXEL
        for (let row = 0; row < rect.height; row++) {
            const start = ((rect.y + row) * this._width + rect.x) * BYTES_PER_PIXEL
            pixels.set(image.subarray(start, start + rowBytes), row * rowBytes)
        }
        return pixels
    }

    private pasteRegion(
        image: Uint8ClampedArray,
        patch: Rect & { pixels: Uint8ClampedArray }
    ): void {
        const rowBytes = patch.width * BYTES_PER_PIXEL
        for (let row = 0; row < patch.height; row++) {
            const start = ((patch.y + row) * this._width + patch.x) * BYTES_PER_PIXEL
            image.set(patch.pixels.subarray(row * rowBytes, (row + 1) * rowBytes), start)
        }
    }

    private markDrawn(): void {
        //with double buffering on, drawing changes the off-screen image and the renderer has
        //nothing new to paint until `present` (ADR 0006)
        if (!this._doubleBuffering) this.markVisible()
    }

    private markVisible(): void {
        this._dirty = true
        this._version += 1
    }
}

/**
 * The same pixels as one word each, which is what makes a bulk fill a fill: clearing a 640 by 480
 * image byte by byte is 1.2 million stores and about a millisecond, and `Uint32Array.fill` over the
 * same buffer is a memset (measured 20 times faster under node; see the rendering research note).
 * The view is built where it is used rather than kept beside the image, so a resize, an Undo or a
 * buffering change cannot leave a stale one behind.
 */
function imageWords(image: Uint8ClampedArray): Uint32Array {
    return new Uint32Array(image.buffer, image.byteOffset, image.length / BYTES_PER_PIXEL)
}

/** One opaque pixel of a color as the word `imageWords` stores, red first in memory order. */
function packColor(color: ScreenColor): number {
    const red = (color >> 16) & 0xff
    const green = (color >> 8) & 0xff
    const blue = color & 0xff
    return LITTLE_ENDIAN
        ? ((0xff << 24) | (blue << 16) | (green << 8) | red) >>> 0
        : ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0
}

function fillImage(image: Uint8ClampedArray, color: ScreenColor): void {
    imageWords(image).fill(packColor(color))
}

function boundsOf(points: { x: number; y: number }[]): Rect {
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value))
}
