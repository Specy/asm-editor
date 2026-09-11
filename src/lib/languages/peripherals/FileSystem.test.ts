import { describe, expect, it } from 'vitest'
import { FileSystem } from './FileSystem'
import { bytesFile, cleanFiles, fileBytes, FILE_BYTE_LIMIT } from '$lib/projectFiles'

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
        //A loop revisits the same syscall address, so ids repeat. Every dispatched handler opens a
        //frame — including the ones that touch no File — which is what keeps frames and steps
        //one-to-one and lets Undo pop exactly the frame the step being rewound created.
        run.performInstruction(0x400048, () => run.open('log', 'write'))
        const fd = 3
        run.performInstruction(0x400048, () => run.write(fd, new TextEncoder().encode('one')))
        run.performInstruction(0x400048, () => undefined)
        run.performInstruction(0x400048, () => run.write(fd, new TextEncoder().encode('two')))
        expect(fs.readText('log')).toBe('onetwo')
        //undoing the last step rolls back its write and nothing else
        run.undoAfter(0x400048)
        expect(fs.readText('log')).toBe('one')
        //the step that recorded nothing rolls back nothing
        run.undoAfter(0x400048)
        expect(fs.readText('log')).toBe('one')
        run.undoAfter(0x400048)
        expect(fs.readText('log')).toBe('')
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
})
