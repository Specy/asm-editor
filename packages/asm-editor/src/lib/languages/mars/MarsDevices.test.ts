import { describe, expect, it } from 'vite-plus/test'
import { ExecutionController } from '#lib/languages/ExecutionController.ts'
import { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import { Mouse } from '#lib/languages/peripherals/Mouse.ts'
import {
    INPUT_BASE,
    INPUT_EVENT,
    INPUT_KEYS,
    INPUT_POINTER,
    INPUT_STATUS
} from '#lib/languages/inputControllerRegisters.ts'
import { Screen } from '#lib/languages/peripherals/screen/Screen.ts'
import { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
import {
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_TRANSMITTER_DATA,
    MarsDevices,
    type MarsCore
} from '#lib/languages/mars/MarsDevices.ts'
import { DEFAULT_PROJECT_DISPLAY } from '#lib/languages/mars/marsDisplay.ts'

/**
 * The memory-mapped devices against a fake Core and the real Terminal, for the behavior that
 * depends on the run rather than on the program: the receiver register reads its keystrokes through
 * the Terminal, which answers a Testcase's scripted lines and otherwise what the user types, and
 * never live Screen input during a scripted run
 * ([ADR 0009](../../../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)). The
 * register semantics a program sees are covered end to end against the real Cores in
 * `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts`.
 */

/** A small grid, so `attach` reads back 64 words instead of 128 KB. */
const SMALL = { ...DEFAULT_PROJECT_DISPLAY, width: 64, height: 64, unitWidth: 8, unitHeight: 8 }

type AccessObserver = (address: number, value: number) => void

function makeTerminal() {
    const executionController = new ExecutionController(() => {})
    return {
        terminal: new Terminal({ executionController }),
        execution: executionController.capture()
    }
}

function makeDevices() {
    const words = new Map<number, number>()
    const reads = new Map<number, AccessObserver>()
    const writes = new Map<number, AccessObserver>()
    let nextHandle = 1
    const core: MarsCore = {
        readMemoryBytes: () => [0, 0, 0, 0],
        setPeripheralWord: (address, value) => words.set(address >>> 0, value),
        addMemoryWriteObserver: () => nextHandle++,
        addMemoryAccessObserver: (address, onRead, onWrite) => {
            if (onRead) reads.set(address >>> 0, onRead)
            if (onWrite) writes.set(address >>> 0, onWrite)
            return nextHandle++
        },
        removeMemoryObserver: () => {}
    }
    const keyboard = new Keyboard()
    const { terminal, execution } = makeTerminal()
    const devices = new MarsDevices({
        screen: new Screen({ width: 64, height: 64 }),
        keyboard,
        terminal
    })
    devices.attach(core, SMALL)
    return {
        devices,
        keyboard,
        terminal,
        execution,
        /** What the device last stored in a register, which is what a program's `lw` would read. */
        wordAt: (address: number) => words.get(address >>> 0) ?? 0,
        /** The program reading the data register, which is what frees it for the next character. */
        readData: () => reads.get(MARS_RECEIVER_DATA >>> 0)?.(MARS_RECEIVER_DATA, 0),
        /** The program storing a character in the transmitter data register. */
        transmit: (value: number) =>
            writes.get(MARS_TRANSMITTER_DATA >>> 0)?.(MARS_TRANSMITTER_DATA, value)
    }
}

describe('the MARS receiver register', () => {
    it('takes a typed character while the user is running the program', () => {
        const { keyboard, wordAt } = makeDevices()
        keyboard.typeText('A')
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_READY_BIT)
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('A'.charCodeAt(0))
    })

    it('leaves live input alone during a scripted run', () => {
        const { keyboard, terminal, wordAt } = makeDevices()
        //a Testcase selects the scripted Input Source for the whole run (ADR 0009): a keystroke the
        //user aims at the Screen panel while it runs is not the program's input
        terminal.useScriptedInput([])
        keyboard.typeText('A')
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(0)
        expect(wordAt(MARS_RECEIVER_DATA)).toBe(0)
        //and it is still there for the interactive run that follows
        expect(keyboard.hasTypedInput()).toBe(true)
    })

    it('picks the queue back up once the run is the user’s again', () => {
        const { keyboard, terminal, readData, wordAt } = makeDevices()
        terminal.useScriptedInput([])
        keyboard.typeText('AB')
        terminal.useInteractiveInput()
        keyboard.typeText('C')
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('A'.charCodeAt(0))
        readData()
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('B'.charCodeAt(0))
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_READY_BIT)
    })

    it('answers scripted input a byte at a time, each line ending with a newline', () => {
        //as EASy68K's task 7 and the Z80's key port answer it, rather than leaving a Testcase of a
        //keyboard-driven program nothing to type
        const { terminal, readData, wordAt } = makeDevices()
        terminal.useScriptedInput(['hi'])
        const received: number[] = []
        while (wordAt(MARS_RECEIVER_CONTROL) === MARS_READY_BIT) {
            received.push(wordAt(MARS_RECEIVER_DATA))
            readData()
        }
        expect(String.fromCharCode(...received)).toBe('hi\n')
    })

    it('shows a scripted keystroke without taking it from a read syscall that wants the line', async () => {
        const { terminal, execution, wordAt } = makeDevices()
        terminal.useScriptedInput(['42'])
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('4'.charCodeAt(0))
        //the program never read the register, so the whole line is still the read syscall's
        expect(await terminal.readAsync('q', execution)).toBe('42')
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(0)
    })

    it('takes what is typed in the Terminal, after what is typed on the Screen', () => {
        const { keyboard, terminal, readData, wordAt } = makeDevices()
        terminal.insertText('t')
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('t'.charCodeAt(0))
        keyboard.typeText('s')
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('s'.charCodeAt(0))
        readData()
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('t'.charCodeAt(0))
        readData()
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(0)
    })

    it('does not take a keystroke from a read waiting on the same queue', async () => {
        const { terminal, execution, wordAt } = makeDevices()
        terminal.attachConsole()
        const read = terminal.readAsync('q', execution)
        terminal.insertText('x')
        //the register shows the keystroke, but only reading it would take it
        terminal.pressEnter()
        expect(await read).toBe('x')
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(0)
    })
})

describe('the MARS transmitter register', () => {
    it('clears the output on a form feed, and only the output', async () => {
        const { terminal, execution, transmit } = makeDevices()
        terminal.useScriptedInput(['abc'])
        //a short read of standard input leaves the rest of its line with the Terminal
        expect(await terminal.readStandardInput(1, 'q', execution)).toEqual(Uint8Array.of(0x61))
        transmit(0x41)
        transmit(12)
        transmit(0x42)
        expect(terminal.output).toBe('B')
        const rest = await terminal.readStandardInput(8, 'q', execution)
        expect(new TextDecoder().decode(rest)).toBe('bc\n')
    })

    it('prints none of the restoring stores an Undo makes', () => {
        //the Core's undo puts the register's old byte back through an observed store, while the
        //Terminal rewinds through its own history (ADR 0057): a restored form feed must not clear
        //the output, nor a restored character print
        const { devices, terminal, transmit } = makeDevices()
        transmit(0x41)
        devices.rewind(() => transmit(12))
        devices.rewind(() => transmit(0x5a))
        expect(terminal.output).toBe('A')
        transmit(0x42)
        expect(terminal.output).toBe('AB')
    })

    it('leaves a read in progress waiting through a form feed', async () => {
        const { terminal, execution, transmit } = makeDevices()
        terminal.attachConsole()
        const read = terminal.readAsync('q', execution)
        terminal.insertText('o')
        transmit(12)
        terminal.insertText('k')
        terminal.pressEnter()
        expect(await read).toBe('ok')
    })
})

/**
 * The bitmap display's flush. The grid is mirrored host-side and re-read from the Core between
 * slices, and what a flush asks the Core for is the thing worth pinning: reading the whole grid
 * because two scattered words changed is what cost this 47% of the wall clock before the dirty map.
 */

/** 256 words across and 4 down, so the grid is exactly four `DIRTY_BLOCK_WORDS` blocks. */
const FOUR_BLOCKS = {
    ...DEFAULT_PROJECT_DISPLAY,
    width: 256,
    height: 4,
    unitWidth: 1,
    unitHeight: 1
}
const BLOCK = 256
const BASE = DEFAULT_PROJECT_DISPLAY.baseAddress

/** `segmentWords`: how many words from the grid's start the Core reads before its segment ends. */
function makeFramebuffer(display = FOUR_BLOCKS, segmentWords = Infinity) {
    type WriteObserver = (address: number, length: number, value: number) => void
    let onWrite: WriteObserver | null = null
    /** Every `readMemoryBytes` a flush made, as word ranges. */
    const reads: { from: number; length: number }[] = []
    /** What the Core "holds", so a read can answer with something a test can recognize. */
    const memory = new Map<number, number>()
    let nextHandle = 1
    const core: MarsCore = {
        readMemoryBytes: (address, length) => {
            const from = ((address >>> 0) - BASE) >>> 2
            if (from + length / 4 > segmentWords) throw new Error('Address out of range')
            reads.push({ from, length: length / 4 })
            const bytes: number[] = []
            for (let index = 0; index < length / 4; index++) {
                const word = memory.get(from + index) ?? 0
                bytes.push(word & 0xff, (word >> 8) & 0xff, (word >> 16) & 0xff, 0)
            }
            return bytes
        },
        setPeripheralWord: () => {},
        addMemoryWriteObserver: (_start, _end, handler) => {
            onWrite = handler
            return nextHandle++
        },
        addMemoryAccessObserver: () => nextHandle++,
        removeMemoryObserver: () => {}
    }
    const screen = new Screen({ width: 64, height: 64 })
    const devices = new MarsDevices({
        screen,
        keyboard: new Keyboard(),
        terminal: makeTerminal().terminal
    })
    devices.attach(core, display)
    reads.length = 0
    return {
        devices,
        screen,
        reads,
        /** A program storing `value` at word `index` of the grid. */
        store(index: number, value: number) {
            memory.set(index, value)
            onWrite?.(((BASE + index * 4) >>> 0) | 0, 4, value)
        }
    }
}

describe('the MARS bitmap display flush', () => {
    it('reads only the blocks a scattered pair of stores touched', () => {
        const { store, reads, devices } = makeFramebuffer()
        //the worst case for a single minimum-to-maximum interval: opposite ends of the grid
        store(0, 0xff0000)
        store(4 * BLOCK - 1, 0x0000ff)
        devices.flush()
        expect(reads).toEqual([
            { from: 0, length: BLOCK },
            { from: 3 * BLOCK, length: BLOCK }
        ])
    })

    it('shows those stores on the Screen all the same', () => {
        const { store, devices, screen } = makeFramebuffer()
        store(0, 0xff0000)
        store(4 * BLOCK - 1, 0x0000ff)
        devices.flush()
        expect(screen.getPixel(0, 0)).toBe(0xff0000)
        //the grid is 256 wide, so the last word of the last block is the last pixel of row 3
        expect(screen.getPixel(255, 3)).toBe(0x0000ff)
    })

    it('reads one range for stores inside the same block', () => {
        const { store, reads, devices } = makeFramebuffer()
        store(1, 0x111111)
        store(2, 0x222222)
        store(BLOCK - 1, 0x333333)
        devices.flush()
        expect(reads).toEqual([{ from: 0, length: BLOCK }])
    })

    it('reads one range for neighbouring blocks', () => {
        const { store, reads, devices } = makeFramebuffer()
        store(BLOCK - 1, 0x111111)
        store(BLOCK, 0x222222)
        devices.flush()
        expect(reads).toEqual([{ from: 0, length: 2 * BLOCK }])
    })

    it('reads the whole grid when a program writes all of it, as one range', () => {
        const { store, reads, devices } = makeFramebuffer()
        for (let index = 0; index < 4 * BLOCK; index += 7) store(index, index)
        devices.flush()
        expect(reads).toEqual([{ from: 0, length: 4 * BLOCK }])
    })

    it('reads a grid running past the end of its segment up to that end', () => {
        for (const segmentWords of [0, 1, 3 * BLOCK + 5]) {
            const { reads, devices } = makeFramebuffer(FOUR_BLOCKS, segmentWords)
            devices.resync()
            expect(reads).toEqual(segmentWords ? [{ from: 0, length: segmentWords }] : [])
        }
    })

    it('flushes nothing when nothing was written', () => {
        const { reads, devices } = makeFramebuffer()
        devices.flush()
        expect(reads).toEqual([])
    })

    it('forgets the dirty blocks once they are flushed', () => {
        const { store, reads, devices } = makeFramebuffer()
        store(0, 0x111111)
        devices.flush()
        reads.length = 0
        devices.flush()
        expect(reads).toEqual([])
    })

    it('collapses to one span when the stores are scattered over more runs than the cap', () => {
        //a grid with more blocks than the cap, so alternating blocks make too many runs to be
        //worth a call each
        const many = {
            ...DEFAULT_PROJECT_DISPLAY,
            width: 256,
            height: 40,
            unitWidth: 1,
            unitHeight: 1
        }
        const { store, reads, devices } = makeFramebuffer(many)
        for (let block = 0; block < 40; block += 2) store(block * BLOCK, 0x111111)
        devices.flush()
        expect(reads).toEqual([{ from: 0, length: 39 * BLOCK }])
    })
})

it('reports the fixed MMIO block and the bitmap bounds after its geometry moves', () => {
    const { devices } = makeDevices()
    expect(devices.regions()).toEqual([
        { name: 'MMIO', start: 0xffff0000n, end: 0xffff0010n },
        { name: 'Input controller', start: 0xffff0300n, end: 0xffff0340n },
        {
            name: 'Bitmap display',
            start: BigInt(SMALL.baseAddress),
            end: BigInt(SMALL.baseAddress) + 256n
        }
    ])
    devices.setDisplay({ ...SMALL, baseAddress: 0x10020000, width: 128 })
    expect(devices.regions()[2]).toEqual({
        name: 'Bitmap display',
        start: 0x10020000n,
        end: 0x10020200n
    })
})

/**
 * The Input controller as the devices feed it: the Keyboard's physical keys and the Mouse's
 * buttons, moves and wheel, focus loss, the gate the adapter holds, and the display covering it.
 */
describe('the Input controller, fed by the Keyboard and the Mouse', () => {
    function makeInput(options: { open?: boolean; display?: typeof SMALL } = {}) {
        const words = new Map<number, number>()
        const reads = new Map<number, AccessObserver>()
        const ranges: [number, number, (address: number, length: number, value: number) => void][] =
            []
        let nextHandle = 1
        const core: MarsCore = {
            readMemoryBytes: (address, length) => {
                const word = words.get(((address >>> 0) & ~3) >>> 0) ?? 0
                return Array.from({ length }, (_, i) => (word >>> (((address + i) & 3) * 8)) & 0xff)
            },
            setPeripheralWord: (address, value) => words.set(address >>> 0, value),
            addMemoryWriteObserver: (start, end, handler) => {
                ranges.push([start >>> 0, end >>> 0, handler])
                return nextHandle++
            },
            addMemoryAccessObserver: (address, onRead) => {
                if (onRead) reads.set(address >>> 0, onRead)
                return nextHandle++
            },
            removeMemoryObserver: () => {}
        }
        let open = options.open ?? true
        const screen = new Screen({ width: 64, height: 64 })
        const keyboard = new Keyboard()
        const mouse = new Mouse({ screen, keyboard })
        const { terminal } = makeTerminal()
        const devices = new MarsDevices({
            screen,
            keyboard,
            terminal,
            mouse,
            inputOpen: () => open
        })
        devices.attach(core, options.display ?? SMALL)
        const word = (offset: number) => (words.get((INPUT_BASE + offset) >>> 0) ?? 0) >>> 0
        return {
            core,
            devices,
            keyboard,
            mouse,
            word,
            setOpen: (value: boolean) => (open = value),
            read: () => {
                const value = word(INPUT_EVENT)
                reads.get((INPUT_BASE + INPUT_EVENT) >>> 0)?.(INPUT_BASE + INPUT_EVENT, value)
                return value
            },
            /** A program store into the block, as the range observer hears it. */
            store: (offset: number, value: number) => {
                const address = (INPUT_BASE + offset) >>> 0
                words.set(address, value)
                for (const [start, end, handler] of ranges)
                    if (address >= start && address <= end + 3) handler(address | 0, 4, value)
            }
        }
    }
    const kinds = (records: readonly number[]) => records.map((record) => (record >>> 8) & 7)
    const codes = (records: readonly number[]) => records.map((record) => record & 0xff)
    const key = (code: string, repeat = false) => ({ code, key: code, repeat })

    it('reports every physical key, including those EASy68K has no code for', () => {
        const { devices, keyboard } = makeInput()
        keyboard.keyDown(key('IntlBackslash'))
        keyboard.keyDown(key('ShiftRight'))
        keyboard.keyUp(key('ShiftRight'))
        expect(codes(devices.input.pending)).toEqual([0x64, 0xe5, 0xe5])
        expect(kinds(devices.input.pending)).toEqual([1, 1, 2])
        //the Keyboard's own state is EASy68K's, unchanged: one Shift for both
        expect(keyboard.lastKeys()).toEqual({ down: 0x10, up: 0x10 })
    })

    it('counts a repeat of a key it never saw go down as a key down, and ignores a stray key-up', () => {
        const { devices, keyboard, setOpen } = makeInput({ open: false })
        keyboard.keyDown(key('ArrowRight'))
        setOpen(true)
        keyboard.keyUp(key('KeyZ'))
        keyboard.keyDown(key('ArrowRight', true))
        keyboard.keyDown(key('ArrowRight', true))
        expect(kinds(devices.input.pending)).toEqual([1, 3])
    })

    it('releases every held key and button with an ordinary up when the Screen loses focus', () => {
        const { devices, keyboard, mouse, word } = makeInput()
        keyboard.keyDown(key('KeyW'))
        keyboard.keyDown(key('AltRight'))
        mouse.buttonDown('right', 4, 5)
        keyboard.releaseAll()
        mouse.releaseAll()
        expect(kinds(devices.input.pending)).toEqual([1, 1, 4, 2, 2, 5])
        expect(codes(devices.input.pending).slice(3)).toEqual([0x1a, 0xe6, 2])
        for (let offset = INPUT_KEYS; offset < 0x40; offset += 4) expect(word(offset)).toBe(0)
        expect(word(INPUT_POINTER) & 7).toBe(0)
    })

    it('takes the pointer and the buttons from the Mouse, and the wheel at its position', () => {
        const { devices, mouse, word, read } = makeInput()
        //the Screen is 8 by 8 logical pixels here, and the Mouse clamps to it
        mouse.moveTo(3, 4)
        expect(word(INPUT_POINTER)).toBe((4 << 21) | (3 << 11))
        mouse.buttonDown('middle', 6, 2)
        expect(word(INPUT_POINTER)).toBe((2 << 21) | (6 << 11) | 4)
        mouse.wheel(2, 20, 20)
        expect(word(INPUT_STATUS)).toBe(2)
        expect(read()).toBe((2 << 21) | (6 << 11) | (4 << 8) | 3)
        expect(read()).toBe((7 << 21) | (7 << 11) | (6 << 8) | 2)
        expect(devices.input.pending).toEqual([])
    })

    it('hears nothing while the adapter says the program takes no input', () => {
        const { devices, keyboard, mouse, word } = makeInput({ open: false })
        keyboard.keyDown(key('KeyA'))
        mouse.moveTo(3, 3)
        mouse.buttonDown('left')
        mouse.wheel(1)
        expect(devices.input.pending).toEqual([])
        expect(word(INPUT_POINTER)).toBe(0)
    })

    it('is off while the display covers its block, and leaves its words to the display', () => {
        const covering = { ...SMALL, baseAddress: 0xffff0000, width: 512, height: 512 }
        const { devices, keyboard, word, store } = makeInput({ display: covering })
        expect(devices.regions().map((region) => region.name)).not.toContain('Input controller')
        keyboard.keyDown(key('KeyA'))
        //a pixel, which a store sets and the device leaves alone
        expect(word(0)).toBe(0)
        store(INPUT_STATUS, 0xff0000)
        expect(word(INPUT_STATUS)).toBe(0xff0000)
        devices.setDisplay(SMALL)
        expect(word(0)).toBe(0x494e5001)
        expect(word(INPUT_STATUS)).toBe(1)
    })

    it('answers only for the devices that last attached to the Core’s memory', () => {
        //every Core of a package shares one memory, so an Emulator never disposed still hears
        //the program another one runs: it must not state its own registers over the live ones
        const stale = makeInput()
        const live = makeInput()
        //the same class of Core, as two JsMips are
        Object.setPrototypeOf(stale.core, Object.getPrototypeOf(live.core))
        live.devices.attach(live.core, SMALL)
        live.keyboard.keyDown(key('KeyA'))
        stale.keyboard.keyDown(key('KeyB'))
        expect(live.word(INPUT_STATUS)).toBe(1)
        expect(stale.word(INPUT_STATUS)).toBe(0)
    })
})
