import type { Keyboard } from '$lib/languages/peripherals/Keyboard'
import type { KeyCode } from '$lib/languages/peripherals/keyCodes'
import type { Screen } from '$lib/languages/peripherals/screen/Screen'
import {
    buildGlyphSheet,
    isKeyboardAddress,
    isVideoAddress,
    TRS80_BLANK_CELL,
    TRS80_CELL,
    TRS80_COLUMNS,
    TRS80_KEY_MATRIX,
    TRS80_KEYBOARD_BEGIN,
    TRS80_ROWS,
    TRS80_VIDEO_BEGIN,
    TRS80_VIDEO_END,
    TRS80_VIDEO_SIZE
} from './trs80Display'

/**
 * The TRS-80's memory-mapped devices: the character display at `0x3C00` and the keyboard matrix at
 * `0x3800`, driven through the Core's memory hooks
 * ([ADR 0020](../../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)).
 *
 * The shape is `MarsDevices`': plain TypeScript, no runes, the peripherals injected from the adapter
 * ([ADR 0004](../../../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)), writes
 * collected into a dirty range and flushed once per slice rather than painted one store at a time.
 *
 * Nothing here journals: a memory-backed image is restored by re-reading the memory the Core has
 * already rolled back ([ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
 */

/** Four mirrored banks of 256, which is how a program may address the matrix. */
const KEYBOARD_BANK_SIZE = 0x100

/** What the devices need from the Emulator's peripherals. */
export type Trs80DeviceHost = {
    screen: Screen
    keyboard: Keyboard
}

/**
 * The glyph sheet, rasterized once for the whole app: it is 48 KB of constant data and building it
 * per run would cost a quarter of a million bit tests for nothing.
 */
let sharedGlyphs: Uint8Array | null = null

function glyphSheet(): Uint8Array {
    if (sharedGlyphs === null) sharedGlyphs = buildGlyphSheet()
    return sharedGlyphs
}

export class Trs80Devices {
    private readonly host: Trs80DeviceHost
    /** The machine's RAM, so a flush can re-read the cells that changed. */
    private memory: Uint8Array | null = null
    private enabled = false
    /** The cells written since the last flush, inclusive, or -1 when nothing changed. */
    private dirtyFrom = -1
    private dirtyTo = -1

    constructor(host: Trs80DeviceHost) {
        this.host = host
    }

    /** Whether the memory-mapped display is the Screen's mode right now. */
    get isEnabled(): boolean {
        return this.enabled
    }

    /** The machine whose RAM the display mirrors. Attaching does not itself turn the mode on. */
    attach(memory: Uint8Array): void {
        this.memory = memory
        if (this.enabled) this.blankVideoRam()
    }

    detach(): void {
        this.memory = null
        this.dirtyFrom = -1
        this.dirtyTo = -1
    }

    /**
     * Turns the display on: the Screen becomes a 64 by 16 grid of cells, and video RAM is filled
     * with the blank the ROM's own clear uses, since zeroed RAM would show 1024 copies of glyph 0.
     */
    enable(): void {
        if (this.enabled) return
        this.enabled = true
        this.host.screen.useCells(
            { columns: TRS80_COLUMNS, rows: TRS80_ROWS },
            TRS80_CELL,
            glyphSheet()
        )
        this.blankVideoRam()
    }

    /** Leaves the mode; the image stays until something draws on it, as leaving a framebuffer does. */
    disable(): void {
        if (!this.enabled) return
        this.enabled = false
        this.dirtyFrom = -1
        this.dirtyTo = -1
        this.host.screen.useDrawing()
    }

    /**
     * A memory write the CPU performed. Returns false so the Core stores and journals it: returning
     * true would tell the machine the device consumed the write, and Undo could not roll it back.
     */
    noteWrite(address: number, value: number): boolean {
        if (!this.enabled || !isVideoAddress(address)) return false
        const cell = address - TRS80_VIDEO_BEGIN
        //an unchanged store still costs the cell a repaint only if it is already dirty
        if (this.memory !== null && this.memory[address] === (value & 0xff)) return false
        if (this.dirtyFrom < 0) {
            this.dirtyFrom = cell
            this.dirtyTo = cell
        } else {
            if (cell < this.dirtyFrom) this.dirtyFrom = cell
            if (cell > this.dirtyTo) this.dirtyTo = cell
        }
        return false
    }

    /**
     * A read of the keyboard matrix. The address's low bits select rows and the answer is every
     * selected row OR'ed together, which is how a program scans the whole keyboard in one `ld a,(hl)`.
     * Undefined for any other address, so the Core falls through to RAM.
     */
    readMemory(address: number): number | undefined {
        if (!this.enabled || !isKeyboardAddress(address)) return undefined
        const selector = (address - TRS80_KEYBOARD_BEGIN) % KEYBOARD_BANK_SIZE
        const positions: { row: number; bit: number }[] = []
        const codes: KeyCode[] = []
        for (let row = 0; row < TRS80_KEY_MATRIX.length; row++) {
            if ((selector & (1 << row)) === 0) continue
            const keys = TRS80_KEY_MATRIX[row]
            for (let bit = 0; bit < keys.length; bit++) {
                const code = keys[bit]
                if (code === null) continue
                positions.push({ row, bit })
                codes.push(code)
            }
        }
        if (codes.length === 0) return 0
        //one call for the whole read: a key-state read applies at most one queued transition, and
        //asking key by key would let a single scan burn through the hold interval (ADR 0008)
        const down = this.host.keyboard.areKeysDown(codes)
        let value = 0
        for (let index = 0; index < down.length; index++) {
            if (down[index]) value |= 1 << positions[index].bit
        }
        return value
    }

    /** Copies the cells written since the last call into the Screen. Called at the end of a slice. */
    flush(): void {
        if (this.dirtyFrom < 0) return
        const from = this.dirtyFrom
        const to = this.dirtyTo + 1
        this.dirtyFrom = -1
        this.dirtyTo = -1
        const video = this.videoRam()
        if (video) this.host.screen.syncCells(video, from, to)
    }

    /**
     * Repaints every cell from memory: the path Undo takes, and the one a color change takes, since
     * ink and paper are chosen when the cell is painted.
     */
    resync(): void {
        this.dirtyFrom = -1
        this.dirtyTo = -1
        const video = this.videoRam()
        if (video) this.host.screen.syncCells(video, 0, TRS80_VIDEO_SIZE)
    }

    // -------------------------------------------------------------- internals

    /** The 1 KB of video RAM as a view, indexed by cell: no copy, and always the live bytes. */
    private videoRam(): Uint8Array | null {
        if (!this.enabled || this.memory === null) return null
        return this.memory.subarray(TRS80_VIDEO_BEGIN, TRS80_VIDEO_END)
    }

    /**
     * Fills video RAM with blanks, which is what the ROM's clear does. Written straight into the
     * machine's RAM rather than through `writeMemory`: this runs on the reset path, where the
     * history is empty, and the Core documents direct access as bypassing the hooks and the journal.
     */
    private blankVideoRam(): void {
        if (this.memory === null) return
        this.memory.fill(TRS80_BLANK_CELL, TRS80_VIDEO_BEGIN, TRS80_VIDEO_END)
        this.resync()
    }
}
