import { describe, expect, it } from 'vite-plus/test'
import { ByteEditHistory } from './byteEditHistory'
import type { ByteEdit, ProjectFile } from '#lib/projectFiles.ts'

const edit = (offset: number, insert: string): ByteEdit => ({ offset, remove: 1, insert })
const file = (edits?: ByteEdit[], content = 'AAAA'): ProjectFile => ({
    encoding: 'base64',
    content,
    ...(edits ? { edits } : {})
})

describe('the Hex editor history', () => {
    it("puts back a File's edits as they were before each change, and again after", () => {
        const history = new ByteEditHistory()
        const first = [edit(0, 'QQ==')]
        history.record('blob', file(), 0)
        history.record('blob', file(first), 2)
        const second = [edit(0, 'QQ=='), edit(2, 'Qg==')]
        expect(history.undo('blob', file(second))).toEqual({ edits: first, offset: 2 })
        expect(history.undo('blob', file(first))).toEqual({ edits: [], offset: 0 })
        expect(history.undo('blob', file())).toBeUndefined()
        expect(history.redo('blob', file())).toEqual({ edits: first, offset: 0 })
        expect(history.redo('blob', file(first))).toEqual({ edits: second, offset: 2 })
        expect(history.redo('blob', file(second))).toBeUndefined()
    })

    it('forgets what can be redone at a new change', () => {
        const history = new ByteEditHistory()
        history.record('blob', file(), 0)
        history.undo('blob', file([edit(0, 'QQ==')]))
        history.record('blob', file(), 1)
        expect(history.redo('blob', file([edit(1, 'QQ==')]))).toBeUndefined()
    })

    it('starts again over a new original, and follows a renamed File', () => {
        const history = new ByteEditHistory()
        history.record('blob', file(), 0)
        expect(history.undo('blob', file(undefined, 'BBBB'))).toBeUndefined()
        history.record('blob', file(), 0)
        history.move('blob', 'moved')
        expect(history.undo('blob', file([edit(0, 'QQ==')]))).toBeUndefined()
        expect(history.undo('moved', file([edit(0, 'QQ==')]))).toEqual({ edits: [], offset: 0 })
        history.record('moved', file(), 0)
        history.move('moved')
        expect(history.undo('moved', file([edit(0, 'QQ==')]))).toBeUndefined()
    })

    it('writes back what a change to a text File wrote over, while the text still holds it', () => {
        const history = new ByteEditHistory()
        const bytes = (text: string) => new TextEncoder().encode(text)
        //`abcd`, then `xy` over `bc`, then `z` over `d`
        history.recordText('notes.md', { offset: 1, before: bytes('bc'), after: bytes('xy') })
        history.recordText('notes.md', { offset: 3, before: bytes('d'), after: bytes('z') })
        expect(history.undoText('notes.md', bytes('axyz'))).toMatchObject({ offset: 3 })
        expect(history.undoText('notes.md', bytes('axyd'))?.before).toEqual(bytes('bc'))
        expect(history.undoText('notes.md', bytes('abcd'))).toBeUndefined()
        expect(history.redoText('notes.md', bytes('abcd'))?.after).toEqual(bytes('xy'))
        //typing into its Text view that moves nothing leaves the step fitting the text
        expect(history.redoText('notes.md', bytes('Axyd'))?.after).toEqual(bytes('z'))
        //typing that moves the bytes the step wrote, and the stack starts again
        expect(history.undoText('notes.md', bytes('Q-axyz'))).toBeUndefined()
        expect(history.undoText('notes.md', bytes('axyz'))).toBeUndefined()
    })

    it('starts again when a text File is replaced by a byte File, or the other way', () => {
        const history = new ByteEditHistory()
        const change = { offset: 0, before: Uint8Array.of(1), after: Uint8Array.of(2) }
        history.recordText('a', change)
        history.record('a', file(), 0)
        expect(history.undoText('a', Uint8Array.of(2))).toBeUndefined()
        history.record('a', file(), 0)
        history.recordText('a', change)
        expect(history.undo('a', file([edit(0, 'QQ==')]))).toBeUndefined()
    })
})
