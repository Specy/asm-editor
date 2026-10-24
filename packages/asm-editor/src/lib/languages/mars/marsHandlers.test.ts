import { describe, expect, it, vi } from 'vite-plus/test'
import type { EmulatorInterrupt } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { ExecutionController } from '#lib/languages/ExecutionController.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { RandomSource } from '#lib/languages/peripherals/RandomSource.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import { MarsHandlers, normalizeUndoSize, toHaltLimit } from '#lib/languages/mars/marsHandlers.ts'

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
    const audioOutput = new RecordingAudioOutput()
    const audio = new Audio({ output: audioOutput })
    const handlers = new MarsHandlers({
        peripherals: {
            terminal,
            clock: new ProgramClock({ mode: 'virtual' }),
            random: new RandomSource({ mode: 'seeded' }),
            audio
        },
        executionController,
        devices: { flush: () => {} },
        pauseAtSleep: () => {},
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
        audioOutput,
        audio,
        executionController,
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

describe('MIDI services', () => {
    const notes = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'note' ? [[c.pitch, c.durationMs]] : []))

    it('plays the Note the Core asked for, heard by the time a sleep starts', async () => {
        const { map, audioOutput } = setup()
        await map.midiOut(64, 300, 40, 90)
        expect(notes(audioOutput)).toEqual([])
        await map.sleep(300)
        expect(notes(audioOutput)).toEqual([[64, 300]])
    })

    it('sends a Note played before a read while the read waits', async () => {
        const { map, audioOutput } = setup({ scripted: ['5'] })
        await map.midiOut(64, 300, 0, 100)
        await map.readInt()
        expect(notes(audioOutput)).toEqual([[64, 300]])
    })

    it('lets the program go when Stop comes during the load, without the Note', async () => {
        const { map, audioOutput, audio, executionController } = setup()
        audioOutput.holdPrepare = true
        const call = Promise.resolve(map.midiOut(60, 100, 0, 100))
        //Stop: the run is superseded and Audio reset, as `clear()` does both
        executionController.invalidate()
        audio.reset()
        await expect(call).rejects.toThrow()
        audioOutput.settle()
        await Promise.resolve()
        expect(audio.activity.soundsStarted).toBe(0)
        audio.flush()
        expect(notes(audioOutput)).toEqual([])
    })

    it('holds the program on the first Note while the sound bank loads', async () => {
        const { map, audioOutput } = setup()
        audioOutput.holdPrepare = true
        let played = false
        const call = Promise.resolve(map.midiOut(60, 100, 0, 100)).then(() => (played = true))
        await Promise.resolve()
        expect(played).toBe(false)
        audioOutput.settle()
        await call
        expect(played).toBe(true)
        await map.sleep(0)
        expect(notes(audioOutput)).toEqual([[60, 100]])
    })
})
