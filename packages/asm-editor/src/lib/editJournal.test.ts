/**
 * The Edit journal ([ADR 0063](../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)):
 * Undo and Redo of what the Hex and Pixel editors change, kept beside the Project as the bytes
 * each change overwrote.
 */
import { describe, expect, it } from 'vite-plus/test'
import { FileSystem } from './languages/peripherals/FileSystem'
import {
    EditJournal,
    JOURNAL_FILE_BUDGET,
    JOURNAL_PROJECT_BUDGET,
    JOURNAL_STEP_LIMIT,
    type SavedJournal
} from './editJournal'
import { encodeBase64, fileBytes } from './projectFiles'

const bytes = (...values: number[]) => Uint8Array.from(values)
const byteFile = (values: Uint8Array) => ({
    encoding: 'base64' as const,
    content: encodeBase64(values)
})
const write = (offset: number, ...values: number[]) => ({
    runs: [{ offset, bytes: bytes(...values) }]
})

function setup(size = 6) {
    const fs = new FileSystem({ 'a.bin': byteFile(new Uint8Array(size)) })
    const changed: string[] = []
    const journal = new EditJournal(fs, (path) => changed.push(path))
    const read = (path = 'a.bin') => [...fs.readBytes(path)]
    /** Pencil steps writing 1, 2, 3… at offsets 0, 1, 2… */
    const draw = (count: number) => {
        for (let step = 0; step < count; step++)
            journal.change('a.bin', 'Pencil', write(step, step + 1), 1000 + step)
    }
    return { fs, journal, changed, read, draw }
}

describe('the Edit journal', () => {
    it('keeps each change as the bytes it overwrote, and undoes and redoes them', () => {
        const { journal, read, draw, changed } = setup()
        draw(3)
        expect(read()).toEqual([1, 2, 3, 0, 0, 0])
        expect(journal.journalOf('a.bin')?.undo.map((step) => step.label)).toEqual([
            'Pencil',
            'Pencil',
            'Pencil'
        ])
        //one side only: the bytes the step overwrote
        expect(journal.journalOf('a.bin')?.undo[2].change).toEqual(write(2, 0))
        expect(journal.undo('a.bin')).toEqual(write(2, 0))
        expect(read()).toEqual([1, 2, 0, 0, 0, 0])
        //the step to redo holds the bytes Undo overwrote
        expect(journal.journalOf('a.bin')?.redo[0].change).toEqual(write(2, 3))
        expect(journal.undo('a.bin', true)).toEqual(write(2, 3))
        expect(read()).toEqual([1, 2, 3, 0, 0, 0])
        expect(journal.undo('a.bin', true)).toBeUndefined()
        expect(changed.every((path) => path === 'a.bin')).toBe(true)
    })

    it('drops what Undo took back when a new change is made', () => {
        const { journal, read, draw } = setup()
        draw(3)
        journal.undo('a.bin')
        journal.change('a.bin', 'Fill', write(5, 9))
        expect(journal.journalOf('a.bin')?.redo).toEqual([])
        expect(read()).toEqual([1, 2, 0, 0, 0, 9])
    })

    it('goes back and forward to any step in one change of the File', () => {
        const { fs, journal, read, draw } = setup()
        draw(4)
        let saves = 0
        fs.subscribe(() => saves++)
        expect(journal.goTo('a.bin', 1)).toBe(true)
        expect(saves).toBe(1)
        expect(read()).toEqual([1, 0, 0, 0, 0, 0])
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(1)
        expect(journal.journalOf('a.bin')?.redo).toHaveLength(3)
        expect(journal.goTo('a.bin', 3)).toBe(true)
        expect(read()).toEqual([1, 2, 3, 0, 0, 0])
        //the step to redo next is the oldest taken back
        expect(journal.undo('a.bin', true)).toEqual(write(3, 4))
        expect(journal.goTo('a.bin', 0)).toBe(true)
        expect(read()).toEqual([0, 0, 0, 0, 0, 0])
        expect(journal.goTo('a.bin', 5)).toBe(false)
        expect(journal.goTo('a.bin', -1)).toBe(false)
        expect(journal.goTo('missing', 0)).toBe(false)
    })

    it('puts back a whole content Canvas size replaced, its encoding with it', () => {
        const { fs, journal, read, draw } = setup()
        draw(2)
        journal.change('a.bin', 'Canvas size 2 × 2', {
            content: new Uint8Array(10).fill(5),
            encoding: 'base64'
        })
        expect(read()).toHaveLength(10)
        journal.change('a.bin', 'Pencil', write(9, 1))
        journal.goTo('a.bin', 2)
        expect(read()).toEqual([1, 2, 0, 0, 0, 0])
        journal.goTo('a.bin', 4)
        expect(fileBytes(fs.files['a.bin'])[9]).toBe(1)
    })

    it('forgets the steps of a File something else changed since', () => {
        const { fs, journal, draw, changed } = setup()
        draw(2)
        changed.length = 0
        //a program's write, an upload, typing into the Text view
        fs.writeBytes('a.bin', bytes(7, 7, 7, 7, 7, 7), true, 'base64')
        expect(journal.journalOf('a.bin')).toBeUndefined()
        expect(changed).toEqual(['a.bin'])
        expect(journal.undo('a.bin')).toBeUndefined()
        expect([...fs.readBytes('a.bin')]).toEqual([7, 7, 7, 7, 7, 7])
        //a new change starts again
        journal.change('a.bin', 'Pencil', write(0, 1))
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(1)
    })

    it('moves with a renamed File and goes with a deleted one', () => {
        const { fs, journal, draw } = setup()
        draw(2)
        fs.rename('a.bin', 'b.bin')
        journal.rename('a.bin', 'b.bin')
        expect(journal.journalOf('a.bin')).toBeUndefined()
        expect(journal.undo('b.bin')).toEqual(write(1, 0))
        journal.drop('b.bin')
        expect(journal.journalOf('b.bin')).toBeUndefined()
    })

    it('keeps a change the FileSystem refused out of the journal', () => {
        const { fs, journal, draw } = setup()
        draw(1)
        const session = fs.beginSession()
        expect(() => journal.undo('a.bin')).toThrow('Stop the Debug session')
        session.stop()
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(1)
        expect(() => journal.change('a.bin', 'Pencil', write(9, 1))).toThrow('past the end')
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(1)
    })

    it('forgets the oldest steps past the budgets, the newest kept', () => {
        const big = JOURNAL_FILE_BUDGET / 4
        const fs = new FileSystem({
            'a.bin': byteFile(new Uint8Array(big)),
            'b.bin': byteFile(new Uint8Array(JOURNAL_PROJECT_BUDGET))
        })
        const journal = new EditJournal(fs)
        const fill = (path: string, size: number, value: number) =>
            journal.change(path, 'Fill', {
                runs: [{ offset: 0, bytes: new Uint8Array(size).fill(value) }]
            })
        for (let step = 1; step <= 6; step++) fill('a.bin', big, step)
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(4)
        //the oldest kept is the third Fill's, which overwrote the second's
        expect(journal.journalOf('a.bin')?.undo[0].change).toEqual({
            runs: [{ offset: 0, bytes: new Uint8Array(big).fill(2) }]
        })
        //one step larger than the budget is still kept, alone
        fill('b.bin', JOURNAL_PROJECT_BUDGET, 1)
        expect(journal.journalOf('b.bin')?.undo).toHaveLength(1)
        //and the Project's budget took every other File's steps
        expect(journal.journalOf('a.bin')).toBeUndefined()
        //at most so many steps a File
        const small = setup(2)
        for (let step = 0; step < JOURNAL_STEP_LIMIT + 5; step++)
            small.journal.change('a.bin', 'Pencil', write(0, step & 0xff))
        expect(small.journal.journalOf('a.bin')?.undo).toHaveLength(JOURNAL_STEP_LIMIT)
    })

    it('forgets no step when Undo moves a large one to Redo, of this File or another', () => {
        const fs = new FileSystem({
            'a.bin': byteFile(new Uint8Array(256 * 1024)),
            'b.bin': byteFile(new Uint8Array(16))
        })
        const journal = new EditJournal(fs)
        journal.change('b.bin', 'Pencil', write(0, 1))
        for (let step = 0; step < 20; step++)
            journal.change('a.bin', 'Pencil', {
                runs: [{ offset: step * 5000, bytes: new Uint8Array(5000).fill(1) }]
            })
        //Canvas size up to the whole budget, whose step keeps the 256 KiB it replaced
        journal.change('a.bin', 'Canvas size', {
            content: new Uint8Array(JOURNAL_FILE_BUDGET),
            encoding: 'base64'
        })
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(21)
        //Undo keeps, for Redo, the 1 MiB it took away
        journal.undo('a.bin')
        expect(journal.journalOf('a.bin')?.undo).toHaveLength(20)
        expect(journal.journalOf('a.bin')?.redo).toHaveLength(1)
        expect(journal.goTo('a.bin', 0)).toBe(true)
        expect(fs.readBytes('a.bin').every((byte) => byte === 0)).toBe(true)
        expect(journal.journalOf('a.bin')?.redo).toHaveLength(21)
        expect(journal.journalOf('b.bin')?.undo).toHaveLength(1)
        //the budgets are kept as steps are made again
        journal.change('a.bin', 'Pencil', write(0, 2))
        expect(journal.journalOf('a.bin')).toEqual({ undo: [expect.anything()], redo: [] })
    })

    it('is saved and given back, and given back only to the File it left', () => {
        const { fs, journal, draw } = setup()
        draw(3)
        journal.undo('a.bin')
        //as IndexedDB gives it back: a structured clone
        const saved = structuredClone(journal.saved('a.bin')) as SavedJournal
        expect(saved.undo).toHaveLength(2)
        expect(saved.redo).toHaveLength(1)
        const reloaded = new EditJournal(fs)
        reloaded.load('a.bin', saved)
        expect(reloaded.undo('a.bin')).toEqual(write(1, 0))
        expect([...fs.readBytes('a.bin')]).toEqual([1, 0, 0, 0, 0, 0])
        //a File saved without the change the journal's last step made
        const stale = new EditJournal(fs)
        stale.load('a.bin', saved)
        expect(stale.journalOf('a.bin')).toBeUndefined()
        //and nothing it does not recognise
        const odd = new EditJournal(fs)
        for (const value of [
            undefined,
            { fingerprint: 1, undo: [], redo: [] },
            { ...saved, undo: 'x' }
        ])
            odd.load('a.bin', value)
        expect(odd.journalOf('a.bin')).toBeUndefined()
        expect(journal.saved('missing')).toBeUndefined()
    })

    it('keeps the steps of this session over those a store gives back later', () => {
        const { fs, journal, draw } = setup()
        draw(1)
        const saved = journal.saved('a.bin')!
        const fresh = new EditJournal(fs)
        fresh.change('a.bin', 'Pencil', write(4, 4))
        fresh.load('a.bin', saved)
        expect(fresh.journalOf('a.bin')?.undo.map((step) => step.change)).toEqual([write(4, 0)])
    })
})
