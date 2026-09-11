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

    it('rewinds to a position rather than matching one frame, so a Core step pairs either way', () => {
        const fs = new FileSystem()
        const run = fs.beginSession()
        //Three operations at three execution positions; the middle one touches no File.
        run.performInstruction(10, () => run.open('log', 'write'))
        run.performInstruction(20, () => run.write(0 + 3, new TextEncoder().encode('one')))
        run.performInstruction(30, () => undefined)
        run.performInstruction(40, () => run.write(3, new TextEncoder().encode('two')))
        expect(fs.readText('log')).toBe('onetwo')
        //Rewinding past position 40 undoes only the last write, even though the step in between
        //recorded nothing: the journal answers "what happened after here", not "whose frame is on
        //top". Matching by name is what let a repeated address consume an unrelated frame.
        run.undoAfter(35)
        expect(fs.readText('log')).toBe('one')
        //And a rewind that skips several positions at once rolls back everything past it.
        run.undoAfter(5)
        expect(fs.files.log).toBeUndefined()
    })
    it('refuses a position that moves backwards, which is what a program counter would do', () => {
        const fs = new FileSystem()
        const run = fs.beginSession()
        run.performInstruction(100, () => run.open('log', 'write'))
        //A loop revisiting the same address hands back a position it has already passed. Equal is
        //allowed (a Core step that records nothing leaves the position alone); going back is not.
        expect(() => run.beginInstruction(100)).not.toThrow()
        run.endInstruction()
        expect(() => run.beginInstruction(40)).toThrow('backwards')
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
        //Everything, including the very first frame: if close() had been billed the File's length
        //that frame would have been evicted and this rewind would leave 'kept' behind.
        run.undoAfter(-1)
        expect(fs.files.out).toBeUndefined()
    })
})
