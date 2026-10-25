/**
 * The shapes the Pixel editor's tools draw, as the pixels they cover
 * ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decision 8). Pure, so they are
 * tested without a canvas.
 */

export type Point = readonly [x: number, y: number]

export type PixelTool =
    | 'pencil'
    | 'line'
    | 'rectangle'
    | 'ellipse'
    | 'fill'
    | 'eyedropper'
    | 'erase'

/** The tools in the toolbar's order, with their keys ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md), decision 9). */
export const TOOL_KEYS: Readonly<Record<string, PixelTool>> = {
    b: 'pencil',
    l: 'line',
    u: 'rectangle',
    o: 'ellipse',
    g: 'fill',
    i: 'eyedropper',
    e: 'erase'
}

/**
 * Pixels as the rows they make: `y`, and the first and last `x` of each run of a row, both
 * included. A thick line or a large ellipse is a few thousand runs where it is a million pixels, so
 * they are drawn a run at a time and each pixel plotted once.
 */
export type Run = readonly [y: number, x0: number, x1: number]

/** The shape of the Pencil's and the Eraser's brush. */
export type BrushShape = 'round' | 'square'
/** The widest brush and line, in pixels. */
export const BRUSH_SIZE_MAX = 32

const brushes = new Map<string, readonly Run[]>()

/**
 * The runs a brush `size` pixels across covers about the point it is put on, as offsets from it:
 * every pixel of a square one; of a round one, those whose centre is within its radius, a little
 * less, so that 3 is a plus and 5 a circle, as pixel art draws them.
 */
export function brushRuns(size: number, shape: BrushShape): readonly Run[] {
    const key = `${size}${shape}`
    const kept = brushes.get(key)
    if (kept) return kept
    const low = -Math.floor((size - 1) / 2)
    const centre = (size - 1) / 2
    const radius = size / 2
    const runs: Run[] = []
    for (let dy = 0; dy < size; dy++) {
        let first: number | undefined
        let last = 0
        for (let dx = 0; dx < size; dx++) {
            const distance = (dx - centre) ** 2 + (dy - centre) ** 2
            if (shape === 'round' && distance > radius * (radius - 0.5)) continue
            first ??= dx
            last = dx
        }
        if (first !== undefined) runs.push([low + dy, low + first, low + last])
    }
    brushes.set(key, runs)
    return runs
}

/**
 * Runs that cover the same pixels, each once: those of a row sorted, and those that overlap or
 * touch joined.
 */
export function mergeRuns(runs: Iterable<Run>): Run[] {
    const rows = new Map<number, [number, number][]>()
    for (const [y, x0, x1] of runs) {
        const row = rows.get(y)
        if (row) row.push([x0, x1])
        else rows.set(y, [[x0, x1]])
    }
    const merged: Run[] = []
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
        const row = rows.get(y)!.sort((a, b) => a[0] - b[0])
        let [x0, x1] = row[0]
        for (const [next0, next1] of row.slice(1)) {
            if (next0 <= x1 + 1) x1 = Math.max(x1, next1)
            else {
                merged.push([y, x0, x1])
                ;[x0, x1] = [next0, next1]
            }
        }
        merged.push([y, x0, x1])
    }
    return merged
}

/** The runs a brush covers put on each pixel of a line from one end to the other. */
export function brushLineRuns(from: Point, to: Point, brush: readonly Run[]): Run[] {
    const runs: Run[] = []
    for (const [x, y] of linePoints(from, to))
        for (const [dy, dx0, dx1] of brush) runs.push([y + dy, x + dx0, x + dx1])
    return mergeRuns(runs)
}

/**
 * The far corner of a circle's box dragged from `from` towards `to`: a square as wide as the
 * larger side of the drag, the way it goes.
 */
export function circleCorner(from: Point, to: Point): Point {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return [from[0] + (dx < 0 ? -side : side), from[1] + (dy < 0 ? -side : side)]
}

/**
 * The runs of the ellipse that fills the box two corners make, both included: the pixels whose
 * centre is inside it, every row at least its middle pixel or two, so that a thin one reaches the
 * box's ends; or of its outline, those of them with a neighbour above, below or beside them
 * outside it, a line one pixel thick.
 */
export function ellipseRuns(from: Point, to: Point, filled: boolean): Run[] {
    const [left, right] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])]
    const [top, bottom] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])]
    //the centre and the half-axes, on the pixels' edges
    const cx = (left + right + 1) / 2
    const cy = (top + bottom + 1) / 2
    const a = (right - left + 1) / 2
    const b = (bottom - top + 1) / 2
    const rows: [number, number][] = []
    for (let y = top; y <= bottom; y++) {
        const dy = (y + 0.5 - cy) / b
        const half = a * Math.sqrt(Math.max(0, 1 - dy * dy))
        let x0 = Math.ceil(cx - half - 0.5)
        let x1 = Math.floor(cx + half - 0.5)
        if (x0 > x1) [x0, x1] = [Math.floor(cx - 0.5), Math.ceil(cx - 0.5)]
        rows.push([Math.max(left, x0), Math.min(right, x1)])
    }
    if (filled) return rows.map(([x0, x1], index) => [top + index, x0, x1])
    const runs: Run[] = []
    rows.forEach(([x0, x1], index) => {
        const y = top + index
        const [above, below] = [rows[index - 1], rows[index + 1]]
        //the pixels inside it on all four sides
        const inner0 = above && below ? Math.max(x0 + 1, above[0], below[0]) : Infinity
        const inner1 = above && below ? Math.min(x1 - 1, above[1], below[1]) : -Infinity
        if (inner0 > inner1) runs.push([y, x0, x1])
        else {
            if (inner0 > x0) runs.push([y, x0, inner0 - 1])
            if (inner1 < x1) runs.push([y, inner1 + 1, x1])
        }
    })
    return runs
}

/** Each pixel of `runs` inside a picture of `size`, handed to `plot`. */
export function plotRuns(
    runs: readonly Run[],
    plot: Plot,
    size: { width: number; height: number } = { width: Infinity, height: Infinity }
) {
    for (const [y, x0, x1] of runs) {
        if (y < 0 || y >= size.height) continue
        for (let x = Math.max(0, x0); x <= Math.min(x1, size.width - 1); x++) plot(x, y)
    }
}

/** The pixels of a straight line from one end to the other, both included, by Bresenham's rule. */
export function linePoints(from: Point, to: Point): Point[] {
    let [x, y] = from
    const [x1, y1] = to
    const dx = Math.abs(x1 - x)
    const dy = -Math.abs(y1 - y)
    const sx = x < x1 ? 1 : -1
    const sy = y < y1 ? 1 : -1
    let error = dx + dy
    const points: Point[] = []
    for (;;) {
        points.push([x, y])
        if (x === x1 && y === y1) return points
        const twice = 2 * error
        if (twice >= dy) {
            error += dy
            x += sx
        }
        if (twice <= dx) {
            error += dx
            y += sy
        }
    }
}

/** The end of a line from `from` towards `to`, turned to the nearest of 0°, 45° and 90°. */
export function snapLine(from: Point, to: Point): Point {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const [ax, ay] = [Math.abs(dx), Math.abs(dy)]
    //within half of 45° of an axis, along it; else on the diagonal
    if (ay * 2.414 < ax) return [to[0], from[1]]
    if (ax * 2.414 < ay) return [from[0], to[1]]
    const length = Math.max(ax, ay)
    return [from[0] + Math.sign(dx) * length, from[1] + Math.sign(dy) * length]
}

/** Called with each pixel a shape covers. */
export type Plot = (x: number, y: number) => void

/**
 * The pixels of a rectangle between two corners, both included: its outline, or all of it, those
 * inside a picture of `size` alone, so one dragged far past the picture costs what it covers of
 * it. Handed to `plot` one at a time, since a filled 2048 × 2048 rectangle is four million of them.
 */
export function plotRectangle(
    from: Point,
    to: Point,
    filled: boolean,
    plot: Plot,
    size: { width: number; height: number } = { width: Infinity, height: Infinity }
) {
    const [left, right] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])]
    const [top, bottom] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])]
    const [first, last] = [Math.max(left, 0), Math.min(right, size.width - 1)]
    for (let y = Math.max(top, 0); y <= Math.min(bottom, size.height - 1); y++) {
        const edge = y === top || y === bottom
        if (filled || edge) for (let x = first; x <= last; x++) plot(x, y)
        else {
            if (left >= 0 && left < size.width) plot(left, y)
            if (right !== left && right >= 0 && right < size.width) plot(right, y)
        }
    }
}

/**
 * The pixels a flood fill from `start` reaches, handed to `plot`: those of the same kind as it,
 * joined through their four neighbours up, down, left and right, so a fill never leaks through a
 * diagonal gap in an outline. `kindAt` names a pixel's colour, or its palette index in a palette
 * picture; it is read before any pixel is plotted, so `plot` may change them.
 */
export function floodFill(
    width: number,
    height: number,
    start: Point,
    kindAt: (x: number, y: number) => number,
    plot: Plot
) {
    const [sx, sy] = start
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return
    const target = kindAt(sx, sy)
    const seen = new Uint8Array(width * height)
    const reached: number[] = []
    const stack: number[] = [sy * width + sx]
    seen[sy * width + sx] = 1
    while (stack.length) {
        const index = stack.pop()!
        reached.push(index)
        const x = index % width
        const y = (index - x) / width
        const visit = (nx: number, ny: number) => {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
            const next = ny * width + nx
            if (seen[next] || kindAt(nx, ny) !== target) return
            seen[next] = 1
            stack.push(next)
        }
        visit(x - 1, y)
        visit(x + 1, y)
        visit(x, y - 1)
        visit(x, y + 1)
    }
    for (const index of reached) plot(index % width, Math.floor(index / width))
}
