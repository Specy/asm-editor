import { describe, expect, it } from 'vite-plus/test'
import {
    FileErrorCode,
    FileSystem,
    FileSystemGuestError,
    guestFileFailure,
    type FileDescriptorOptions
} from './FileSystem'
import {
    bytesFile,
    cleanFiles,
    encodeBase64,
    fileBytes,
    originalBytes,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    ProjectFormatError
} from '#lib/projectFiles.ts'

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * A session over plain-text Files whose operations each run as the next Core step, the way an
 * adapter wraps every handler, so `undo` rolls back exactly the newest step.
 */
function steppedSession(files: Record<string, string> = {}, descriptors?: FileDescriptorOptions) {
    const fs = new FileSystem(
        Object.fromEntries(
            Object.entries(files).map(([path, content]) => [
                path,
                { encoding: 'plain' as const, content }
            ])
        )
    )
    const run = fs.beginSession(undefined, 1000, descriptors)
    let steps = 0
    return {
        fs,
        run,
        step: <T>(operation: () => T): T => run.performInstruction(steps++, operation),
        undo: () => run.undo(--steps)
    }
}

/** The errno name of the guest failure `operation` throws, or undefined when it succeeds. */
function failure(operation: () => unknown): FileErrorCode | undefined {
    try {
        operation()
    } catch (error) {
        if (error instanceof FileSystemGuestError) return error.code
        throw error
    }
    return undefined
}

function caught(operation: () => unknown): unknown {
    try {
        operation()
    } catch (error) {
        return error
    }
    throw new Error('Expected the operation to throw')
}

describe('FileSystem', () => {
    it('round-trips arbitrary bytes, BOMs, and UTF-8 without changing encoding semantics', () => {
        for (const bytes of [
            new Uint8Array([255, 0, 128]),
            new Uint8Array([239, 187, 191, 65]),
            new TextEncoder().encode('è')
        ]) {
            expect(fileBytes(bytesFile(bytes))).toEqual(bytes)
        }
        expect(bytesFile(new Uint8Array([195])).encoding).toBe('base64')
        expect(bytesFile(new Uint8Array([195, 168])).content).toBe('è')
    })
    it('allows extensionless and prototype-named files but rejects path collisions', () => {
        const fs = new FileSystem()
        fs.writeText('__proto__', 'safe')
        fs.writeText('.config', 'x')
        expect(fs.readText('/__proto__')).toBe('safe')
        expect(() => fs.writeText('.config/nested', 'x')).toThrow()
        expect(() => fs.writeText('../outside', '')).toThrow()
        expect(() => cleanFiles({ x: { encoding: 'plain', content: '\ud800' } })).toThrow()
    })
    it('locks all host mutations through exit until Stop, without reverting program output', () => {
        const fs = new FileSystem()
        const run = fs.beginSession()
        run.beginInstruction(1)
        const fd = run.open('output', 'write')
        run.write(fd, new TextEncoder().encode('hello'))
        run.endInstruction()
        expect(fs.readText('output')).toBe('hello')
        expect(() => fs.writeText('output', 'host')).toThrow('Stop')
        expect(() => fs.remove('output')).toThrow('Stop')
        run.stop()
        expect(fs.readText('output')).toBe('hello')
        expect(() => run.read(fd, 1)).toThrow('ended')
    })
    it('restores byte ranges, append lengths, descriptors, paths and positions together', () => {
        const fs = new FileSystem({ input: { encoding: 'plain', content: 'abc' } })
        const run = fs.beginSession()
        run.beginInstruction(1)
        const read = run.open('input', 'read')
        const write = run.open('input', 'append')
        run.endInstruction()
        run.beginInstruction(2)
        expect(run.read(read, 2)).toEqual(new TextEncoder().encode('ab'))
        run.write(write, new Uint8Array([255]))
        run.rename('input', 'moved')
        run.endInstruction()
        expect(fs.files.moved.encoding).toBe('base64')
        run.undo(2)
        expect(fs.readText('input')).toBe('abc')
        run.beginInstruction(2)
        expect(run.read(read, 3)).toEqual(new TextEncoder().encode('abc'))
        run.remove('input')
        run.write(write, new TextEncoder().encode('d'))
        const fresh = run.open('input', 'write')
        run.write(fresh, new TextEncoder().encode('new'))
        run.endInstruction()
        expect(fs.readText('input')).toBe('new')
        run.undo(2)
        expect(fs.readText('input')).toBe('abc')
        run.undo(1)
        expect(run.canUndo(1)).toBe(false)
    })
    it('keeps immutable build snapshots and enforces atomic capacity failures', () => {
        const fs = new FileSystem({ main: { encoding: 'plain', content: 'old' } })
        const snapshot = fs.snapshot('main')
        fs.writeText('main', 'new')
        expect(snapshot.files.main.content).toBe('old')
        expect(() => fs.writeBytes('huge', new Uint8Array(FILE_BYTE_LIMIT))).toThrow('16 MiB')
        expect(fs.files.huge).toBeUndefined()
    })
    it('evicts whole instruction groups without rejecting file operations', () => {
        const fs = new FileSystem()
        const run = fs.beginSession(100)
        run.beginInstruction(1)
        run.open('created', 'write')
        run.endInstruction()
        expect(run.canUndo(1)).toBe(false)
        expect(fs.files.created).toBeDefined()
        run.beginInstruction(2)
        run.endInstruction()
        expect(run.canUndo(2)).toBe(true)
        run.undo(2)
        expect(run.canUndo(1)).toBe(false)
    })
    it('publishes only named-file changes, not descriptor or cursor changes', () => {
        const fs = new FileSystem({ input: { encoding: 'plain', content: 'abc' } })
        let fileChanges = 0
        fs.subscribe((changed) => {
            if (changed) fileChanges++
        })
        const run = fs.beginSession()
        run.beginInstruction(1)
        const fd = run.open('input', 'read')
        run.read(fd, 1)
        run.endInstruction()
        expect(fileChanges).toBe(0)
        run.undo(1)
        expect(fileChanges).toBe(0)

        run.beginInstruction(2)
        run.open('created', 'write')
        run.endInstruction()
        expect(fileChanges).toBe(1)
        run.undo(2)
        expect(fileChanges).toBe(2)
    })

    it('rolls back only the Core step being undone, even when steps repeat an address', () => {
        const fs = new FileSystem()
        const run = fs.beginSession()
        //A loop can revisit one syscall PC, but each dynamic instruction has its own serial.
        run.performInstruction('open', () => run.open('log', 'write'))
        const fd = 3
        run.performInstruction('write-1', () => run.write(fd, new TextEncoder().encode('one')))
        run.performInstruction('non-file', () => undefined)
        run.performInstruction('write-2', () => run.write(fd, new TextEncoder().encode('two')))
        expect(fs.readText('log')).toBe('onetwo')
        //undoing the last step rolls back its write and nothing else
        run.undoAfter('write-2')
        expect(fs.readText('log')).toBe('one')
        //the step that recorded nothing rolls back nothing
        run.undoAfter('non-file')
        expect(fs.readText('log')).toBe('one')
        run.undoAfter('write-1')
        expect(fs.readText('log')).toBe('')
    })

    it.each([123, '123', 123n])(
        'compares opaque instruction id %s without coercing its type',
        (id) => {
            const fs = new FileSystem()
            const run = fs.beginSession()
            run.performInstruction(id, () => run.open('created', 'write'))
            for (const other of [123, '123', 123n].filter((value) => value !== id)) {
                run.undoAfter(other)
                expect(fs.files.created).toBeDefined()
            }
            run.undo(id)
            expect(fs.files.created).toBeUndefined()
        }
    )

    it('combines file and empty callbacks of one instruction into one bounded Undo frame', () => {
        const fs = new FileSystem({ data: { encoding: 'plain', content: 'abc' } })
        const run = fs.beginSession(undefined, 1)
        const id = '9007199254740993123'
        const read = run.performInstruction(id, () => run.open('data', 'read'))
        const write = run.performInstruction(id, () => run.open('data', 'append'))
        run.performInstruction(id, () => run.read(read, 1))
        run.performInstruction(id, () => run.write(write, encode('d')))
        run.performInstruction(id, () => undefined)
        expect(fs.readText('data')).toBe('abcd')
        expect(run.canUndo(id)).toBe(true)
        run.undo(id)
        expect(fs.readText('data')).toBe('abc')
        expect(run.canUndo(id)).toBe(false)
        expect(failure(() => run.performInstruction('next', () => run.read(read, 1)))).toBe(
            FileErrorCode.BadDescriptor
        )
    })

    it('never makes an instruction partially undoable after an earlier callback was evicted', () => {
        const fs = new FileSystem({ data: { encoding: 'plain', content: 'abc' } })
        const run = fs.beginSession(64)
        const id = 2n ** 63n
        const fd = run.performInstruction(id, () => run.open('data', 'append'))
        expect(run.canUndo(id)).toBe(false)
        run.performInstruction(id, () => run.write(fd, encode('d')))
        run.performInstruction(id, () => undefined)
        expect(fs.readText('data')).toBe('abcd')
        expect(run.canUndo(id)).toBe(false)
        expect(() => run.undo(id)).toThrow('FileSystem Undo history exhausted')
        expect(fs.readText('data')).toBe('abcd')
    })

    it('leaves a Core step alone when the top frame belongs to a different one', () => {
        const fs = new FileSystem()
        const run = fs.beginSession()
        run.performInstruction(10, () => run.open('log', 'write'))
        expect(run.canUndoAfter(99)).toBe(true)
        run.undoAfter(99)
        //nothing was rolled back: the frame belongs to step 10, not 99
        expect(fs.files.log).toBeDefined()
    })

    it('preflights every filesystem frame inside a serial range without rolling back any of them', () => {
        const fs = new FileSystem()
        const run = fs.beginSession(0)
        run.performInstruction('9007199254740993', () => run.open('created', 'write'))
        run.performInstruction('9007199254740998', () => undefined)
        expect(run.canUndoSerialRange(9007199254740993n, 9007199254740998n)).toBe(false)
        expect(run.canUndoSerialRange(9007199254740994n, 9007199254740998n)).toBe(true)
        expect(run.canUndoSerialRange(9007199254740993n, 9007199254740993n)).toBe(false)
        expect(run.canUndoSerialRange(9007199254740990n, 9007199254740992n)).toBe(true)
        expect(fs.readText('created')).toBe('')
        expect(run.canUndo('9007199254740998')).toBe(true)
        run.undo('9007199254740998')
        run.performInstruction('9007199254741000', () => undefined)
        expect(run.canUndoSerialRange(9007199254740998n, 9007199254741000n)).toBe(true)
        run.stop()
        expect(run.canUndoSerialRange(9007199254740998n, 9007199254741000n)).toBe(false)
    })

    it('skips unrelated journal frames and never reads their inverse payloads during preflight', () => {
        const run = new FileSystem().beginSession(0, 10_000)
        for (let id = 1; id <= 10_000; id++) run.performInstruction(String(id), () => undefined)
        const internal = run as unknown as { history: { changes: unknown }[] }
        let reads = 0
        for (const frame of internal.history)
            Object.defineProperty(frame, 'changes', {
                get: () => {
                    throw new Error('Preflight must not read inverses')
                }
            })
        internal.history = new Proxy(internal.history, {
            get: (frames, key, receiver) => {
                if (typeof key === 'string' && /^\d+$/.test(key)) reads++
                return Reflect.get(frames, key, receiver)
            }
        })
        expect(run.canUndoSerialRange(9998n, 10_000n)).toBe(true)
        expect(reads).toBeLessThan(40)
        run.stop()
    })

    it('charges closing a descriptor by what it retains, not by the size of the File', () => {
        const big = 'x'.repeat(64 * 1024)
        const fs = new FileSystem({ data: { encoding: 'plain', content: big } })
        //A budget far smaller than the File: open/close pairs used to be charged its whole length,
        //so a loop of them evicted the frames holding real byte diffs.
        const run = fs.beginSession(16 * 1024, 1000)
        let position = 0
        run.performInstruction(position++, () =>
            run.write(run.open('out', 'write'), new TextEncoder().encode('kept'))
        )
        for (let i = 0; i < 40; i++) {
            const fd = run.performInstruction(position++, () => run.open('data', 'read'))
            run.performInstruction(position++, () => run.close(fd))
        }
        //The first frame must still be undoable: if close() had been billed the File's length it
        //would have been evicted under this budget, and its write could never be rolled back.
        while (position > 1) {
            position -= 1
            run.undoAfter(position)
        }
        run.undoAfter(0)
        expect(fs.files.out).toBeUndefined()
    })
    it('seeks like lseek, undoes the move, and fills a gap left past the end with zeros', () => {
        const fs = new FileSystem()
        fs.writeText('data', 'abcdef')
        const run = fs.beginSession()
        const fd = run.performInstruction(4, () => run.open('data', 'read'))
        expect(run.performInstruction(8, () => run.seek(fd, 2, 0))).toBe(2)
        expect(new TextDecoder().decode(run.performInstruction(10, () => run.read(fd, 2)))).toBe(
            'cd'
        )
        expect(run.performInstruction(12, () => run.seek(fd, -1, 2))).toBe(5)
        expect(run.performInstruction(16, () => run.seek(fd, -2, 1))).toBe(3)
        run.undo(16)
        expect(new TextDecoder().decode(run.performInstruction(18, () => run.read(fd, 1)))).toBe(
            'f'
        )
        expect(() => run.performInstruction(19, () => run.seek(fd, -10, 1))).toThrow(
            'Invalid seek position'
        )
        expect(() => run.performInstruction(19, () => run.seek(fd, 0, 3))).toThrow(
            'Invalid seek origin'
        )
        const out = run.performInstruction(20, () => run.open('out', 'write'))
        run.performInstruction(24, () => run.seek(out, 3, 0))
        run.performInstruction(28, () => run.write(out, new TextEncoder().encode('x')))
        expect(Array.from(fs.readBytes('out'))).toEqual([0, 0, 0, 120])
    })
})

describe('FileSystemSession open flags', () => {
    it('reads and writes a read-write handle through one position, and Undo rewinds both', () => {
        const { fs, run, step, undo } = steppedSession({ data: 'abcdef' })
        const fd = step(() => run.open('data', { access: 'read-write' }))
        expect(decode(step(() => run.read(fd, 2)))).toBe('ab')
        step(() => run.write(fd, encode('XY')))
        expect(fs.readText('data')).toBe('abXYef')
        expect(decode(step(() => run.read(fd, 9)))).toBe('ef')
        undo()
        undo()
        expect(fs.readText('data')).toBe('abcdef')
        expect(decode(step(() => run.read(fd, 9)))).toBe('cdef')
    })

    it('creates, truncates, appends and refuses an existing File as the flags ask', () => {
        const { fs, run, step, undo } = steppedSession({ log: 'abc' })
        expect(failure(() => step(() => run.open('new', { access: 'read-write' })))).toBe(
            FileErrorCode.NotFound
        )
        expect(fs.files.new).toBeUndefined()
        const exclusive = { access: 'write', create: true, exclusive: true } as const
        expect(failure(() => step(() => run.open('log', exclusive)))).toBe(FileErrorCode.Exists)
        step(() => run.open('new', exclusive))
        expect(fs.readText('new')).toBe('')
        //O_EXCL without O_CREAT is ignored, as on Linux
        step(() => run.open('log', { access: 'read', exclusive: true }))

        step(() => run.open('log', { access: 'read-write', truncate: true }))
        expect(fs.readText('log')).toBe('')
        undo()
        expect(fs.readText('log')).toBe('abc')

        const appending = step(() => run.open('log', { access: 'read-write', append: true }))
        step(() => run.write(appending, encode('d')))
        step(() => run.seek(appending, 0, 0))
        expect(decode(step(() => run.read(appending, 2)))).toBe('ab')
        step(() => run.write(appending, encode('e')))
        expect(fs.readText('log')).toBe('abcde')
    })

    it('keeps the MARS shorthands: read is read-only, write creates or empties, append keeps', () => {
        const { fs, run, step } = steppedSession({ data: 'abc' })
        const reader = step(() => run.open('data', 'read'))
        expect(failure(() => step(() => run.write(reader, encode('x'))))).toBe(
            FileErrorCode.BadDescriptor
        )
        const writer = step(() => run.open('data', 'write'))
        expect(fs.readText('data')).toBe('')
        expect(failure(() => step(() => run.read(writer, 1)))).toBe(FileErrorCode.BadDescriptor)
        step(() => run.write(writer, encode('xy')))
        const appender = step(() => run.open('data', 'append'))
        step(() => run.write(appender, encode('z')))
        expect(fs.readText('data')).toBe('xyz')
        step(() => run.open('fresh', 'append'))
        expect(fs.readText('fresh')).toBe('')
    })
})

describe('FileSystemSession guest failures', () => {
    it('names each failure with its errno code and changes nothing', () => {
        const { fs, run, step } = steppedSession({ 'docs/a.txt': 'a', top: 't' })
        const reader = step(() => run.open('top', 'read'))
        const before = fs.files
        const cases: [FileErrorCode, () => unknown][] = [
            [FileErrorCode.NotFound, () => run.open('missing', 'read')],
            [FileErrorCode.NotFound, () => run.remove('missing')],
            [FileErrorCode.NotFound, () => run.truncate('missing', 0)],
            [FileErrorCode.NotFound, () => run.rename('missing', 'other')],
            [FileErrorCode.NotFound, () => run.list('missing')],
            [FileErrorCode.Exists, () => run.rename('top', 'docs/a.txt')],
            [FileErrorCode.BadDescriptor, () => run.read(42, 1)],
            [FileErrorCode.BadDescriptor, () => run.close(42)],
            [FileErrorCode.BadDescriptor, () => run.fstat(42)],
            [FileErrorCode.BadDescriptor, () => run.pwrite(reader, 0, encode('x'))],
            [FileErrorCode.BadDescriptor, () => run.open('top', 'read', reader)],
            [FileErrorCode.BadDescriptor, () => run.open('top', 'read', -1)],
            [FileErrorCode.IsDirectory, () => run.open('docs', 'read')],
            [FileErrorCode.IsDirectory, () => run.open('/', { access: 'read' })],
            [FileErrorCode.IsDirectory, () => run.remove('docs')],
            [FileErrorCode.IsDirectory, () => run.rename('docs', 'moved')],
            [FileErrorCode.IsDirectory, () => run.rename('top', 'docs')],
            [FileErrorCode.NotDirectory, () => run.open('top/inner', 'write')],
            [FileErrorCode.NotDirectory, () => run.open('docs/a.txt/inner', 'read')],
            [FileErrorCode.NotDirectory, () => run.rename('top', 'docs/a.txt/inner')],
            [FileErrorCode.NotDirectory, () => run.list('top')],
            [FileErrorCode.InvalidArgument, () => run.open('bad\u0001name', 'write')],
            [FileErrorCode.InvalidArgument, () => run.open('top', 'bogus' as never)],
            [FileErrorCode.InvalidArgument, () => run.read(reader, -1)],
            [FileErrorCode.InvalidArgument, () => run.pread(reader, -1, 1)],
            [FileErrorCode.InvalidArgument, () => run.seek(reader, -5, 1)],
            [FileErrorCode.InvalidArgument, () => run.seek(reader, 0, 3)],
            [FileErrorCode.InvalidArgument, () => run.ftruncate(reader, 0)],
            [FileErrorCode.InvalidArgument, () => run.truncate('top', -1)],
            [FileErrorCode.AccessDenied, () => run.open('../outside', 'write')],
            [FileErrorCode.AccessDenied, () => run.stat('docs/../../outside')]
        ]
        for (const [code, operation] of cases) expect(failure(() => step(operation))).toBe(code)
        expect(fs.files).toBe(before)
        expect(decode(step(() => run.read(reader, 9)))).toBe('t')
    })

    it('keeps environment failures exceptions that no program is told about', () => {
        const { run } = steppedSession({ top: '' })
        const outside = caught(() => run.open('created', 'write'))
        expect(outside).not.toBeInstanceOf(FileSystemGuestError)
        expect(String(outside)).toContain('outside an instruction transaction')
        expect(run.stat('created')).toBeUndefined()
        run.stop()
        const ended = caught(() => run.stat('top'))
        expect(ended).not.toBeInstanceOf(FileSystemGuestError)
        expect(() => guestFileFailure(ended)).toThrow('ended')
    })

    it('answers MARS with -1, a full FileSystem included, as its write service does', () => {
        expect(guestFileFailure(new FileSystemGuestError(FileErrorCode.NotFound, 'missing'))).toBe(
            -1
        )
        expect(guestFileFailure(new FileSystemGuestError(FileErrorCode.TooManyOpen, 'many'))).toBe(
            -1
        )
        expect(guestFileFailure(new ProjectFormatError('Invalid file path'))).toBe(-1)
        for (const code of [FileErrorCode.NoSpace, FileErrorCode.TooLarge])
            expect(guestFileFailure(new FileSystemGuestError(code, 'full'))).toBe(-1)
    })

    it('refuses the 16 MiB limits atomically: EFBIG for one File, ENOSPC for the Project', () => {
        const MiB = 1024 * 1024
        const { fs, run, step } = steppedSession({ big: '' })
        const fd = step(() => run.open('big', { access: 'read-write' }))
        expect(
            failure(() => step(() => run.pwrite(fd, FILE_BYTE_LIMIT - 1, new Uint8Array(2))))
        ).toBe(FileErrorCode.TooLarge)
        expect(failure(() => step(() => run.truncate('big', FILE_BYTE_LIMIT + 1)))).toBe(
            FileErrorCode.TooLarge
        )
        step(() => run.seek(fd, FILE_BYTE_LIMIT, 0))
        expect(failure(() => step(() => run.write(fd, new Uint8Array(1))))).toBe(
            FileErrorCode.TooLarge
        )
        expect(run.fstat(fd).size).toBe(0)

        step(() => run.ftruncate(fd, 10 * MiB))
        const other = step(() => run.open('other', 'write'))
        expect(failure(() => step(() => run.write(other, new Uint8Array(7 * MiB))))).toBe(
            FileErrorCode.NoSpace
        )
        expect(run.stat('other')).toEqual({ kind: 'file', size: 0 })
        //a File removed while a descriptor holds it keeps its space until that descriptor closes
        step(() => run.remove('big'))
        expect(failure(() => step(() => run.truncate('other', 7 * MiB)))).toBe(
            FileErrorCode.NoSpace
        )
        step(() => run.close(fd))
        step(() => run.truncate('other', 7 * MiB))
        expect(fs.readBytes('other')).toHaveLength(7 * MiB)
    })

    it('refuses a File past the 4,096-File limit as ENOSPC, creating nothing', () => {
        const files = Object.fromEntries(
            Array.from({ length: FILE_COUNT_LIMIT }, (_, index) => [`f${index}`, ''])
        )
        const { fs, run, step } = steppedSession(files)
        expect(failure(() => step(() => run.open('one-more', 'write')))).toBe(FileErrorCode.NoSpace)
        expect(fs.files['one-more']).toBeUndefined()
        expect(run.stat('one-more')).toBeUndefined()
        step(() => run.open('f0', 'write'))
    })
})

describe('FileSystemSession stat and list', () => {
    it('stats Files and Directories, which exist while they hold Files', () => {
        const { run, step, undo } = steppedSession({
            'docs/a.txt': 'hello',
            'docs/deep/b': '',
            top: ''
        })
        expect(run.stat('docs/a.txt')).toEqual({ kind: 'file', size: 5 })
        expect(run.stat('/docs')).toEqual({ kind: 'directory', size: 0 })
        expect(run.stat('docs/deep')).toEqual({ kind: 'directory', size: 0 })
        for (const root of ['', '/', '.'])
            expect(run.stat(root)).toEqual({ kind: 'directory', size: 0 })
        expect(run.stat('missing')).toBeUndefined()
        expect(run.stat('top/inner')).toBeUndefined()

        const fd = step(() => run.open('docs/a.txt', 'read'))
        step(() => run.remove('docs/deep/b'))
        step(() => run.remove('docs/a.txt'))
        expect(run.stat('docs')).toBeUndefined()
        //the open descriptor still reaches the removed File
        expect(run.fstat(fd)).toEqual({ kind: 'file', size: 5 })
        undo()
        expect(run.stat('docs')).toEqual({ kind: 'directory', size: 0 })
        expect(run.stat('docs/deep')).toBeUndefined()
        undo()
        expect(run.stat('docs/deep/b')).toEqual({ kind: 'file', size: 0 })

        step(() => run.open('new/dir/file', 'write'))
        expect(run.stat('new/dir')).toEqual({ kind: 'directory', size: 0 })
        undo()
        expect(run.stat('new')).toBeUndefined()
    })

    it("lists a Directory's immediate children in name order", () => {
        const { run, step, undo } = steppedSession({ 'b.txt': '', 'a/x': '', 'a/y/z': '', c: '' })
        expect(run.list('')).toEqual([
            { name: 'a', kind: 'directory' },
            { name: 'b.txt', kind: 'file' },
            { name: 'c', kind: 'file' }
        ])
        expect(run.list('/a')).toEqual([
            { name: 'x', kind: 'file' },
            { name: 'y', kind: 'directory' }
        ])
        step(() => run.rename('a/y/z', 'a/w'))
        expect(run.list('a')).toEqual([
            { name: 'w', kind: 'file' },
            { name: 'x', kind: 'file' }
        ])
        undo()
        expect(run.list('a/y')).toEqual([{ name: 'z', kind: 'file' }])
    })
})

describe('FileSystemSession truncate', () => {
    it('truncates by path without moving positions, and Undo restores what reads see', () => {
        const { fs, run, step, undo } = steppedSession({ data: 'abcdef' })
        const reader = step(() => run.open('data', 'read'))
        expect(decode(step(() => run.read(reader, 4)))).toBe('abcd')
        step(() => run.truncate('data', 2))
        expect(fs.readText('data')).toBe('ab')
        expect(run.stat('data')).toEqual({ kind: 'file', size: 2 })
        //the position stays at 4, past the new end
        expect(step(() => run.read(reader, 9))).toHaveLength(0)
        undo()
        undo()
        expect(fs.readText('data')).toBe('abcdef')
        expect(decode(step(() => run.read(reader, 9)))).toBe('ef')

        step(() => run.truncate('data', 8))
        expect(Array.from(fs.readBytes('data'))).toEqual([...encode('abcdef'), 0, 0])
        undo()
        expect(fs.readText('data')).toBe('abcdef')
    })

    it('truncates through a writable descriptor, even after the path was removed', () => {
        const { fs, run, step, undo } = steppedSession({ data: 'abcdef' })
        const reader = step(() => run.open('data', 'read'))
        expect(failure(() => step(() => run.ftruncate(reader, 0)))).toBe(
            FileErrorCode.InvalidArgument
        )
        const writer = step(() => run.open('data', { access: 'read-write' }))
        step(() => run.seek(writer, 5, 0))
        step(() => run.remove('data'))
        step(() => run.ftruncate(writer, 3))
        expect(run.fstat(writer)).toEqual({ kind: 'file', size: 3 })
        expect(decode(run.pread(writer, 0, 9))).toBe('abc')
        //the position stays at 5, so a write there leaves a gap of zeros
        step(() => run.write(writer, encode('!')))
        expect(Array.from(run.pread(writer, 0, 9))).toEqual([...encode('abc'), 0, 0, 33])
        undo()
        undo()
        expect(decode(run.pread(writer, 0, 9))).toBe('abcdef')
        undo()
        expect(fs.readText('data')).toBe('abcdef')
    })
})

describe('FileSystemSession pread and pwrite', () => {
    it("reads and writes at a position without moving the descriptor's", () => {
        const { fs, run, step, undo } = steppedSession({ data: 'abcdef' })
        const fd = step(() => run.open('data', { access: 'read-write' }))
        step(() => run.seek(fd, 4, 0))
        expect(decode(run.pread(fd, 1, 2))).toBe('bc')
        expect(run.pread(fd, 10, 2)).toHaveLength(0)
        step(() => run.pwrite(fd, 0, encode('Z')))
        expect(fs.readText('data')).toBe('Zbcdef')
        //neither moved the position from 4
        expect(decode(step(() => run.read(fd, 1)))).toBe('e')
        //past the end, the gap fills with zeros
        step(() => run.pwrite(fd, 8, encode('!')))
        expect(Array.from(fs.readBytes('data'))).toEqual([...encode('Zbcdef'), 0, 0, 33])
        undo()
        expect(fs.readText('data')).toBe('Zbcdef')
        undo()
        undo()
        expect(fs.readText('data')).toBe('abcdef')
        expect(decode(step(() => run.read(fd, 2)))).toBe('ef')
    })

    it('writes where asked even on an append descriptor, as POSIX has it', () => {
        const { fs, run, step } = steppedSession({ data: 'abc' })
        const fd = step(() => run.open('data', 'append'))
        step(() => run.pwrite(fd, 0, encode('A')))
        step(() => run.write(fd, encode('d')))
        expect(fs.readText('data')).toBe('Abcd')
    })
})

describe('FileSystemSession descriptors', () => {
    it("numbers descriptors from the session's first and refuses past its open limit", () => {
        const { fs, run, step } = steppedSession({ data: '' }, { firstDescriptor: 0, maxOpen: 8 })
        const descriptors = Array.from({ length: 8 }, () => step(() => run.open('data', 'read')))
        expect(descriptors).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
        //the ninth open fails before it creates anything
        expect(failure(() => step(() => run.open('created', 'write')))).toBe(
            FileErrorCode.TooManyOpen
        )
        expect(fs.files.created).toBeUndefined()
        step(() => run.close(3))
        expect(step(() => run.open('data', 'read'))).toBe(3)
    })

    it('counts from 3 without a limit by default, and takes a descriptor the caller picks', () => {
        const { run, step } = steppedSession({ data: '' })
        const descriptors = Array.from({ length: 100 }, () => step(() => run.open('data', 'read')))
        expect(descriptors[0]).toBe(3)
        expect(descriptors[99]).toBe(102)
        expect(step(() => run.open('data', 'read', 1))).toBe(1)
        expect(failure(() => step(() => run.open('data', 'read', 1)))).toBe(
            FileErrorCode.BadDescriptor
        )
        for (const options of [{ firstDescriptor: -1 }, { maxOpen: 1.5 }])
            expect(() => new FileSystem().beginSession(undefined, undefined, options)).toThrow(
                'descriptor options'
            )
    })

    it('closes every descriptor at once, and Undo reopens each where it was', () => {
        const { fs, run, step, undo } = steppedSession(
            { a: 'abc', b: 'xyz' },
            { firstDescriptor: 0, maxOpen: 8 }
        )
        let published = 0
        fs.subscribe((filesChanged) => {
            if (filesChanged) published++
        })
        const first = step(() => run.open('a', 'read'))
        const second = step(() => run.open('b', 'read'))
        step(() => run.read(first, 1))
        step(() => run.read(second, 2))
        step(() => run.closeAll())
        expect(failure(() => step(() => run.read(first, 1)))).toBe(FileErrorCode.BadDescriptor)
        expect(step(() => run.open('b', 'read'))).toBe(0)
        undo()
        undo()
        undo()
        expect(decode(step(() => run.read(first, 9)))).toBe('bc')
        expect(decode(step(() => run.read(second, 9)))).toBe('z')
        expect(published).toBe(0)
        step(() => run.closeAll())
        //with nothing open there is nothing to record, so no step is needed
        expect(() => run.closeAll()).not.toThrow()
    })
})

describe('Byte edits in the FileSystem', () => {
    /** A byte File `blob` of `ff 00 01 02` with one edit, `41 42` at 1, and a text File. */
    function edited() {
        const fs = new FileSystem({
            blob: { encoding: 'base64', content: encodeBase64(new Uint8Array([0xff, 0, 1, 2])) },
            'notes.txt': { encoding: 'plain', content: 'notes' }
        })
        fs.editBytes('blob', 1, encode('AB'))
        return fs
    }

    it('overwrites a byte File, keeping its original apart and its encoding', () => {
        const fs = edited()
        expect([...fs.readBytes('blob')]).toEqual([0xff, 0x41, 0x42, 2])
        expect([...originalBytes(fs.files.blob)]).toEqual([0xff, 0, 1, 2])
        expect(fs.files.blob.edits).toEqual([{ offset: 1, remove: 2, insert: 'QUI=' }])
        //every byte now decodes as UTF-8, and the File is still one of bytes
        fs.editBytes('blob', 0, encode('Z'))
        expect(decode(fs.readBytes('blob'))).toBe('ZAB\x02')
        expect(fs.files.blob.encoding).toBe('base64')
        expect(fs.files.blob.edits).toEqual([{ offset: 0, remove: 3, insert: 'WkFC' }])
        expect(() => fs.readText('blob')).toThrow(ProjectFormatError)
        //what a Build reads
        expect([...fileBytes(fs.snapshot('blob').files.blob)]).toEqual([0x5a, 0x41, 0x42, 2])
    })

    it('refuses a text File, a range past the end and a locked FileSystem', () => {
        const fs = edited()
        expect(() => fs.editBytes('notes.txt', 0, encode('N'))).toThrow(
            'Only a File stored as bytes takes Byte edits'
        )
        expect(() => fs.editBytes('blob', 3, encode('XY'))).toThrow('past the end')
        expect(failure(() => fs.editBytes('missing', 0, encode('X')))).toBe(FileErrorCode.NotFound)
        const run = fs.beginSession()
        expect(() => fs.editBytes('blob', 0, encode('X'))).toThrow('Stop')
        run.stop()
        fs.editBytes('blob', 3, encode('!'))
        expect(decode(fs.readBytes('blob').subarray(1))).toBe('AB!')
    })

    it('overwrites the text of a text File, which must stay UTF-8, keeping no Byte edits', () => {
        const fs = new FileSystem({ 'notes.md': { encoding: 'plain', content: 'é ok' } })
        fs.overwriteText('notes.md', 3, encode('OK'))
        expect(fs.files['notes.md']).toEqual({ encoding: 'plain', content: 'é OK' })
        //the two bytes of `é` together, but not one of them alone
        fs.overwriteText('notes.md', 0, Uint8Array.of(0xc3, 0xa8))
        expect(fs.readText('notes.md')).toBe('è OK')
        expect(() => fs.overwriteText('notes.md', 0, encode('e'))).toThrow(
            'notes.md is stored as text, and these bytes would leave it no longer UTF-8'
        )
        expect(fs.readText('notes.md')).toBe('è OK')
        expect(() => fs.overwriteText('notes.md', 4, encode('!!'))).toThrow('past the end')
        const bytes = new FileSystem({ blob: { encoding: 'base64', content: 'AAAA' } })
        expect(() => bytes.overwriteText('blob', 0, encode('X'))).toThrow(
            'Only a File stored as text has its text overwritten'
        )
    })

    it('refuses a File whose saved edits insert or delete, which it reads all the same', () => {
        const inserted = {
            encoding: 'base64' as const,
            content: encodeBase64(encode('abc')),
            edits: [
                { offset: 1, remove: 0, insert: encodeBase64(encode('XY')) },
                { offset: 4, remove: 1, insert: '' }
            ]
        }
        const fs = new FileSystem({ blob: inserted })
        expect(decode(fs.readBytes('blob'))).toBe('aXYb')
        expect(() => fs.editBytes('blob', 0, encode('Z'))).toThrow(
            'blob has Byte edits that insert or delete bytes, which this editor cannot add to'
        )
        expect(fs.files.blob.edits).toEqual(inserted.edits)
        //what a Build reads, and a session's program
        expect(decode(fileBytes(fs.snapshot('blob').files.blob))).toBe('aXYb')
        const run = fs.beginSession()
        run.beginInstruction(1)
        const fd = run.open('blob', { access: 'read' })
        expect(decode(run.read(fd, 8))).toBe('aXYb')
        run.endInstruction()
        run.stop()
    })

    it('keeps the Project within 16 MiB without checking every File again', () => {
        //16 MiB less one: the File, and two bytes of UTF-8 in a one-character text File
        const fs = new FileSystem({
            blob: {
                encoding: 'base64',
                content: encodeBase64(new Uint8Array(FILE_BYTE_LIMIT - 3))
            },
            'note.txt': { encoding: 'plain', content: '\u00e9' }
        })
        fs.editBytes('blob', 0, new Uint8Array([1]))
        //over the same byte, the edit takes no more room
        fs.editBytes('blob', 0, new Uint8Array([2]))
        const before = fs.files
        expect(() => fs.editBytes('blob', 2, new Uint8Array([3]))).toThrow(
            'Project exceeds the 16 MiB file limit'
        )
        expect(() =>
            fs.setByteEdits('blob', [{ offset: 5, remove: 2, insert: encodeBase64(encode('ab')) }])
        ).toThrow('Project exceeds the 16 MiB file limit')
        expect(fs.files).toBe(before)
        fs.editBytes('blob', 0, new Uint8Array([4]))
        expect(fs.files.blob.edits).toEqual([{ offset: 0, remove: 1, insert: 'BA==' }])
        //the Files stay as `cleanFiles` leaves them: frozen, and a map with no prototype
        expect(Object.isFrozen(fs.files)).toBe(true)
        expect(Object.getPrototypeOf(fs.files)).toBe(null)
        expect(() => fs.setByteEdits('blob', [{ offset: 0, remove: 1, insert: 'AQ' }])).toThrow(
            'Noncanonical'
        )
    })

    it('drops the edits when the whole content is replaced, as an upload does', () => {
        const fs = edited()
        fs.writeBytes('blob', new Uint8Array([9, 0xff]))
        expect(fs.files.blob).toEqual({ encoding: 'base64', content: 'Cf8=' })
        //a rename keeps the record
        const other = edited()
        other.rename('blob', 'moved')
        expect(other.files.moved.edits).toHaveLength(1)
    })

    it("drops the edits at a program's write, which becomes the original", () => {
        const fs = edited()
        const run = fs.beginSession()
        run.beginInstruction(1)
        const fd = run.open('blob', { access: 'read-write' })
        expect([...run.read(fd, 4)]).toEqual([0xff, 0x41, 0x42, 2])
        run.endInstruction()
        //reading changes nothing
        expect(fs.files.blob.edits).toHaveLength(1)
        run.beginInstruction(2)
        run.pwrite(fd, 3, new Uint8Array([0xfe]))
        run.endInstruction()
        expect(fs.files.blob).toEqual({
            encoding: 'base64',
            content: encodeBase64(new Uint8Array([0xff, 0x41, 0x42, 0xfe]))
        })
    })

    it('restores the original and its edits on Undo, rather than rebuilding them', () => {
        const fs = edited()
        const before = fs.files.blob
        const session = fs.beginSession(undefined, 1000)
        let steps = 0
        const step = <T>(operation: (run: typeof session) => T): T =>
            session.performInstruction(steps++, () => operation(session))
        const undo = () => session.undo(--steps)
        const fd = step((run) => run.open('blob', { access: 'read-write' }))
        //a write that turns every byte into valid UTF-8, which a rebuilt record would make text
        step((run) => run.pwrite(fd, 0, encode('Z')))
        step((run) => run.write(fd, encode('more')))
        expect(fs.files.blob.encoding).toBe('plain')
        undo()
        undo()
        expect(fs.files.blob).toBe(before)
        //a truncation and an append, undone the same way
        step((run) => run.ftruncate(fd, 1))
        step((run) => run.seek(fd, 0, 2))
        step((run) => run.write(fd, new Uint8Array([0x80])))
        undo()
        undo()
        undo()
        expect(fs.files.blob).toBe(before)
        expect(fs.files.blob.edits).toHaveLength(1)
    })

    it('puts back a whole list of edits, as the Hex editor undoes one', () => {
        const fs = edited()
        const before = fs.files.blob.edits!
        fs.editBytes('blob', 3, encode('!'))
        fs.setByteEdits('blob', before)
        expect([...fs.readBytes('blob')]).toEqual([0xff, 0x41, 0x42, 2])
        //an empty list leaves the original, with no edits kept
        fs.setByteEdits('blob', [])
        expect(fs.files.blob).toEqual({ encoding: 'base64', content: '/wABAg==' })
        //checked as a saved list is, and refused where `editBytes` is
        expect(() => fs.setByteEdits('blob', [{ offset: 3, remove: 2, insert: 'QUI=' }])).toThrow(
            'past the end'
        )
        expect(() => fs.setByteEdits('notes.txt', [])).toThrow('stored as bytes')
        const run = fs.beginSession()
        expect(() => fs.setByteEdits('blob', before)).toThrow('Stop')
        run.stop()
    })
})

describe('the Build output in a FileSystemSession', () => {
    const program = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])

    it('is a File the program lists, stats, opens and reads at its path', () => {
        const { run, step } = steppedSession({ 'main.asm': 'nop', 'src/a.c': 'x' })
        expect(run.presentBuildOutput('src/main', program)).toBe(true)
        expect(run.buildOutputPath).toBe('src/main')
        expect(run.list('src')).toEqual([
            { name: 'a.c', kind: 'file' },
            { name: 'main', kind: 'file' }
        ])
        expect(run.stat('./src/main')).toEqual({ kind: 'file', size: program.length })
        const fd = step(() => run.open('src/main', { access: 'read', create: true }))
        expect([...step(() => run.read(fd, 4))]).toEqual([0x7f, 0x45, 0x4c, 0x46])
        expect(run.fstat(fd)).toEqual({ kind: 'file', size: program.length })
    })

    it('refuses every change to it, as Linux refuses a running executable, changing nothing', () => {
        const { fs, run, step } = steppedSession({ 'main.asm': 'nop' })
        run.presentBuildOutput('main', program)
        const reader = step(() => run.open('main', 'read'))
        const before = fs.files
        const cases: [FileErrorCode, () => unknown][] = [
            [FileErrorCode.TextBusy, () => run.open('main', 'write')],
            [FileErrorCode.TextBusy, () => run.open('main', 'append')],
            [FileErrorCode.TextBusy, () => run.open('main', { access: 'read-write' })],
            [FileErrorCode.TextBusy, () => run.open('main', { access: 'read', truncate: true })],
            [FileErrorCode.TextBusy, () => run.truncate('main', 0)],
            [FileErrorCode.Busy, () => run.remove('main')],
            [FileErrorCode.Busy, () => run.rename('main', 'other')],
            [FileErrorCode.Busy, () => run.rename('main.asm', 'main')],
            [
                FileErrorCode.Exists,
                () => run.open('main', { access: 'read', create: true, exclusive: true })
            ],
            [FileErrorCode.BadDescriptor, () => run.pwrite(reader, 0, encode('x'))],
            [FileErrorCode.InvalidArgument, () => run.ftruncate(reader, 0)],
            [FileErrorCode.NotDirectory, () => run.open('main/inner', 'write')]
        ]
        for (const [code, operation] of cases) expect(failure(() => step(operation))).toBe(code)
        expect(fs.files).toBe(before)
        expect([...step(() => run.read(reader, 8))]).toEqual([...program])
    })

    it('is never published into the Project, nor counted toward its limits', () => {
        const { fs, run, step } = steppedSession({ 'main.asm': 'nop' })
        run.presentBuildOutput('main', new Uint8Array(FILE_BYTE_LIMIT - 8))
        const fd = step(() => run.open('out.txt', 'write'))
        step(() => run.write(fd, encode('written')))
        expect(Object.keys(fs.files).sort()).toEqual(['main.asm', 'out.txt'])
        expect(fs.files['out.txt']).toEqual({ encoding: 'plain', content: 'written' })
    })

    it('is not placed where a File or a folder of the Project is', () => {
        const { run } = steppedSession({ main: 'a note', 'src/main/x.c': 'x' })
        expect(run.presentBuildOutput('main', program)).toBe(false)
        expect(run.presentBuildOutput('src/main', program)).toBe(false)
        expect(run.buildOutputPath).toBeUndefined()
        expect(run.stat('main')).toEqual({ kind: 'file', size: 6 })
    })
})

/**
 * Annotations ride on a File's record beside its Byte edits
 * ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
 * decisions 3 and 20): changed through `annotate`, kept by every change that leaves the bytes'
 * addresses where they were, dropped with a whole new content, and made during a Debug session too.
 */
describe('Annotations in the FileSystem', () => {
    const names = (name: string) => ({ names: { '0x1139': name } })
    /** A byte File `chall` named `check` at 0x1139, and a text File. */
    function annotated() {
        const fs = new FileSystem({
            chall: { encoding: 'base64', content: encodeBase64(new Uint8Array([0xff, 0, 1, 2])) },
            'notes.txt': { encoding: 'plain', content: 'notes' }
        })
        fs.annotate('chall', names('check'))
        return fs
    }
    /** Every File change notice `fs` sends, with whether the Files changed. */
    function notices(fs: FileSystem) {
        const seen: boolean[] = []
        fs.subscribe((filesChanged) => seen.push(filesChanged))
        return seen
    }

    it('replaces the record, tells of the change, and takes them away', () => {
        const fs = annotated()
        const seen = notices(fs)
        const bytes = fs.files.chall.content
        expect(fs.files.chall.annotations).toEqual(names('check'))
        fs.annotate('./chall', { ...names('verify'), comments: { '0x1150': 'here' } })
        expect(fs.files.chall.annotations).toEqual({
            ...names('verify'),
            comments: { '0x1150': 'here' }
        })
        expect(fs.files.chall.content).toBe(bytes)
        expect(seen).toEqual([true])
        //the same record again changes nothing and tells no one
        const before = fs.files
        fs.annotate('chall', { comments: { '0x1150': 'here' }, ...names('verify') })
        expect(fs.files).toBe(before)
        expect(seen).toEqual([true])
        fs.annotate('chall', undefined)
        expect(fs.files.chall).toEqual({ encoding: 'base64', content: '/wABAg==' })
        expect(seen).toEqual([true, true])
        //the Files stay as `cleanFiles` leaves them
        expect(Object.isFrozen(fs.files)).toBe(true)
        expect(Object.getPrototypeOf(fs.files)).toBe(null)
    })

    it('refuses a missing File and a record that does not hold up, changing nothing', () => {
        const fs = annotated()
        const before = fs.files
        expect(failure(() => fs.annotate('missing', names('x')))).toBe(FileErrorCode.NotFound)
        expect(() => fs.annotate('chall', names('rax'))).toThrow(
            "chall has a name at 0x1139 that can't be used: “rax” is an x86 register. Choose another name."
        )
        expect(() => fs.annotate('chall', { comments: { '0x1': 'x'.repeat(4001) } })).toThrow(
            ProjectFormatError
        )
        expect(fs.files).toBe(before)
    })

    it("keeps the Project's Annotations within 256 KiB together", () => {
        const fs = annotated()
        const comments = (count: number) => ({
            comments: Object.fromEntries(
                Array.from({ length: count }, (_, index) => [
                    `0x${(0x100000 + index).toString(16)}`,
                    'x'.repeat(4000)
                ])
            )
        })
        fs.annotate('notes.txt', comments(60))
        const before = fs.files
        expect(() => fs.annotate('chall', comments(6))).toThrow(
            'This Project could not be saved, as it contains too many renames and comments (at most 256 KiB). Delete some and try again.'
        )
        expect(fs.files).toBe(before)
        fs.annotate('chall', comments(5))
    })

    it('keeps them through Byte edits, their Undo, a rename and every other File changing', () => {
        const fs = annotated()
        fs.editBytes('chall', 1, encode('AB'))
        expect(fs.files.chall.annotations).toEqual(names('check'))
        fs.setByteEdits('chall', [])
        expect(fs.files.chall.annotations).toEqual(names('check'))
        fs.writeText('notes.txt', 'more notes')
        fs.rename('chall', 'bin/chall')
        expect(fs.files['bin/chall'].annotations).toEqual(names('check'))
        //and through a Build's snapshot, which a Debug session's Listing reads
        expect(fs.snapshot('bin/chall').files['bin/chall'].annotations).toEqual(names('check'))
    })

    it('keeps them when typing over the bytes of an Executable stored as text', () => {
        const fs = new FileSystem({ elf: { encoding: 'plain', content: 'ELF text' } })
        fs.annotate('elf', names('check'))
        fs.overwriteText('elf', 0, encode('elf'))
        expect(fs.files.elf).toEqual({
            encoding: 'plain',
            content: 'elf text',
            annotations: names('check')
        })
    })

    it('drops them with a whole new content, as an upload over the File does', () => {
        const fs = annotated()
        fs.writeBytes('chall', new Uint8Array([0xff, 0, 1, 2]))
        expect(fs.files.chall).toEqual({ encoding: 'base64', content: '/wABAg==' })
        const text = new FileSystem({ 'notes.txt': { encoding: 'plain', content: 'notes' } })
        text.annotate('notes.txt', names('check'))
        text.writeText('notes.txt', 'notes')
        expect(text.files['notes.txt']).toEqual({ encoding: 'plain', content: 'notes' })
    })

    it('takes them during a Debug session, through the record the session publishes', () => {
        const fs = annotated()
        const session = fs.beginSession(undefined, 1000)
        let steps = 0
        const step = <T>(operation: () => T): T => session.performInstruction(steps++, operation)
        const fd = step(() => session.open('out.txt', 'write'))
        expect(() => fs.editBytes('chall', 0, encode('X'))).toThrow('Stop')
        fs.annotate('chall', names('verify'))
        expect(fs.files.chall.annotations).toEqual(names('verify'))
        //a later publish keeps them, and no instruction Undo takes them back
        step(() => session.write(fd, encode('log')))
        expect(fs.files.chall.annotations).toEqual(names('verify'))
        session.undo(--steps)
        expect(fs.files['out.txt']).toEqual({ encoding: 'plain', content: '' })
        expect(fs.files.chall.annotations).toEqual(names('verify'))
        //the Build output is no File of the Project, and takes none
        session.presentBuildOutput('program', new Uint8Array([0x7f]))
        expect(failure(() => fs.annotate('program', names('x')))).toBe(FileErrorCode.NotFound)
        expect(failure(() => fs.annotate('missing', names('x')))).toBe(FileErrorCode.NotFound)
        expect(() => fs.annotate('chall', names('int'))).toThrow(
            '“int” is a C keyword. Choose another name.'
        )
        session.stop()
        expect(fs.files.chall.annotations).toEqual(names('verify'))
        expect(() => session.annotate('chall', names('late'))).toThrow('ended')
    })

    it("drops them at a program's write, and an Undo of it brings the record back", () => {
        const fs = annotated()
        const before = fs.files.chall
        const session = fs.beginSession(undefined, 1000)
        let steps = 0
        const step = <T>(operation: () => T): T => session.performInstruction(steps++, operation)
        const fd = step(() => session.open('chall', { access: 'read-write' }))
        step(() => session.pwrite(fd, 3, new Uint8Array([0xfe])))
        expect(fs.files.chall).toEqual({
            encoding: 'base64',
            content: encodeBase64(new Uint8Array([0xff, 0, 1, 0xfe]))
        })
        //made after the write, on the record built from the new bytes
        fs.annotate('chall', names('after'))
        expect(fs.files.chall.annotations).toEqual(names('after'))
        expect(fileBytes(fs.files.chall)).toEqual(new Uint8Array([0xff, 0, 1, 0xfe]))
        //Undo of the write puts back the record from before it, with the Annotations it had then
        session.undo(--steps)
        expect(fs.files.chall).toBe(before)
        expect(fs.files.chall.annotations).toEqual(names('check'))
        //an append drops them too, even to a File stored as text
        fs.annotate('notes.txt', names('notes'))
        const notes = step(() => session.open('notes.txt', 'append'))
        step(() => session.write(notes, encode('!')))
        expect(fs.files['notes.txt']).toEqual({ encoding: 'plain', content: 'notes!' })
        session.undo(--steps)
        expect(fs.files['notes.txt'].annotations).toEqual(names('notes'))
        session.stop()
    })

    it('takes a renamed File by its new path during a session', () => {
        const fs = annotated()
        const session = fs.beginSession(undefined, 1000)
        session.performInstruction(0, () => session.rename('chall', 'moved'))
        expect(fs.files.moved.annotations).toEqual(names('check'))
        fs.annotate('moved', names('moved'))
        expect(fs.files.moved.annotations).toEqual(names('moved'))
        expect(failure(() => fs.annotate('chall', names('x')))).toBe(FileErrorCode.NotFound)
        session.stop()
    })

    it("refuses a session's record past the Project's 256 KiB together", () => {
        const fs = annotated()
        const big = (from: number, count: number) => ({
            comments: Object.fromEntries(
                Array.from({ length: count }, (_, index) => [
                    `0x${(0x100000 + from + index).toString(16)}`,
                    'x'.repeat(4000)
                ])
            )
        })
        fs.annotate('notes.txt', big(0, 60))
        const session = fs.beginSession()
        const before = fs.files
        expect(() => fs.annotate('chall', big(0, 6))).toThrow(
            'This Project could not be saved, as it contains too many renames and comments (at most 256 KiB). Delete some and try again.'
        )
        expect(fs.files).toBe(before)
        fs.annotate('chall', big(0, 5))
        expect(Object.keys(fs.files.chall.annotations!.comments!)).toHaveLength(5)
        session.stop()
    })
})
