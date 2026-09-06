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
