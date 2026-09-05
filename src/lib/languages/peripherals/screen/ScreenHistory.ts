import type { ScreenColor } from './color'

/**
 * The Screen's Undo journal. Undo has to restore the whole program-visible Screen state at the
 * instruction boundary the Core rolls back to ([ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)),
 * so every operation pushes one inverse record: the scalar state as it was, plus the pixels the
 * operation is about to overwrite. Drawing primitives copy only their dirty rectangle; a clear, a
 * present, a flood fill (whose extent is not known before it runs) and a text run that scrolls copy
 * a whole image, and a resize copies both.
 *
 * Whole images are over a megabyte at 640 by 480, so the journal has a byte budget and drops its
 * oldest records when it is exceeded, which is what makes the Undo depth "the smaller of the Core's
 * history and the Screen's history within the budget". Records are only ever undone newest first,
 * so dropping the oldest keeps the rest a valid suffix; a single record larger than the whole budget
 * leaves nothing behind, because keeping older records without it would restore state out of order.
 *
 * Plain TypeScript with no Svelte runes: the Screen is driven from inside a Core's synchronous
 * execution and this module has to run under node.
 */

/** Everything a program can observe about the Screen apart from the pixels. */
export type ScreenState = {
    width: number
    height: number
    penColor: ScreenColor
    fillColor: ScreenColor
    backgroundColor: ScreenColor
    penWidth: number
    penX: number
    penY: number
    cursorColumn: number
    cursorRow: number
    cellWidth: number
    cellHeight: number
    doubleBuffering: boolean
}

/** The pixels an operation overwrote, if any. */
export type ScreenPixelRecord =
    | { kind: 'none' }
    | {
          kind: 'patch'
          target: 'drawing' | 'visible'
          x: number
          y: number
          width: number
          height: number
          pixels: Uint8ClampedArray
      }
    /** Both images, for the operations that replace them: resize and the buffering mode. A null
     * visible image means the two were the same array, which is how direct drawing is represented. */
    | { kind: 'images'; drawing: Uint8ClampedArray; visible: Uint8ClampedArray | null }

export type ScreenRecord = {
    state: ScreenState
    pixels: ScreenPixelRecord
}

/**
 * What one record costs beyond its pixels. The scalar state is a dozen numbers; the constant is
 * deliberately generous so that a program setting the pen color in a tight loop is still bounded by
 * the budget instead of by the garbage collector.
 */
export const RECORD_OVERHEAD_BYTES = 64

/** Phase 8 measures the animation examples and sets the shipped default; this is a starting point. */
export const DEFAULT_SCREEN_HISTORY_BYTES = 32 * 1024 * 1024

export function recordBytes(record: ScreenRecord): number {
    const pixels = record.pixels
    if (pixels.kind === 'patch') return RECORD_OVERHEAD_BYTES + pixels.pixels.byteLength
    if (pixels.kind === 'images') {
        return RECORD_OVERHEAD_BYTES + pixels.drawing.byteLength + (pixels.visible?.byteLength ?? 0)
    }
    return RECORD_OVERHEAD_BYTES
}

export class ScreenHistory {
    private readonly records: ScreenRecord[] = []
    private costs: number[] = []
    private _bytes = 0
    private _sequence = 0
    private _byteBudget: number

    constructor(byteBudget: number = DEFAULT_SCREEN_HISTORY_BYTES) {
        this._byteBudget = Math.max(0, byteBudget)
    }

    /** How many bytes of pixels and bookkeeping the retained records hold. */
    get bytes(): number {
        return this._bytes
    }

    /** How many operations can still be undone. */
    get depth(): number {
        return this.records.length
    }

    /**
     * How many operations have been recorded and not yet undone since the last reset. It survives
     * eviction, so a caller that noted the sequence before running a slice can ask for exactly the
     * Screen operations of that slice back, and learn from `undoToSequence` whether the budget ate
     * some of them.
     */
    get sequence(): number {
        return this._sequence
    }

    get byteBudget(): number {
        return this._byteBudget
    }

    /** The user setting; lowering it drops the oldest records immediately, like a push would. */
    set byteBudget(bytes: number) {
        this._byteBudget = Math.max(0, bytes)
        this.evict()
    }

    canUndo(): boolean {
        return this.records.length > 0
    }

    push(record: ScreenRecord): void {
        this.records.push(record)
        this.costs.push(recordBytes(record))
        this._bytes += this.costs[this.costs.length - 1]
        this._sequence++
        this.evict()
    }

    pop(): ScreenRecord | undefined {
        const record = this.records.pop()
        if (record === undefined) return undefined
        this._bytes -= this.costs.pop() ?? 0
        this._sequence--
        return record
    }

    clear(): void {
        this.records.length = 0
        this.costs = []
        this._bytes = 0
        this._sequence = 0
    }

    private evict(): void {
        while (this._bytes > this._byteBudget && this.records.length > 0) {
            this.records.shift()
            this._bytes -= this.costs.shift() ?? 0
        }
    }
}
