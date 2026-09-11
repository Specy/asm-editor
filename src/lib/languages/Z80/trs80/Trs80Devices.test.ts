import { describe, expect, it } from 'vitest'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import { BLACK, WHITE } from '$lib/languages/peripherals/screen/color'
import { Screen } from '$lib/languages/peripherals/screen/Screen'
import { Trs80Devices } from '$lib/languages/Z80/trs80/Trs80Devices'
import {
    TRS80_BLANK_CELL,
    TRS80_VIDEO_BEGIN,
    TRS80_VIDEO_END
} from '$lib/languages/Z80/trs80/trs80Display'

/**
 * The memory-mapped devices against a real `Screen` and `Keyboard`
 * ([ADR 0020](../../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)): what a
 * store paints, what a matrix read answers, and that nothing here journals.
 */
function makeDevices() {
    const screen = new Screen({ width: 256, height: 192, penColor: WHITE, backgroundColor: BLACK })
    const keyboard = new Keyboard({ holdIntervalMs: 0 })
    const memory = new Uint8Array(0x10000)
    const devices = new Trs80Devices({ screen, keyboard })
    devices.attach(memory)
    return { devices, screen, keyboard, memory }
}

/** A store the way the Core makes one: the hook first, then RAM, which is what `false` asks for. */
function store(devices: Trs80Devices, memory: Uint8Array, address: number, value: number): boolean {
    const handled = devices.noteWrite(address, value)
    if (!handled) memory[address] = value
    return handled
}

function colorAt(screen: Screen, x: number, y: number): number {
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
}

describe('the memory-mapped display', () => {
    it('turns the Screen into the cell grid and blanks video RAM the way the ROM does', () => {
        const { devices, screen, memory } = makeDevices()
        expect(devices.isEnabled).toBe(false)
        devices.enable()
        expect(devices.isEnabled).toBe(true)
        expect(screen.getSize()).toEqual({ width: 512, height: 384 })
        expect(screen.cells).toEqual({ columns: 64, rows: 16 })
        //zeroed RAM would open on 1024 copies of glyph 0 instead of on a blank screen
        expect(memory[TRS80_VIDEO_BEGIN]).toBe(TRS80_BLANK_CELL)
        expect(memory[TRS80_VIDEO_END - 1]).toBe(TRS80_BLANK_CELL)
        expect(memory[TRS80_VIDEO_BEGIN - 1]).toBe(0)
    })

    it('never claims a write, so the Core stores and journals it', () => {
        const { devices, memory } = makeDevices()
        devices.enable()
        expect(store(devices, memory, TRS80_VIDEO_BEGIN, 0x41)).toBe(false)
        expect(store(devices, memory, 0x8000, 0x41)).toBe(false)
        expect(memory[TRS80_VIDEO_BEGIN]).toBe(0x41)
    })

    it('paints a stored cell on the next flush and nothing before it', () => {
        const { devices, screen, memory } = makeDevices()
        devices.enable()
        store(devices, memory, TRS80_VIDEO_BEGIN, 191) //the full block
        expect(colorAt(screen, 0, 0)).toBe(BLACK)
        devices.flush()
        expect(colorAt(screen, 0, 0)).toBe(WHITE)
        expect(colorAt(screen, 7, 23)).toBe(WHITE)
        //the cell next to it was not written
        expect(colorAt(screen, 8, 0)).toBe(BLACK)
    })

    it('flushes only the range that changed', () => {
        const { devices, screen, memory } = makeDevices()
        devices.enable()
        devices.flush()
        //a cell painted behind the device's back: only a flush that covers it will repaint it
        memory[TRS80_VIDEO_BEGIN + 100] = 191
        store(devices, memory, TRS80_VIDEO_BEGIN, 191)
        devices.flush()
        expect(colorAt(screen, 0, 0)).toBe(WHITE)
        const hundredth = { x: (100 % 64) * 8, y: Math.floor(100 / 64) * 24 }
        expect(colorAt(screen, hundredth.x, hundredth.y)).toBe(BLACK)
        //a full re-read is what Undo does, and it picks the stray cell up
        devices.resync()
        expect(colorAt(screen, hundredth.x, hundredth.y)).toBe(WHITE)
    })

    it('journals nothing: the image comes back from memory, not from history', () => {
        const { devices, screen, memory } = makeDevices()
        devices.enable()
        store(devices, memory, TRS80_VIDEO_BEGIN, 191)
        devices.flush()
        expect(screen.canUndo()).toBe(false)
        //the Core rolled the byte back; the display follows by re-reading it
        memory[TRS80_VIDEO_BEGIN] = TRS80_BLANK_CELL
        devices.resync()
        expect(colorAt(screen, 0, 0)).toBe(BLACK)
    })

    it('ignores video stores while the mode is off', () => {
        const { devices, screen, memory } = makeDevices()
        store(devices, memory, TRS80_VIDEO_BEGIN, 191)
        devices.flush()
        expect(screen.getSize()).toEqual({ width: 256, height: 192 })
        expect(colorAt(screen, 0, 0)).toBe(BLACK)
    })

    it('leaves the image alone when the mode is turned off', () => {
        const { devices, screen, memory } = makeDevices()
        devices.enable()
        store(devices, memory, TRS80_VIDEO_BEGIN, 191)
        devices.flush()
        devices.disable()
        expect(screen.cells).toBe(null)
        expect(colorAt(screen, 0, 0)).toBe(WHITE)
    })
})

describe('the keyboard matrix', () => {
    it('answers a row with the keys held in it', () => {
        const { devices, keyboard } = makeDevices()
        devices.enable()
        //row 0 is @ A B C D E F G, so A is bit 1
        expect(devices.readMemory(0x3801)).toBe(0)
        keyboard.pressKey(0x41)
        expect(devices.readMemory(0x3801)).toBe(0b10)
        keyboard.pressKey(0x47)
        expect(devices.readMemory(0x3801)).toBe(0b10000010)
        keyboard.releaseKey(0x41)
        expect(devices.readMemory(0x3801)).toBe(0b10000000)
    })

    it('ORs every row the address selects, which is how a program scans the keyboard', () => {
        const { devices, keyboard } = makeDevices()
        devices.enable()
        keyboard.pressKey(0x41) //row 0 bit 1
        keyboard.pressKey(KEY_CODES.SPACE) //row 6 bit 7
        //a read applies one queued transition, so the second press lands on the second read: that
        //is ADR 0008's hold interval, the same rate the key-state port has always polled at
        expect(devices.readMemory(0x38ff)).toBe(0b10)
        expect(devices.readMemory(0x3801)).toBe(0b10)
        expect(devices.readMemory(0x3840)).toBe(0b10000000)
        expect(devices.readMemory(0x3841)).toBe(0b10000010)
        //every row at once, the `ld a,(0x38ff)` scan
        expect(devices.readMemory(0x38ff)).toBe(0b10000010)
    })

    it('mirrors the four banks', () => {
        const { devices, keyboard } = makeDevices()
        devices.enable()
        keyboard.pressKey(KEY_CODES.ENTER) //row 6 bit 0
        expect(devices.readMemory(0x3840)).toBe(1)
        expect(devices.readMemory(0x3940)).toBe(1)
        expect(devices.readMemory(0x3b40)).toBe(1)
    })

    it('answers nothing for an address it does not decode, so the Core reads RAM', () => {
        const { devices } = makeDevices()
        devices.enable()
        expect(devices.readMemory(0x8000)).toBe(undefined)
        expect(devices.readMemory(0x3c00)).toBe(undefined)
    })

    it('is silent while the mode is off: an ordinary program keeps its RAM at 0x3800', () => {
        const { devices, keyboard } = makeDevices()
        keyboard.pressKey(0x41)
        expect(devices.readMemory(0x3801)).toBe(undefined)
    })

    it('holds nothing down for a key of the machine this keyboard has no equivalent for', () => {
        const { devices } = makeDevices()
        devices.enable()
        //row 5 bit 2 is the machine's ':' key, which is unmapped
        expect(devices.readMemory(0x3820)).toBe(0)
    })
})
