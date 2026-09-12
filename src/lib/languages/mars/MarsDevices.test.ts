import { describe, expect, it } from 'vitest'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { Screen } from '$lib/languages/peripherals/screen/Screen'
import {
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MarsDevices,
    type MarsCore
} from '$lib/languages/mars/MarsDevices'
import { DEFAULT_PROJECT_DISPLAY } from '$lib/languages/mars/marsDisplay'

/**
 * The memory-mapped devices against a fake Core, for the behavior that depends on the run rather
 * than on the program: the receiver register is loaded from the Keyboard only while the user is the
 * one running the program
 * ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)). The
 * register semantics a program sees are covered end to end against the real Cores in
 * `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts`.
 */

/** A small grid, so `attach` reads back 64 words instead of 128 KB. */
const SMALL = { ...DEFAULT_PROJECT_DISPLAY, width: 64, height: 64, unitWidth: 8, unitHeight: 8 }

type ReadObserver = (address: number, value: number) => void

function makeDevices() {
    const words = new Map<number, number>()
    const reads = new Map<number, ReadObserver>()
    let nextHandle = 1
    const core: MarsCore = {
        readMemoryBytes: () => [0, 0, 0, 0],
        setPeripheralWord: (address, value) => words.set(address >>> 0, value),
        addMemoryWriteObserver: () => nextHandle++,
        addMemoryAccessObserver: (address, onRead) => {
            if (onRead) reads.set(address >>> 0, onRead)
            return nextHandle++
        },
        removeMemoryObserver: () => {}
    }
    const keyboard = new Keyboard({ holdIntervalMs: 0 })
    const terminal = {
        output: '',
        inputSource: 'interactive' as 'interactive' | 'scripted',
        write(text: string) {
            this.output += text
        },
        clear() {
            this.output = ''
        }
    }
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
        /** What the device last stored in a register, which is what a program's `lw` would read. */
        wordAt: (address: number) => words.get(address >>> 0) ?? 0,
        /** The program reading the data register, which is what frees it for the next character. */
        readData: () => reads.get(MARS_RECEIVER_DATA >>> 0)?.(MARS_RECEIVER_DATA, 0)
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
        terminal.inputSource = 'scripted'
        keyboard.typeText('A')
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(0)
        expect(wordAt(MARS_RECEIVER_DATA)).toBe(0)
        //and it is still there for the interactive run that follows
        expect(keyboard.hasTypedInput()).toBe(true)
    })

    it('picks the queue back up once the run is the user’s again', () => {
        const { keyboard, terminal, readData, wordAt } = makeDevices()
        terminal.inputSource = 'scripted'
        keyboard.typeText('AB')
        terminal.inputSource = 'interactive'
        keyboard.typeText('C')
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('A'.charCodeAt(0))
        readData()
        expect(wordAt(MARS_RECEIVER_DATA)).toBe('B'.charCodeAt(0))
        expect(wordAt(MARS_RECEIVER_CONTROL)).toBe(MARS_READY_BIT)
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

function makeFramebuffer(display = FOUR_BLOCKS) {
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
        keyboard: new Keyboard({ holdIntervalMs: 0 }),
        terminal: {
            inputSource: 'interactive' as const,
            write() {},
            clear() {}
        }
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
        const many = { ...DEFAULT_PROJECT_DISPLAY, width: 256, height: 40, unitWidth: 1, unitHeight: 1 }
        const { store, reads, devices } = makeFramebuffer(many)
        for (let block = 0; block < 40; block += 2) store(block * BLOCK, 0x111111)
        devices.flush()
        expect(reads).toEqual([{ from: 0, length: 39 * BLOCK }])
    })
})
