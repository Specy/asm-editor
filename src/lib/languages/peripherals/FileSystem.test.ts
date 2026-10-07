import { describe, expect, it } from 'vitest'
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
    fileBytes,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    ProjectFormatError
} from '$lib/projectFiles'

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
