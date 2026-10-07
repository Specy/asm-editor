import { describe, expect, it, vi } from 'vitest'
import type { EmulatorInterrupt } from '$lib/languages/commonLanguageFeatures.svelte'
import { ExecutionController } from '$lib/languages/ExecutionController'
import { FileSystem } from '$lib/languages/peripherals/FileSystem'
import { RandomSource } from '$lib/languages/peripherals/RandomSource'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import { Terminal } from '$lib/languages/peripherals/Terminal.svelte'
import { MarsHandlers, normalizeUndoSize, toHaltLimit } from '$lib/languages/mars/marsHandlers'

/**
 * The handlers MIPS and RISC-V share, against the real Terminal and FileSystem and no Core, for the
 * paths no program in `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts` takes. What a program sees
 * through them is covered end to end there, against both Cores.
 */

/** A Core-owned dynamic instruction identity, unrelated to its source address. */
const INSTRUCTION_SERIAL = '9007199254740993123'

function setup(
    options: { scripted?: string[]; fileSystem?: boolean; serial?: string | null } = {}
) {
    let serial = options.serial === undefined ? INSTRUCTION_SERIAL : options.serial
    const executionController = new ExecutionController(() => {})
    const terminal = new Terminal({ executionController })
    terminal.useScriptedInput(options.scripted ?? [])
    const session = options.fileSystem === false ? null : new FileSystem().beginSession()
    const interrupts: (EmulatorInterrupt | undefined)[] = []
    const handlers = new MarsHandlers({
        peripherals: {
            terminal,
            clock: new ProgramClock({ mode: 'virtual' }),
            random: new RandomSource({ mode: 'seeded' })
        },
        executionController,
        devices: { flush: () => {} },
        setInterrupt: (interrupt) => {
            interrupts.push(interrupt)
        },
        fileSystem: () => session,
        instructionSerial: () => serial
    })
    handlers.beginExecution()
    return {
        map: handlers.makeHandlerMap(),
        terminal,
        session,
        interrupts,
        setSerial: (value: string | null) => {
            serial = value
        }
    }
}

describe('the MARS and RARS handlers', () => {
    it('answers confirm Yes, No and Cancel with 0, 1 and 2, as both references number them', async () => {
        const { map } = setup({ scripted: ['yes', 'no', 'cancel'] })
        const answers = [
            await map.confirm('Sure?'),
            await map.confirm('Sure?'),
            await map.confirm('Sure?')
        ]
        expect(answers).toEqual([0, 1, 2])
    })

    it('transports raw text and clears each interrupt without parsing or formatting', async () => {
        const { map, interrupts } = setup({ scripted: ['12abc', '😀', 'hi'] })
        expect(await map.readInt()).toBe('12abc')
        expect(await map.readChar()).toBe('😀')
        expect(await map.stdIn(16)).toEqual([3, [104, 105, 10]])
        expect(interrupts).toEqual([
            { type: 'ReadInt', message: 'Enter an integer' },
            undefined,
            { type: 'ReadChar', message: 'Enter a character' },
            undefined,
            { type: 'StandardInput', message: 'Enter a line of input' },
            undefined
        ])
    })

    it('runs every handler in a FileSystem frame keyed by the active instruction serial', () => {
        const { map, session, terminal } = setup()
        const frames = vi.spyOn(session!, 'performInstruction')
        const descriptor = map.openFile('out.txt', 1, false)
        map.writeFile(descriptor, [104, 105])
        map.printString('7')
        expect(frames.mock.calls.map(([id]) => id)).toEqual([
            INSTRUCTION_SERIAL,
            INSTRUCTION_SERIAL,
            INSTRUCTION_SERIAL
        ])
        expect(terminal.output).toBe('7')
    })

    it('keeps non-file markers at repeated PCs from undoing an earlier file write', () => {
        const { map, session, setSerial } = setup()
        const descriptor = map.openFile('out.txt', 1, false)
        setSerial('write')
        expect(map.writeFile(descriptor, [104, 105])).toBe(2)
        setSerial('print')
        map.printString('7')
        session!.undoAfter('print')
        //Read through the published Files; the write-only descriptor itself cannot read.
        expect(session!.stat('out.txt')?.size).toBe(2)
        session!.undoAfter('write')
        expect(session!.stat('out.txt')?.size).toBe(0)
    })

    it('refuses to run a handler without a FileSystem session', () => {
        const { map } = setup({ fileSystem: false })
        expect(() => map.printString('7')).toThrow('FileSystem is not running')
    })

    it('refuses a handler without an active Core instruction serial', () => {
        const { map, session } = setup({ serial: null })
        const frames = vi.spyOn(session!, 'performInstruction')
        expect(() => map.printString('7')).toThrow('Core handler has no active instruction serial')
        expect(frames).not.toHaveBeenCalled()
    })

    it('decodes flat unsigned bytes as a stream across both output channels', () => {
        const { map, terminal } = setup()
        map.stdOut([195])
        map.stdErr([169])
        expect(terminal.output).toBe('é')
    })

    it('supplies the seeded run source for each generator', () => {
        const { map } = setup()
        const source = new RandomSource({ mode: 'seeded' })
        expect(map.randomSeed(0)).toBe(0xc4e8badd8e2e)
        expect(map.randomSeed(-2)).toBe(source.seedFor(-2))
    })

    it('reads an undo size and a halt limit the way both Cores take them', () => {
        expect([200, 2.7, 0, -3, Number.NaN, Infinity].map(normalizeUndoSize)).toEqual([
            200, 2, 0, 0, 0, 0
        ])
        const unbounded = Number.MAX_SAFE_INTEGER
        expect([500, 0, -1, undefined].map(toHaltLimit)).toEqual([
            500,
            unbounded,
            unbounded,
            unbounded
        ])
    })
})
