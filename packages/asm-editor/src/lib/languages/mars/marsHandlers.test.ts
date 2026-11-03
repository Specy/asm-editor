import { describe, expect, it, vi } from 'vite-plus/test'
import type { EmulatorInterrupt } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { ExecutionController } from '#lib/languages/ExecutionController.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { RandomSource } from '#lib/languages/peripherals/RandomSource.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import { MarsHandlers } from '#lib/languages/mars/marsHandlers.ts'
import type { MarsTarget } from '#lib/languages/mars/marsCheck.ts'

/**
 * The handlers MIPS and RISC-V share, against the real Terminal and FileSystem and no Core, for the
 * paths no program in `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts` takes. What a program sees
 * through them is covered end to end there, against both Cores.
 */

/** A Core-owned dynamic instruction identity, unrelated to its source address. */
const INSTRUCTION_SERIAL = '9007199254740993123'

function setup(
    options: {
        scripted?: string[]
        fileSystem?: boolean
        serial?: string | null
        target?: MarsTarget
        files?: Record<string, string>
    } = {}
) {
    let serial = options.serial === undefined ? INSTRUCTION_SERIAL : options.serial
    const executionController = new ExecutionController(() => {})
    const terminal = new Terminal({ executionController })
    terminal.useScriptedInput(options.scripted ?? [])
    const fileSystem = new FileSystem(
        Object.fromEntries(
            Object.entries(options.files ?? {}).map(([path, content]) => [
                path,
                { encoding: 'plain' as const, content }
            ])
        )
    )
    const session = options.fileSystem === false ? null : fileSystem.beginSession()
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
        target: () => options.target ?? 'MIPS',
        instructionSerial: () => serial
    })
    handlers.beginExecution()
    return {
        map: handlers.makeHandlerMap(),
        fileSystem,
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

    it('fails a read for a run that was superseded without putting up its interrupt or read', async () => {
        const { map, terminal, interrupts, executionController } = setup()
        terminal.useInteractiveInput()
        //a Core that Stop could not halt, reading on the stopped run's behalf
        executionController.invalidate()
        const read = map.readInt()
        expect(terminal.pendingRead).toBeNull()
        await expect(read).rejects.toThrow('Execution superseded')
        expect(interrupts).toEqual([])
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

/** The `linux_dirent` records of a getdents answer, read back field by field. */
function dirents(bytes: number[], long: 4 | 8) {
    const data = Uint8Array.from(bytes)
    const view = new DataView(data.buffer)
    const records = []
    for (let at = 0; at < data.length;) {
        const length = view.getUint16(at + long * 2, true)
        //a record read with the wrong layout would never end the walk
        if (length === 0) throw new Error(`No record length at ${at}`)
        const name = data.subarray(at + long * 2 + 2, at + length)
        records.push({
            inode: Number(long === 8 ? view.getBigUint64(at, true) : view.getUint32(at, true)),
            next: Number(
                long === 8 ? view.getBigUint64(at + 8, true) : view.getUint32(at + 4, true)
            ),
            length,
            name: new TextDecoder().decode(name.subarray(0, name.indexOf(0))),
            //the bytes between the name's NUL and d_type are padding
            padding: Array.from(name.subarray(name.indexOf(0), name.length - 1)),
            type: data[at + length - 1]
        })
        at += length
    }
    return records
}

describe('the folder calls', () => {
    it('answer 0, or minus the Linux error number, for each way a call can fail', () => {
        const { map } = setup({ files: { 'docs/a.txt': 'a', top: 't' } })
        expect(map.mkdir('made')).toBe(0)
        expect(map.mkdir('made')).toBe(-17)
        expect(map.mkdir('missing/below')).toBe(-2)
        expect(map.unlink('missing')).toBe(-2)
        expect(map.stat('missing')).toEqual([-2, []])
        expect(map.mkdir('top/inner')).toBe(-20)
        expect(map.rmdir('top')).toBe(-20)
        expect(map.unlink('docs')).toBe(-21)
        expect(map.rename('docs', 'moved')).toBe(-21)
        expect(map.rename('made', 'moved')).toBe(-21)
        expect(map.rename('top', 'made')).toBe(-21)
        expect(map.rename('made', 'top')).toBe(-20)
        expect(map.rename('top', 'missing/top')).toBe(-2)
        expect(map.rmdir('docs')).toBe(-39)
        expect(map.getdents(42, 512)).toEqual([-9, []])
        expect(map.rename('top', 'made/top')).toBe(0)
        expect(map.rmdir('made')).toBe(-39)
        expect(map.unlink('made/top')).toBe(0)
        expect(map.rmdir('made')).toBe(0)
    })

    it('replace a File a rename lands on, as Linux does, and do nothing for one onto itself', () => {
        const { map, fileSystem } = setup({ files: { 'docs/a.txt': 'a', top: 't' } })
        expect(map.rename('top', 'top')).toBe(0)
        expect(map.rename('top', 'docs/a.txt')).toBe(0)
        expect(fileSystem.files).toEqual({ 'docs/a.txt': { encoding: 'plain', content: 't' } })
    })

    it('opens a folder for reading as a descriptor getdents lists, which Read refuses', () => {
        const { map } = setup({ files: { 'docs/a.txt': 'a' } })
        const folder = map.openFile('docs', 0, false)
        expect(folder).toBe(3)
        expect(map.readFile(folder, 4)).toEqual([-1, []])
        expect(map.writeFile(folder, [1])).toBe(-1)
        //for writing, a folder still cannot be opened, the old way: -1
        expect(map.openFile('docs', 1, false)).toBe(-1)
        expect(map.openFile('docs', 9, true)).toBe(-1)
        //a File's descriptor is no folder's
        const file = map.openFile('docs/a.txt', 0, false)
        expect(map.getdents(file, 512)).toEqual([-20, []])
        map.closeFile(folder)
        expect(map.getdents(folder, 512)).toEqual([-9, []])
    })

    it.each([
        ['MIPS', 4],
        ['RISC-V', 4],
        ['RISC-V-64', 8]
    ] as const)(
        'lays %s getdents records out as linux_dirent with %i-byte longs',
        (target, long) => {
            const { map } = setup({ target, files: { 'notes.txt': 'n', 'docs/a.txt': 'a' } })
            const folder = map.openFile('/', 0, false)
            const [count, bytes] = map.getdents(folder, 4096)
            expect(count).toBe(bytes.length)
            const records = dirents(bytes, long)
            expect(records.map((record) => [record.name, record.type])).toEqual([
                ['.', 4],
                ['..', 4],
                ['docs', 4],
                ['notes.txt', 8]
            ])
            expect(records.map((record) => record.next)).toEqual([1, 2, 3, 4])
            for (const record of records) {
                //d_ino, d_off, d_reclen, the name and its NUL and d_type, rounded up to a long
                expect(record.length).toBe(
                    Math.ceil((long * 2 + 2 + record.name.length + 2) / long) * long
                )
                expect(record.padding.every((byte) => byte === 0)).toBe(true)
            }
            expect(records[0].inode).toBe(1)
            expect(records[1].inode).toBe(1)
            //the record's inode is the one stat stores
            const [, stat] = map.stat('notes.txt')
            const statInode = new DataView(Uint8Array.from(stat).buffer).getUint32(
                target === 'MIPS' ? 16 : 8,
                true
            )
            expect(records[3].inode).toBe(statInode)
            //then the end of the folder
            expect(map.getdents(folder, 4096)).toEqual([0, []])
        }
    )

    it('fills the buffer with whole records only, and refuses one too small for the next', () => {
        const { map } = setup({ files: { 'a.txt': '', 'b.txt': '' } })
        const folder = map.openFile('.', 0, false)
        //'.' and '..' are 16 bytes each on MIPS, 'a.txt' 20
        expect(map.getdents(folder, 15)).toEqual([-22, []])
        const [first, bytes] = map.getdents(folder, 31)
        expect(first).toBe(16)
        expect(dirents(bytes, 4).map((record) => record.name)).toEqual(['.'])
        const [rest, more] = map.getdents(folder, 1000)
        expect(rest).toBe(16 + 20 + 20)
        expect(dirents(more, 4).map((record) => record.name)).toEqual(['..', 'a.txt', 'b.txt'])
    })

    it.each([
        ['MIPS', 104, { ino: 16, mode: 24, nlink: 28, size: 56 }],
        ['RISC-V', 104, { ino: 8, mode: 16, nlink: 20, size: 48 }],
        ['RISC-V-64', 128, { ino: 8, mode: 16, nlink: 20, size: 48 }]
    ] as const)('stores %s stat as Linux lays it out, %i bytes', (target, length, at) => {
        const { map } = setup({ target, files: { 'data.bin': 'hello', 'docs/a.txt': '' } })
        const read = (path: string) => {
            const [result, bytes] = map.stat(path)
            expect(result).toBe(0)
            expect(bytes).toHaveLength(length)
            const view = new DataView(Uint8Array.from(bytes).buffer)
            const known = new Set(
                [at.ino, at.mode, at.nlink, at.size].flatMap((offset, index) =>
                    Array.from({ length: index === 0 || index === 3 ? 8 : 4 }, (_, i) => offset + i)
                )
            )
            return {
                inode: Number(view.getBigUint64(at.ino, true)),
                mode: view.getUint32(at.mode, true),
                links: view.getUint32(at.nlink, true),
                size: Number(view.getBigInt64(at.size, true)),
                //times, owners and everything else read 0
                rest: bytes.filter((_, index) => !known.has(index)).every((byte) => byte === 0)
            }
        }
        const file = read('data.bin')
        expect(file).toMatchObject({ mode: 0o100777, links: 1, size: 5, rest: true })
        const folder = read('docs/')
        expect(folder).toMatchObject({ mode: 0o040777, links: 1, size: 0, rest: true })
        expect(read('/')).toMatchObject({ inode: 1, mode: 0o040777 })
        expect(new Set([file.inode, folder.inode, 1]).size).toBe(3)
        //stable for the run
        expect(read('data.bin').inode).toBe(file.inode)
    })

    it('journals each folder call on the instruction serial, so Undo takes it back', () => {
        const { map, session, fileSystem, setSerial } = setup({
            files: { 'a.txt': 'a', 'docs/b.txt': 'b' }
        })
        const run = <T>(serial: string, call: () => T): T => {
            setSerial(serial)
            return call()
        }
        expect(run('replace', () => map.rename('docs/b.txt', 'a.txt'))).toBe(0)
        expect(fileSystem.files).toEqual({ 'a.txt': { encoding: 'plain', content: 'b' } })
        session!.undo('replace')
        expect(fileSystem.readText('a.txt')).toBe('a')
        expect(fileSystem.readText('docs/b.txt')).toBe('b')
        expect(run('mkdir', () => map.mkdir('made'))).toBe(0)
        expect(run('rename', () => map.rename('a.txt', 'made/a.txt'))).toBe(0)
        expect(run('unlink', () => map.unlink('docs/b.txt'))).toBe(0)
        const folder = run('open', () => map.openFile('made', 0, false))
        expect(run('list', () => map.getdents(folder, 512)[0])).toBeGreaterThan(0)
        expect(run('end', () => map.getdents(folder, 512))).toEqual([0, []])
        expect(Object.keys(fileSystem.files)).toEqual(['made/a.txt'])

        session!.undo('end')
        session!.undo('list')
        //listed again from the start once the read is taken back
        expect(
            dirents(run('list', () => map.getdents(folder, 512))[1], 4).map((r) => r.name)
        ).toEqual(['.', '..', 'a.txt'])
        session!.undo('list')
        session!.undo('open')
        expect(map.getdents(folder, 512)).toEqual([-9, []])
        session!.undo('list')
        session!.undo('unlink')
        expect(fileSystem.readText('docs/b.txt')).toBe('b')
        session!.undo('rename')
        expect(Object.keys(fileSystem.files).sort()).toEqual(['a.txt', 'docs/b.txt'])
        session!.undo('mkdir')
        expect(map.stat('made')).toEqual([-2, []])
    })
})
