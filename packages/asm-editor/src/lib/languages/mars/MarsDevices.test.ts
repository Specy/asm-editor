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
    MARS_INTERRUPT_ENABLE_BIT,
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_RECEIVER_INTERRUPT,
    MARS_TRANSMITTER_CONTROL,
    MARS_TRANSMITTER_DATA,
    MARS_TRANSMITTER_INTERRUPT,
    MarsDevices,
    type MarsCore
} from '#lib/languages/mars/MarsDevices.ts'
import { DEFAULT_PROJECT_DISPLAY } from '#lib/languages/mars/marsDisplay.ts'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import {
    MIDI_PORT_BASE,
    MIDI_PORT_DATA,
    MIDI_PORT_STATUS
} from '#lib/languages/midiPortRegisters.ts'
import {
    PCM_BASE,
    PCM_CONTROL,
    PCM_DATA,
    PCM_FIFO_FRAMES,
    PCM_FREE,
    PCM_ON_BIT,
    PCM_RATE
} from '#lib/languages/sampledAudioRegisters.ts'

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
    /** The interrupt lines the devices hold raised, by code. */
    const lines = new Set<number>()
    /** The pulses sent and not withdrawn, by code, in the order they were sent. */
    const pulses: number[] = []
    let nextHandle = 1
    const core: MarsCore = {
        readMemoryBytes: () => [0, 0, 0, 0],
        readMemoryWords: (_address, count) => new Array<number>(count).fill(0),
        trackWrites: () => {},
        takeWrittenBlocks: () => [],
        setPeripheralWord: (address, value) => words.set(address >>> 0, value),
        raiseExternalInterrupt: (code) => lines.add(code),
        clearExternalInterrupt: (code) => {
            lines.delete(code)
            //a pulse no interrupt has taken yet is withdrawn too
            pulses.splice(0, pulses.length, ...pulses.filter((pulse) => pulse !== code))
        },
        pulseExternalInterrupt: (code) => pulses.push(code),
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
        lines,
        pulses,
        /** The program storing a control register, as an `sw` would. */
        control: (register: number, value: number) => writes.get(register >>> 0)?.(register, value),
        /** What the device last stored in a register, which is what a program's `lw` would read. */
        wordAt: (address: number) => words.get(address >>> 0) ?? 0,
        /** The program reading the data register, which is what frees it for the next character. */
        readData: () => reads.get(MARS_RECEIVER_DATA >>> 0)?.(MARS_RECEIVER_DATA, 0),
        /** The program storing a character in the transmitter data register. */
        transmit: (value: number) =>
            writes.get(MARS_TRANSMITTER_DATA >>> 0)?.(MARS_TRANSMITTER_DATA, value)
    }
}

describe('the receiver and transmitter interrupts', () => {
    it('raise their line while the enable bit is set and the device is Ready', () => {
        const { keyboard, control, readData, lines, wordAt } = makeDevices()
        keyboard.typeText('AB')
        expect(lines.size).toBe(0)
        //the program turns the receiver's interrupt on: two keys wait, so the line goes up at once
        control(MARS_RECEIVER_CONTROL, MARS_INTERRUPT_ENABLE_BIT)
        expect([...lines]).toEqual([MARS_RECEIVER_INTERRUPT])
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_READY_BIT | MARS_INTERRUPT_ENABLE_BIT)
        //level-triggered: reading one key leaves the other waiting, and the line up
        readData()
        expect([...lines]).toEqual([MARS_RECEIVER_INTERRUPT])
        readData()
        expect(lines.size).toBe(0)
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_INTERRUPT_ENABLE_BIT)
        //a key typed later raises it again, and turning the bit off withdraws it
        keyboard.typeText('C')
        expect([...lines]).toEqual([MARS_RECEIVER_INTERRUPT])
        control(MARS_RECEIVER_CONTROL, 0)
        expect(lines.size).toBe(0)
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_READY_BIT)
    })

    it('pulse the transmitter’s once for each character it takes, as MARS’s does', () => {
        const { devices, control, transmit, lines, pulses, wordAt } = makeDevices()
        let woken = 0
        devices.onInterruptRequest(() => woken++)
        //the console is already Ready, so turning the interrupt on asks for nothing, as in MARS
        control(MARS_TRANSMITTER_CONTROL, MARS_INTERRUPT_ENABLE_BIT)
        expect(pulses).toEqual([])
        expect(wordAt(MARS_TRANSMITTER_CONTROL)).toBe(MARS_READY_BIT | MARS_INTERRUPT_ENABLE_BIT)
        //each character taken makes it Ready again: one request each, and never a held line
        transmit('h'.charCodeAt(0))
        transmit('i'.charCodeAt(0))
        expect(pulses).toEqual([MARS_TRANSMITTER_INTERRUPT, MARS_TRANSMITTER_INTERRUPT])
        expect(lines.size).toBe(0)
        expect(woken).toBe(2)
        //turning it off withdraws a request no interrupt has taken yet, and stops new ones
        control(MARS_TRANSMITTER_CONTROL, 0)
        expect(pulses).toEqual([])
        transmit('!'.charCodeAt(0))
        expect(pulses).toEqual([])
    })

    it('send no transmitter request for a Poke’s store into its data register', () => {
        const { devices, control, transmit, pulses } = makeDevices()
        control(MARS_TRANSMITTER_CONTROL, MARS_INTERRUPT_ENABLE_BIT)
        devices.hostWrite(() => transmit('x'.charCodeAt(0)))
        expect(pulses).toEqual([])
    })

    it('reach a Testcase’s scripted input too, and tell a waiting wfi', () => {
        const { devices, terminal, control, readData, lines } = makeDevices()
        let woken = 0
        const stop = devices.onInterruptRequest(() => woken++)
        terminal.useScriptedInput(['hi'])
        control(MARS_RECEIVER_CONTROL, MARS_INTERRUPT_ENABLE_BIT)
        expect([...lines]).toEqual([MARS_RECEIVER_INTERRUPT])
        expect(woken).toBeGreaterThan(0)
        stop()
        const before = woken
        readData()
        readData()
        readData()
        expect(woken).toBe(before)
        //the scripted line ends with Enter, which is a keystroke too
        expect(lines.size).toBe(0)
    })
})

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
 * slices, from the blocks the Core's written-blocks map names, and what a flush asks the Core for is
 * the thing worth pinning: reading the whole grid because two scattered words changed is what cost
 * this 47% of the wall clock before the dirty map.
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

/**
 * A Core package's one memory, with the written-blocks map every Core of the package shares, as
 * every `JsMips` shares MARS's. `segmentWords`: how many words from the grid's start the Core reads
 * before its segment ends.
 */
function makeCoreMemory(segmentWords = Infinity) {
    /** What the Core "holds", by word index from the grid's start. */
    const memory = new Map<number, number>()
    /** Every `readMemoryWords` a flush made, as word ranges. */
    const reads: { from: number; length: number }[] = []
    /** Every `trackWrites` call, as the range's start and end. */
    const tracks: [number, number][] = []
    let tracked: [number, number] = [0, 0]
    let written = new Set<number>()
    /** What `memoryOf` keys the shared memory on: the class every Core of the package has. */
    const packageClass = {}
    return {
        memory,
        reads,
        tracks,
        /** A program storing `value` at word `index` of the grid, which the Core's map notes. */
        store(index: number, value: number) {
            memory.set(index, value)
            const offset = (BASE + index * 4 - tracked[0]) >>> 0
            if (offset < (tracked[1] - tracked[0]) >>> 0) written.add(offset >> 10)
        },
        makeCore(): MarsCore {
            const core: MarsCore = Object.create(packageClass)
            return Object.assign(core, {
                readMemoryBytes: () => [0, 0, 0, 0],
                readMemoryWords: (address: number, count: number) => {
                    const from = ((address >>> 0) - BASE) >>> 2
                    if (from + count > segmentWords) throw new Error('Address out of range')
                    reads.push({ from, length: count })
                    return Array.from({ length: count }, (_, i) => memory.get(from + i) ?? 0)
                },
                trackWrites: (start: number, end: number) => {
                    tracks.push([start >>> 0, end >>> 0])
                    tracked = [start, end]
                    written = new Set()
                },
                takeWrittenBlocks: () => {
                    const blocks = [...written].sort((a, b) => a - b)
                    written = new Set()
                    return blocks
                },
                setPeripheralWord: () => {},
                raiseExternalInterrupt: () => {},
                clearExternalInterrupt: () => {},
                pulseExternalInterrupt: () => {},
                addMemoryWriteObserver: () => 1,
                addMemoryAccessObserver: () => 1,
                removeMemoryObserver: () => {}
            })
        }
    }
}

function makeFramebuffer(
    display = FOUR_BLOCKS,
    segmentWords = Infinity,
    shared = makeCoreMemory(segmentWords)
) {
    const screen = new Screen({ width: 64, height: 64 })
    const devices = new MarsDevices({
        screen,
        keyboard: new Keyboard(),
        terminal: makeTerminal().terminal
    })
    devices.attach(shared.makeCore(), display)
    shared.reads.length = 0
    return { devices, screen, reads: shared.reads, store: shared.store, shared }
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

    it('tracks the grid from its first word to the word after its last', () => {
        const { shared } = makeFramebuffer()
        expect(shared.tracks).toEqual([[BASE, BASE + 4 * BLOCK * 4]])
    })

    it('reads what an Undo or a Poke wrote, which the Core marks as it marks a store', () => {
        //the adapter flushes after both instead of reading the whole grid back
        const { store, reads, devices, screen } = makeFramebuffer()
        store(2 * BLOCK + 3, 0x00ff00)
        devices.flush()
        expect(reads).toEqual([{ from: 2 * BLOCK, length: BLOCK }])
        expect(screen.getPixel(3, 2)).toBe(0x00ff00)
    })

    it('drops the blocks waiting in the map when it reads the whole grid', () => {
        const { store, reads, devices } = makeFramebuffer()
        store(0, 0x111111)
        devices.resync()
        reads.length = 0
        devices.flush()
        expect(reads).toEqual([])
    })

    it('leaves the map to the devices that attached last, as every Core shares it', () => {
        const shared = makeCoreMemory()
        const stale = makeFramebuffer(FOUR_BLOCKS, Infinity, shared)
        const live = makeFramebuffer(FOUR_BLOCKS, Infinity, shared)
        shared.tracks.length = 0
        live.store(BLOCK, 0x111111)
        //the stale display neither takes the live one's blocks nor moves the range off its grid
        stale.devices.flush()
        expect(shared.reads).toEqual([])
        stale.devices.setDisplay({ ...FOUR_BLOCKS, baseAddress: 0x10040000 })
        stale.devices.dispose()
        expect(shared.tracks).toEqual([])
        shared.reads.length = 0
        live.devices.flush()
        expect(shared.reads).toEqual([{ from: BLOCK, length: BLOCK }])
    })

    it('stops the Core tracking once its devices are disposed', () => {
        const { devices, shared } = makeFramebuffer()
        devices.dispose()
        expect(shared.tracks.at(-1)).toEqual([0, 0])
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
            readMemoryWords: (address, count) =>
                Array.from({ length: count }, (_, i) => words.get((address + i * 4) >>> 0) ?? 0),
            trackWrites: () => {},
            takeWrittenBlocks: () => [],
            setPeripheralWord: (address, value) => words.set(address >>> 0, value),
            raiseExternalInterrupt: () => {},
            clearExternalInterrupt: () => {},
            pulseExternalInterrupt: () => {},
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

describe('the MIDI port and the sampled-audio output', () => {
    /** A Core whose memory and observers the test drives as a program would. */
    function soundCore() {
        const memory = new Map<number, number>()
        type WriteObserver = {
            start: number
            end: number
            handler: (a: number, l: number, v: number) => void
        }
        const writes: WriteObserver[] = []
        const reads = new Map<number, AccessObserver>()
        let nextHandle = 1
        const word = (address: number) => memory.get(address >>> 0) ?? 0
        const core: MarsCore = {
            readMemoryBytes: (address, length) =>
                Array.from(
                    { length },
                    (_, i) => (word((address + i) & ~3) >>> (8 * ((address + i) & 3))) & 0xff
                ),
            readMemoryWords: (address, count) =>
                Array.from({ length: count }, (_, i) => word(address + 4 * i)),
            trackWrites: () => {},
            takeWrittenBlocks: () => [],
            setPeripheralWord: (address, value) => memory.set(address >>> 0, value | 0),
            raiseExternalInterrupt: () => {},
            clearExternalInterrupt: () => {},
            pulseExternalInterrupt: () => {},
            addMemoryWriteObserver: (start, end, handler) => {
                writes.push({ start: start >>> 0, end: end >>> 0, handler })
                return nextHandle++
            },
            addMemoryAccessObserver: (address, onRead) => {
                if (onRead) reads.set(address >>> 0, onRead)
                return nextHandle++
            },
            removeMemoryObserver: () => {}
        }
        /** A program's word store: memory, then every observer whose range holds it. */
        const store = (address: number, value: number) => {
            memory.set(address >>> 0, value | 0)
            for (const observer of writes)
                if (address >>> 0 >= observer.start && address >>> 0 <= observer.end + 3)
                    observer.handler(address | 0, 4, value)
        }
        const read = (address: number) => {
            const value = word(address)
            reads.get(address >>> 0)?.(address | 0, value)
            return value
        }
        return { core, store, read, word }
    }

    function makeSoundDevices(display = SMALL) {
        let time = 0
        const output = new RecordingAudioOutput()
        const audio = new Audio({ output })
        const clock = { now: () => time, isVirtual: false, wait: () => Promise.resolve() }
        const { terminal } = makeTerminal()
        const devices = new MarsDevices({
            screen: new Screen({ width: 64, height: 64 }),
            keyboard: new Keyboard(),
            terminal,
            audio: () => audio,
            clock: () => clock
        })
        const fake = soundCore()
        devices.attach(fake.core, display)
        const midi = () => {
            audio.flush()
            return output.commands.flatMap((c) => (c.type === 'midi' ? [[...c.message]] : []))
        }
        return { ...fake, devices, output, audio, midi, at: (ms: number) => (time = ms) }
    }

    const COVERING = { ...SMALL, baseAddress: 0xffff0000, width: 128, height: 128 }

    it('hands a store into the MIDI port to it, which states Status ahead of the next read', () => {
        const { store, read, midi } = makeSoundDevices()
        expect(read(MIDI_PORT_BASE + MIDI_PORT_STATUS)).toBe(0x80)
        for (const byte of [0x90, 60, 100]) store(MIDI_PORT_BASE + MIDI_PORT_DATA, byte)
        expect(midi()).toEqual([[0x90, 60, 100]])
    })

    it('queues samples, and hands them to the Audio when the devices flush', () => {
        const { store, read, devices, output, audio } = makeSoundDevices()
        store(PCM_BASE + PCM_CONTROL, PCM_ON_BIT)
        store(PCM_BASE + PCM_DATA, 0x40004000)
        expect(read(PCM_BASE + PCM_FREE)).toBe(PCM_FIFO_FRAMES - 2)
        audio.flush()
        expect(output.commands.some((c) => c.type === 'pcm')).toBe(false)
        devices.flush()
        audio.flush()
        expect(output.commands.find((c) => c.type === 'pcm')).toMatchObject({ rate: 8000 })
    })

    it('lists both blocks as device regions, and neither while a display covers them', () => {
        const names = (devices: MarsDevices) => devices.regions().map((region) => region.name)
        const open = makeSoundDevices()
        expect(names(open.devices)).toEqual(
            expect.arrayContaining(['MIDI port', 'Sampled-audio output'])
        )
        const covered = makeSoundDevices(COVERING)
        expect(names(covered.devices)).not.toContain('MIDI port')
        expect(names(covered.devices)).not.toContain('Sampled-audio output')
    })

    it('leaves the blocks to the display while it covers them: stores are pixels, and nothing sounds', () => {
        const { store, word, midi, devices } = makeSoundDevices(COVERING)
        store(MIDI_PORT_BASE + MIDI_PORT_STATUS, 0x00ff00)
        for (const byte of [0x90, 60, 100]) store(MIDI_PORT_BASE + MIDI_PORT_DATA, byte)
        store(PCM_BASE + PCM_RATE, 0x0000ff)
        expect(word(MIDI_PORT_BASE + MIDI_PORT_STATUS)).toBe(0x00ff00)
        expect(word(PCM_BASE + PCM_RATE)).toBe(0x0000ff)
        expect(midi()).toEqual([])
        //moved away, the display uncovers them, and they state their blocks
        devices.setDisplay(SMALL)
        expect(word(MIDI_PORT_BASE + MIDI_PORT_STATUS)).toBe(0x80)
        expect(word(PCM_BASE + PCM_RATE)).toBe(8000)
    })

    it('ignores a Poke and an Undo’s restoring stores, stating its words again', () => {
        const { store, word, midi, devices } = makeSoundDevices()
        devices.hostWrite(() => store(MIDI_PORT_BASE + MIDI_PORT_DATA, 0x90))
        devices.hostWrite(() => store(PCM_BASE + PCM_RATE, 22_050))
        expect(word(PCM_BASE + PCM_RATE)).toBe(8000)
        devices.rewind(() => store(PCM_BASE + PCM_RATE, 44_100))
        devices.restateSound()
        expect(word(PCM_BASE + PCM_RATE)).toBe(8000)
        //the Poke's 0x90 started nothing: the next two bytes make no message
        store(MIDI_PORT_BASE + MIDI_PORT_DATA, 60)
        store(MIDI_PORT_BASE + MIDI_PORT_DATA, 100)
        expect(midi()).toEqual([])
    })

    it('stays silent for an Emulator whose Core memory another one has taken', () => {
        const first = makeSoundDevices()
        const second = new MarsDevices({
            screen: new Screen({ width: 64, height: 64 }),
            keyboard: new Keyboard(),
            terminal: makeTerminal().terminal,
            audio: () => first.audio,
            clock: () => ({ now: () => 0, isVirtual: false, wait: () => Promise.resolve() })
        })
        //another Core of the same kind, as every instance of a package shares one memory: the
        //fakes are plain objects, so they share one too
        second.attach(soundCore().core, SMALL)
        for (const byte of [0x90, 60, 100]) first.store(MIDI_PORT_BASE + MIDI_PORT_DATA, byte)
        expect(first.midi()).toEqual([])
    })
})
