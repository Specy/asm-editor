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
import { LINE_KIND, placeOfLine, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ListingOrder } from '#lib/listing/listingClient.ts'
import type { AvailableLanguages, StoredProject } from '#lib/Project.svelte.ts'
import type { WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { encodeBase64, fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import type { EditJournalStore, SavedJournal } from '#lib/editJournal.ts'
import { PREVIEW_UNAVAILABLE } from '#cmp/specific/workbench/preview/previewSupport.ts'
import { makeBmp } from '#lib/pixels/bmp.ts'

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
        //an Executable opens on its Listing, which it generates (reverse-engineering-ux.md,
        //decision 13)
        expect(views('crackme')).toEqual(['listing', true, true])
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
        const { session, orders } = setup(undefined, {
            openTabs: ['notes.txt'],
            fileViews: { crackme: 'hex' }
        })
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
        flushSync()
        await settle(left.displayedListing)
        const right = session.splitEditor()
        session.selectFile('crackme', right)
        right.setView('crackme', 'hex', false)
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
        left.setView('crackme', 'hex', false)
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
        session.groups[0].setView('crackme', 'hex')
        flushSync()
        const saved = project.toObject()
        expect(saved.fileViews).toEqual({ 'image.png': 'hex', crackme: 'hex' })
        expect(saved.openTabs).toEqual(['crackme', 'image.png'])

        //a view saved for an Executable wins over its default, the Listing, which the Hex editor
        //does not generate
        const restored = setup(undefined, saved)
        const group = restored.session.groups[0]
        expect(group.displayedPath).toBe('crackme')
        expect(group.displayedView).toBe('hex')
        expect(restored.orders).toHaveLength(0)
        restored.session.selectFile('image.png')
        flushSync()
        expect(group.displayedView).toBe('hex')
        //one saved as the Listing, when it was no default, still opens it there
        const listing = setup(undefined, { ...saved, fileViews: { crackme: 'listing' } })
        expect(listing.session.groups[0].displayedView).toBe('listing')
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
    it("types over a byte File's bytes and a text File's text through the FileSystem", () => {
        const { session, project } = setup()
        expect(session.editFileBytes('blob.bin', 1, Uint8Array.from([0xff]))).toBe(true)
        expect([...fileBytes(project.files['blob.bin'])]).toEqual([1, 0xff, 3, 4])
        expect(session.undoFileEdit('blob.bin')).toBe(1)
        expect(project.files['blob.bin']).toEqual({ encoding: 'base64', content: 'AQIDBA==' })
        //a text File's text changes, and must stay UTF-8
        const notes = project.files['notes.txt'].content
        expect(session.editFileBytes('notes.txt', 0, Uint8Array.from([0x41]))).toBe(true)
        expect(project.files['notes.txt']).toEqual({
            encoding: 'plain',
            content: 'A' + notes.slice(1)
        })
        expect(session.undoFileEdit('notes.txt')).toBe(0)
        expect(project.files['notes.txt'].content).toBe(notes)
        expect(session.undoFileEdit('notes.txt', true)).toBe(0)
        //refused, and said why, rather than thrown
        expect(session.editFileBytes('notes.txt', 0, Uint8Array.from([0xff]))).toBe(false)
        expect(session.editFileBytes('blob.bin', 3, Uint8Array.from([1, 2]))).toBe(false)
        const run = project.fileSystem.beginSession()
        flushSync()
        expect(session.editFileBytes('blob.bin', 0, Uint8Array.from([0]))).toBe(false)
        run.stop()
    })

    it('says why the bytes are read-only without a persistent executable notice', () => {
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
        expect(group.bytesNotice).toBeUndefined()
        session.selectFile('blob.bin')
        flushSync()
        expect(group.bytesNotice).toBeUndefined()
        expect(setup(undefined, {}, { readonly: true }).session.groups[0].bytesReadOnly).toBe(
            'This Project is read-only'
        )
    })

    it('previews a PDF stored as text, whose bytes are typed over as its text', () => {
        const { session } = setup('MIPS', {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'ascii.pdf': { encoding: 'plain', content: '%PDF-1.4\n%%EOF\n' }
            }
        })
        const group = session.groups[0]
        session.selectFile('ascii.pdf')
        flushSync()
        expect(group.displayedView).toBe('preview')
        expect(group.viewSwitch).toEqual(['preview', 'hex'])
        group.setView('ascii.pdf', 'hex')
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(group.bytesReadOnly).toBeUndefined()
        expect(session.editFileBytes('ascii.pdf', 5, new TextEncoder().encode('1.7'))).toBe(true)
        expect(session.project.files['ascii.pdf']).toEqual({
            encoding: 'plain',
            content: '%PDF-1.7\n%%EOF\n'
        })
        //a lone byte of a character would leave the text no longer UTF-8
        expect(session.editFileBytes('ascii.pdf', 0, Uint8Array.from([0xc3]))).toBe(false)
        expect(session.project.files['ascii.pdf'].content).toBe('%PDF-1.7\n%%EOF\n')
    })

    it('types over the bytes Byte edits a Project saved before left', () => {
        const { session } = setup('MIPS', {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'inserted.bin': {
                    encoding: 'base64',
                    content: 'AQIDBA==',
                    edits: [{ offset: 1, remove: 0, insert: '/w==' }]
                } as ProjectFile
            }
        })
        const group = session.groups[0]
        session.selectFile('inserted.bin')
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(group.bytesReadOnly).toBeUndefined()
        expect([...fileBytes(session.project.files['inserted.bin'])]).toEqual([1, 0xff, 2, 3, 4])
        expect(session.editFileBytes('inserted.bin', 0, Uint8Array.from([0]))).toBe(true)
    })

    it("carries a File's Edit steps across a rename, and drops them once something else changes it", () => {
        const { session, project } = setup()
        expect(session.editFileBytes('blob.bin', 0, Uint8Array.of(9))).toBe(true)
        project.fileSystem.rename('blob.bin', 'moved.bin')
        session.fileRenamed('blob.bin', 'moved.bin')
        expect(session.undoFileEdit('moved.bin')).toBe(0)
        expect([...fileBytes(project.files['moved.bin'])][0]).toBe(1)
        expect(session.undoFileEdit('moved.bin', true)).toBe(0)
        expect([...fileBytes(project.files['moved.bin'])][0]).toBe(9)
        //an upload over it
        project.fileSystem.writeBytes('moved.bin', Uint8Array.of(7, 7), true, 'base64')
        expect(session.fileJournal('moved.bin')).toBeUndefined()
        expect(session.undoFileEdit('moved.bin')).toBeUndefined()
        expect([...fileBytes(project.files['moved.bin'])]).toEqual([7, 7])
    })

    it('saves what a Hex editor typed before Undo takes it back', () => {
        const { session, project } = setup()
        let pending: Uint8Array | undefined = Uint8Array.of(5)
        session.registerTypingFlush(() => {
            if (pending) session.editFileBytes('blob.bin', 2, pending)
            pending = undefined
        })
        expect(session.undoFileEdit('blob.bin')).toBe(2)
        expect(project.files['blob.bin']).toEqual({ encoding: 'base64', content: 'AQIDBA==' })
        expect(session.fileJournal('blob.bin')?.redo.map((step) => step.label)).toEqual(['Typing'])
    })

    it('keeps the Edit journal with each save of the Project, for Undo after a reload', async () => {
        const kept = new Map<string, SavedJournal>()
        const reads = new Map<string, () => SavedJournal | undefined>()
        const editJournals: EditJournalStore = {
            load: async () => new Map(kept),
            changed: (path, read) => void reads.set(path, read)
        }
        /** As the project page saves: the journals read with the Project's snapshot, as IndexedDB keeps them. */
        const save = (project: { toObject(): { files: StoredProject['files'] } }) => {
            const files = project.toObject().files
            for (const [path, read] of reads) {
                const journal = read()
                if (journal) kept.set(path, structuredClone(journal))
                else kept.delete(path)
            }
            reads.clear()
            return files
        }
        const first = setup(undefined, {}, { editJournals })
        first.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        first.session.editFileBytes('blob.bin', 1, Uint8Array.of(8))
        //nothing is kept before the Project is saved
        expect(kept.size).toBe(0)
        const files = save(first.project)
        expect(kept.get('blob.bin')?.undo).toHaveLength(2)
        //a change the tab closed before saving is in neither
        first.session.editFileBytes('blob.bin', 2, Uint8Array.of(7))
        reads.clear()
        const second = setup(undefined, { files }, { editJournals })
        await vi.waitFor(() => expect(second.session.fileJournal('blob.bin')?.undo).toHaveLength(2))
        expect(second.session.undoFileEdit('blob.bin')).toBe(1)
        expect([...fileBytes(second.project.files['blob.bin'])]).toEqual([9, 2, 3, 4])
        //one whose File is gone is forgotten at the next save
        reads.clear()
        kept.set('gone.bin', kept.get('blob.bin')!)
        const third = setup(undefined, { files }, { editJournals })
        await vi.waitFor(() => expect(reads.has('gone.bin')).toBe(true))
        save(third.project)
        expect(kept.has('gone.bin')).toBe(false)
        expect(kept.has('blob.bin')).toBe(true)
    })

    it('keeps a previewed File in preview when Undo has nothing to take back', () => {
        const { session } = setup()
        const group = session.groups[0]
        session.previewFile('blob.bin')
        flushSync()
        const preview = group.tabs.preview
        expect(preview).toBe('blob.bin')
        expect(session.undoFileEdit('blob.bin')).toBeUndefined()
        expect(group.tabs.preview).toBe('blob.bin')
        session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        expect(group.tabs.preview).toBeUndefined()
    })
})

describe('Show in Listing and Show in Hex', () => {
    /** An editor showing a group's model, which records what it was asked to reveal. */
    function fakeEditor(session: { languageSessionId: string }, lines = 5) {
        const revealed: number[] = []
        //Monaco's ScrollType of each: 0 smooth, 1 at once
        const scrolls: (number | undefined)[] = []
        const editor = {
            revealed,
            scrolls,
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
            revealLineInCenter: (line: number, scroll?: number) => {
                revealed.push(line)
                scrolls.push(scroll)
            },
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
        //the bytes are no place of the navigation history
        expect(group.history.canGoBack).toBe(false)
        //at once: a smooth scroll in an editor just mounted is cut short by the layouts after it
        expect(editor.scrolls).toEqual([1])
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

    it('stop waiting for an editor once the session is gone', async () => {
        const { session, dispose } = setup()
        disposers.splice(disposers.indexOf(dispose), 1)
        const group = session.groups[0]
        group.setView('crackme', 'hex')
        session.selectFile('crackme')
        flushSync()
        //no editor mounts here, so the reveal waits for one
        const revealed = session.showInListing(group, 0x1004)
        await new Promise((resolve) => setTimeout(resolve, 120))
        const warn = vi.spyOn(console, 'warn')
        dispose()
        try {
            expect(await revealed).toBe(false)
            //the pane's deriveds went inert with the session; reading them warns
            expect(warn).not.toHaveBeenCalled()
        } finally {
            warn.mockRestore()
        }
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
        right.setView('crackme', 'hex', false)
        flushSync()
        const editor = fakeEditor(session)
        left.editor = editor as unknown as typeof left.editor
        session.cursorMoved(left, 1)
        expect(await session.showInListing(right, 0x1000)).toBe(true)
        expect([left.displayedView, right.displayedView]).toEqual(['listing', 'hex'])
        expect(editor.revealed).toEqual([3])
        //the Listing's line it left is behind it, for Back
        expect(left.history.behind).toEqual([
            {
                selection: { sourceKind: 'live', path: 'crackme' },
                view: 'listing',
                line: 1,
                place: placeOfLine(left.displayedListing!.listing!, 1)
            }
        ])
        //a pane already on the Listing scrolls there
        expect(editor.scrolls).toEqual([0])
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

describe('a picture in the Pixel editor', () => {
    const sprite = encodeBase64(makeBmp({ width: 8, height: 8, format: 'rgb32' }))
    function pictures() {
        return setup('RISC-V', {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'sprite.bmp': { encoding: 'base64', content: sprite },
                'image.png': { encoding: 'base64', content: png }
            }
        })
    }

    it('offers Pixels between Preview and Hex, and only for a BMP it draws in', () => {
        const { session } = pictures()
        const group = session.groups[0]
        session.selectFile('sprite.bmp')
        flushSync()
        expect(group.displayedView).toBe('preview')
        expect(group.viewSwitch).toEqual(['preview', 'pixels', 'hex'])
        session.selectFile('image.png')
        flushSync()
        expect(group.viewSwitch).toEqual(['preview', 'hex'])
    })

    it('opens a new picture in Pixels, which the Project then saves as its view', () => {
        const { session } = pictures()
        session.openInPixelEditor('sprite.bmp')
        flushSync()
        expect(session.groups[0].displayedPath).toBe('sprite.bmp')
        expect(session.groups[0].displayedView).toBe('pixels')
        expect(session.project.fileViews).toEqual({ 'sprite.bmp': 'pixels' })
    })

    it("carries a picture's cell grid with its renames and drops it with the File", () => {
        const { session } = pictures()
        session.cellGridChosen('sprite.bmp', { width: 8, height: 4 })
        session.project.fileSystem.rename('sprite.bmp', 'art/hero.bmp')
        session.fileRenamed('sprite.bmp', 'art/hero.bmp')
        expect(session.project.cellGrids).toEqual({ 'art/hero.bmp': { width: 8, height: 4 } })
        session.project.fileSystem.remove('art/hero.bmp')
        session.fileDeleted('art/hero.bmp')
        expect(session.project.cellGrids).toBeUndefined()
    })

    it('saves a stroke and a Canvas size as Edit steps, gone back to from the Edit history', () => {
        const { session } = pictures()
        const original = session.project.files['sprite.bmp']
        const runs = [{ offset: 54, bytes: Uint8Array.of(1, 2, 3) }]
        expect(session.editFileByteRuns('sprite.bmp', runs, 'Pencil')).toBe(true)
        const drawn = session.project.files['sprite.bmp']
        const resized = makeBmp({ width: 12, height: 8, format: 'rgb32' })
        expect(session.resizePicture('sprite.bmp', resized, 'Canvas size 12 × 8')).toBe(true)
        expect(session.fileJournal('sprite.bmp')?.undo.map((step) => step.label)).toEqual([
            'Pencil',
            'Canvas size 12 × 8'
        ])
        expect(fileBytes(session.project.files['sprite.bmp'])).toEqual(resized)
        expect(session.goToFileEdit('sprite.bmp', 1)).toBe(true)
        expect(session.project.files['sprite.bmp'].content).toBe(drawn.content)
        expect(session.undoFileEdit('sprite.bmp')).toBe(54)
        expect(session.project.files['sprite.bmp']).toEqual(original)
        expect(session.goToFileEdit('sprite.bmp', 2)).toBe(true)
        expect(fileBytes(session.project.files['sprite.bmp'])).toEqual(resized)
    })

    it('stores a picture an older editor stored as text as bytes from its first stroke', () => {
        //an 8 × 1 black picture, 24 bits a pixel, whose every byte is ASCII once its one row is
        //read bottom-up, which a height of 1 rather than -1 says
        const picture = makeBmp({ width: 8, height: 1, format: 'rgb24' })
        picture.set([1, 0, 0, 0], 22)
        const text = new TextDecoder().decode(picture)
        expect([...new TextEncoder().encode(text)]).toEqual([...picture])
        const { session } = setup('RISC-V', {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'ascii.bmp': { encoding: 'plain', content: text }
            }
        })
        const runs = [{ offset: 54, bytes: Uint8Array.of(0xff, 0xff, 0xff) }]
        expect(session.editFileByteRuns('ascii.bmp', runs, 'Pencil')).toBe(true)
        expect(session.project.files['ascii.bmp'].encoding).toBe('base64')
        expect(fileBytes(session.project.files['ascii.bmp'])[54]).toBe(0xff)
        expect(session.undoFileEdit('ascii.bmp')).toBe(0)
        expect(session.project.files['ascii.bmp']).toEqual({ encoding: 'plain', content: text })
    })
})
