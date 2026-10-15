/**
 * The view each pane shows a File in, chosen by what the File's bytes are and remembered per pane
 * and per Project ([file-views.md](../../../../../docs/design/file-views.md), decisions 1, 8 and
 * 14; the plan's decision 12).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ListingOrder } from '#lib/listing/listingClient.ts'
import type { AvailableLanguages, StoredProject } from '#lib/Project.svelte.ts'
import type { WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { encodeBase64 } from '#lib/projectFiles.ts'
import { PREVIEW_UNAVAILABLE } from '#cmp/specific/workbench/preview/previewSupport.ts'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')
const png = encodeBase64(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))

/** A Listing of the instructions of one function, as the generator lays it out. */
function smallListing(name: string, base: number): Listing {
    const rows: [number, number, number, string][] = [
        [LINE_KIND.comment, -1, 0, `; ${name}`],
        [LINE_KIND.label, 0x1000, 0, 'main:'],
        [LINE_KIND.instruction, 0x1000, 4, '    endbr64'],
        [LINE_KIND.instruction, 0x1004, 1, '    ret']
    ]
    return {
        version: 'v1',
        base,
        text: rows.map((row) => row[3]).join('\n') + '\n',
        lines: {
            kinds: Uint8Array.from(rows.map((row) => row[0])),
            addresses: Float64Array.from(rows.map((row) => row[1])),
            sizes: Float64Array.from(rows.map((row) => row[2])),
            offsets: Float64Array.from(rows.map((row) => (row[2] ? row[1] : -1))),
            byAddress: Int32Array.from([2, 3])
        },
        labels: [],
        functions: [{ name: 'main', address: 0x1000, end: 0x1005, line: 1, endLine: 3 }],
        entry: 0x1000
    }
}

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function setup(
    language: AvailableLanguages = 'X86',
    data: StoredProject = {},
    host: Partial<WorkbenchSessionHost> = {}
) {
    const fixture = editorGroupsFixture(
        language,
        {
            entry: 'crackme',
            files: {
                crackme: { encoding: 'base64', content: crackme },
                'image.png': { encoding: 'base64', content: png },
                'blob.bin': { encoding: 'base64', content: 'AQIDBA==' },
                'notes.txt': { encoding: 'plain', content: 'password?' }
            },
            ...data
        },
        host
    )
    disposers.push(fixture.dispose)
    const orders: ListingOrder[] = []
    const documents: ListingDocument[] = []
    fixture.emulator.listings = new ListingDocuments((order) => {
        orders.push(order)
        return Promise.resolve(smallListing(order.name, Number(order.base)))
    })
    flushSync()
    return { ...fixture, orders, documents }
}

async function settle(document: ListingDocument | undefined) {
    await document?.ready.catch(() => undefined)
    flushSync()
}

describe('the view a File opens in', () => {
    it('follows what its bytes are, not its name', async () => {
        const { session, orders } = setup()
        const group = session.groups[0]
        const views = (path: string) => {
            session.selectFile(path)
            flushSync()
            return [group.displayedView, group.showsCode, group.displayedListing !== undefined]
        }
        expect(views('notes.txt')).toEqual(['text', true, false])
        expect(views('image.png')).toEqual(['preview', false, false])
        expect(views('blob.bin')).toEqual(['hex', false, false])
        //an Executable opens in the Hex editor, and Disassemble generates its Listing
        expect(views('crackme')).toEqual(['hex', false, false])
        expect(orders).toHaveLength(0)
        group.setView('crackme', 'listing')
        flushSync()
        expect(orders).toHaveLength(1)
        await settle(group.displayedListing)
        expect(group.modelIdentity).toMatchObject({ path: 'crackme', view: 'listing' })
        expect(group.modelKey.endsWith('/live/crackme#listing')).toBe(true)
        //neither bytes nor a Preview have a model
        session.selectFile('image.png')
        flushSync()
        expect(group.modelIdentity).toBeUndefined()
        expect(group.displayedKind).toEqual({ preview: 'image', mime: 'image/png' })
    })

    it('shows an ELF of another Target as bytes, generating no Listing', () => {
        const { session, orders } = setup('MIPS')
        session.selectFile('crackme')
        flushSync()
        expect(session.groups[0].displayedKind).toBe('bytes')
        expect(session.groups[0].displayedView).toBe('hex')
        expect(session.groups[0].displayedListing).toBeUndefined()
        expect(orders).toHaveLength(0)
    })

    it('in the Hex editor generates no Listing for an Executable', () => {
        const { session, orders } = setup(undefined, { openTabs: ['notes.txt'] })
        const group = session.groups[0]
        session.selectFile('crackme')
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(group.displayedListing).toBeUndefined()
        expect(orders).toHaveLength(0)
    })

    it('refuses a view the File does not offer', () => {
        const { session } = setup()
        const group = session.groups[0]
        session.selectFile('notes.txt')
        group.setView('notes.txt', 'hex')
        group.setView('blob.bin', 'preview')
        flushSync()
        expect(group.views).toEqual({})
        expect(group.displayedView).toBe('text')
    })
})

describe('one File in two panes', () => {
    it('shows it in a view of its own in each, each with its own model', async () => {
        const { session, orders } = setup()
        const left = session.groups[0]
        session.selectFile('crackme', left)
        left.setView('crackme', 'listing', false)
        flushSync()
        await settle(left.displayedListing)
        const right = session.splitEditor()
        session.selectFile('crackme', right)
        flushSync()
        expect(left.displayedView).toBe('listing')
        expect(right.displayedView).toBe('hex')
        expect(right.modelKey).not.toBe(left.modelKey)
        expect(right.modelIdentity).toBeUndefined()
        //the same view of the same File shares the one model, as a text File's panes do
        right.setView('crackme', 'listing')
        flushSync()
        await settle(right.displayedListing)
        expect(right.modelKey).toBe(left.modelKey)
        expect(orders).toHaveLength(1)

        session.selectFile('image.png', left)
        session.selectFile('image.png', right)
        right.setView('image.png', 'hex')
        flushSync()
        expect([left.displayedView, right.displayedView]).toEqual(['preview', 'hex'])
    })

    it('keeps the view of a tab moved to the other pane, and forgets it when the tab closes', () => {
        const { session } = setup(undefined, { openTabs: ['notes.txt', 'image.png'] })
        const left = session.groups[0]
        session.selectFile('image.png', left)
        left.setView('image.png', 'hex', false)
        flushSync()
        const right = session.splitEditor()
        flushSync()
        expect(right.displayedPath).toBe('image.png')
        expect(right.displayedView).toBe('hex')
        expect(left.views).toEqual({})
        session.closeTab('image.png', right)
        session.selectFile('image.png', left)
        flushSync()
        expect(left.displayedView).toBe('preview')
    })

    it('follows the program in the pane that can show its current instruction', async () => {
        const { session, emulator, project } = setup()
        const left = session.groups[0]
        session.selectFile('crackme', left)
        const right = session.splitEditor()
        session.selectFile('crackme', right)
        right.setView('crackme', 'listing', false)
        flushSync()
        await settle(right.displayedListing)
        //a Debug session of the Executable, stopped on its second instruction
        const files: typeof project.files = JSON.parse(JSON.stringify(project.files))
        emulator.buildSources = { entry: 'crackme', files }
        emulator.canExecute = true
        emulator.currentFile = 'crackme'
        emulator.line = 3
        const program = emulator.listings!.openExecutable('crackme', files.crackme)!
        emulator.listings!.setSession('crackme', program)
        await settle(program)
        await session.revealSourceLocation('crackme', 3)
        flushSync()
        expect(session.executionGroupId).toBe(right.id)
        expect(right.sourceSelection.sourceKind).toBe('build')
        expect(right.instructionLine).toBe(3)
        //the pane showing the bytes shows the Build's too, without a current line
        expect(left.sourceSelection.sourceKind).toBe('build')
        expect(left.displayedView).toBe('hex')
        expect(left.instructionLine).toBe(-1)
    })
})

describe('the saved views', () => {
    it('saves the last view chosen beside the tabs, and none for a default', () => {
        const onSave = vi.fn()
        const { session, project } = setup(undefined, {}, { onSave })
        const group = session.groups[0]
        session.selectFile('image.png')
        flushSync()
        onSave.mockClear()
        group.setView('image.png', 'hex')
        expect(project.fileViews).toEqual({ 'image.png': 'hex' })
        expect(onSave).toHaveBeenCalledWith({ silent: true })
        group.setView('image.png', 'preview')
        expect(project.fileViews).toBeUndefined()
        expect(project.toObject()).not.toHaveProperty('fileViews')
        //a pane's own view is kept without being saved, as going to a definition does
        group.setView('blob.bin', 'hex', false)
        expect(project.fileViews).toBeUndefined()
    })

    it('restores them in a new session, after the tabs', () => {
        const { session, project } = setup()
        session.selectFile('image.png')
        session.groups[0].setView('image.png', 'hex')
        session.selectFile('crackme')
        session.groups[0].setView('crackme', 'listing')
        flushSync()
        const saved = project.toObject()
        expect(saved.fileViews).toEqual({ 'image.png': 'hex', crackme: 'listing' })
        expect(saved.openTabs).toEqual(['crackme', 'image.png'])

        const restored = setup(undefined, saved)
        const group = restored.session.groups[0]
        expect(group.displayedPath).toBe('crackme')
        expect(group.displayedView).toBe('listing')
        restored.session.selectFile('image.png')
        flushSync()
        expect(group.displayedView).toBe('hex')
        //a view saved before the Hex editor was an Executable's default still opens it there
        const older = setup(undefined, { ...saved, fileViews: { crackme: 'hex' } })
        expect(older.session.groups[0].displayedView).toBe('hex')
        expect(older.orders).toHaveLength(0)
    })

    it('moves with a renamed File and goes with a deleted one', () => {
        const { session, project } = setup()
        session.selectFile('image.png')
        session.groups[0].setView('image.png', 'hex')
        project.fileSystem.rename('image.png', 'picture')
        session.fileRenamed('image.png', 'picture')
        flushSync()
        expect(project.fileViews).toEqual({ picture: 'hex' })
        expect(session.groups[0].displayedPath).toBe('picture')
        expect(session.groups[0].displayedView).toBe('hex')
        project.fileSystem.remove('picture')
        session.fileDeleted('picture')
        expect(project.fileViews).toBeUndefined()
    })

    it('falls back to the default where a saved view no longer fits the File', () => {
        const { session, project } = setup(undefined, {
            fileViews: { 'notes.txt': 'hex', 'missing.bin': 'hex', 'blob.bin': 'sideways' }
        } as StoredProject)
        //what cannot be a view, or names no File, is not kept
        expect(project.fileViews).toEqual({ 'notes.txt': 'hex' })
        session.selectFile('notes.txt')
        flushSync()
        expect(session.groups[0].displayedView).toBe('text')
    })
})

describe('the Hex editor in a session', () => {
    it('types over a byte File through the FileSystem, and over nothing else', () => {
        const { session, project } = setup()
        expect(session.editFileBytes('blob.bin', 1, Uint8Array.from([0xff]))).toBe(true)
        expect(project.files['blob.bin'].edits).toEqual([{ offset: 1, remove: 1, insert: '/w==' }])
        expect(session.setFileByteEdits('blob.bin', [])).toBe(true)
        expect(project.files['blob.bin'].edits).toBeUndefined()
        //refused, and said why, rather than thrown
        expect(session.editFileBytes('notes.txt', 0, Uint8Array.from([0x41]))).toBe(false)
        expect(session.editFileBytes('blob.bin', 3, Uint8Array.from([1, 2]))).toBe(false)
        const run = project.fileSystem.beginSession()
        flushSync()
        expect(session.editFileBytes('blob.bin', 0, Uint8Array.from([0]))).toBe(false)
        run.stop()
    })

    it('says why the bytes are read-only, and over an Executable in a Debug session why', () => {
        const { session, emulator, project } = setup()
        const group = session.groups[0]
        session.selectFile('blob.bin')
        flushSync()
        expect(group.bytesReadOnly).toBeUndefined()
        expect(group.bytesNotice).toBeUndefined()
        group.setView('crackme', 'hex')
        session.selectFile('crackme')
        flushSync()
        expect(group.bytesReadOnly).toBeUndefined()
        emulator.buildSources = { entry: 'crackme', files: project.files }
        emulator.canExecute = true
        flushSync()
        expect(group.bytesReadOnly).toMatch(/Debug session/)
        expect(group.bytesNotice).toBe(
            "The File's bytes. Patches and the program's writes are in memory: see the memory view."
        )
        session.selectFile('blob.bin')
        flushSync()
        expect(group.bytesNotice).toBeUndefined()
        expect(setup(undefined, {}, { readonly: true }).session.groups[0].bytesReadOnly).toBe(
            'This Project is read-only'
        )
    })

    it("keeps a File's Undo across a rename and drops it with the File", () => {
        const { session, project } = setup()
        const blob = project.files['blob.bin']
        session.byteEditHistory.record('blob.bin', blob, 0)
        project.fileSystem.rename('blob.bin', 'moved.bin')
        session.fileRenamed('blob.bin', 'moved.bin')
        expect(session.byteEditHistory.undo('moved.bin', blob)).toEqual({ edits: [], offset: 0 })
        session.byteEditHistory.record('moved.bin', blob, 0)
        project.fileSystem.remove('moved.bin')
        session.fileDeleted('moved.bin')
        expect(session.byteEditHistory.undo('moved.bin', blob)).toBeUndefined()
    })
})

describe('Show in Listing and Show in Hex', () => {
    /** An editor showing a group's model, which records what it was asked to reveal. */
    function fakeEditor(session: { languageSessionId: string }, lines = 5) {
        const revealed: number[] = []
        const editor = {
            revealed,
            getModel: () => ({
                uri: {
                    scheme: 'asm-editor',
                    authority: session.languageSessionId,
                    path: '/live/crackme',
                    fragment: 'listing'
                },
                isDisposed: () => false,
                getLineCount: () => lines
            }),
            revealLineInCenter: (line: number) => revealed.push(line),
            setPosition: () => {},
            focus: () => {}
        }
        return editor
    }

    it('go from a code byte to its instruction and back, switching the pane', async () => {
        const { session } = setup()
        const group = session.groups[0]
        group.setView('crackme', 'hex')
        session.selectFile('crackme')
        flushSync()
        const editor = fakeEditor(session)
        group.editor = editor as unknown as typeof group.editor
        //`ret`, the smallListing's line 3, at offset 0x1004
        expect(await session.showInListing(group, 0x1004)).toBe(true)
        expect(group.displayedView).toBe('listing')
        expect(editor.revealed).toEqual([4])
        //and back, from the line to its one byte
        expect(session.hexRangeOfLine(group, 1)).toBeUndefined()
        expect(session.showInHex(group, 3)).toBe(true)
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(group.hexReveal).toEqual({ path: 'crackme', offset: 0x1004, length: 1 })
        //a byte no line holds stays where it is
        group.setView('crackme', 'hex')
        expect(await session.showInListing(group, 0x10)).toBe(false)
    })

    it('reveal in the other pane when it shows the view already', async () => {
        const { session } = setup()
        const left = session.groups[0]
        session.selectFile('crackme', left)
        left.setView('crackme', 'listing', false)
        flushSync()
        await settle(left.displayedListing)
        const right = session.splitEditor()
        session.selectFile('crackme', right)
        flushSync()
        const editor = fakeEditor(session)
        left.editor = editor as unknown as typeof left.editor
        expect(await session.showInListing(right, 0x1000)).toBe(true)
        expect([left.displayedView, right.displayedView]).toEqual(['listing', 'hex'])
        expect(editor.revealed).toEqual([3])
        expect(session.showInHex(left, 2)).toBe(true)
        expect([left.displayedView, right.displayedView]).toEqual(['listing', 'hex'])
        expect(right.hexReveal).toEqual({ path: 'crackme', offset: 0x1000, length: 4 })
    })
})

describe('a Preview the browser cannot show', () => {
    it('falls back to the Hex editor under a note, until a view is chosen again', () => {
        const { session, project } = setup()
        const group = session.groups[0]
        session.selectFile('image.png')
        flushSync()
        expect(group.displayedView).toBe('preview')
        group.previewUnavailable('image.png', PREVIEW_UNAVAILABLE.image)
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(group.bytesNotice).toBe('This browser cannot show this image.')
        //nobody chose the bytes, so nothing is saved
        expect(project.fileViews).toBeUndefined()
        //another File shows no note, and the note stays with its File
        session.selectFile('blob.bin')
        flushSync()
        expect(group.bytesNotice).toBeUndefined()
        session.selectFile('image.png')
        flushSync()
        expect(group.bytesNotice).toBe(PREVIEW_UNAVAILABLE.image)
        //choosing the Preview tries it again
        group.setView('image.png', 'preview')
        flushSync()
        expect(group.displayedView).toBe('preview')
        expect(group.previewNotes).toEqual({})
    })

    it('forgets the note when the tab closes', () => {
        const { session } = setup(undefined, { openTabs: ['notes.txt', 'image.png'] })
        const group = session.groups[0]
        session.selectFile('image.png')
        group.previewUnavailable('image.png', PREVIEW_UNAVAILABLE.image)
        session.closeTab('image.png', group)
        session.selectFile('image.png')
        flushSync()
        expect(group.displayedView).toBe('preview')
        expect(group.bytesNotice).toBeUndefined()
    })
})
