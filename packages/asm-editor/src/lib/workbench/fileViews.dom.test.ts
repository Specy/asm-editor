/**
 * The view each pane shows a File in, chosen by what the File's bytes are and remembered per pane
 * and per Project ([file-views.md](../../../../../docs/design/file-views.md), decisions 1, 8 and
 * 14; the plan's decision 12).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ListingOrder } from '#lib/listing/listingClient.ts'
import type { AvailableLanguages, StoredProject } from '#lib/Project.svelte.ts'
import type { WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { encodeBase64 } from '#lib/projectFiles.ts'
import HexEditor from '#cmp/specific/workbench/hex/HexEditor.svelte'
import FilePreview from '#cmp/specific/workbench/preview/FilePreview.svelte'

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
        //an Executable opens on its Listing, the only view that reaches it until a pane can switch
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
        const { session, orders } = setup(undefined, { openTabs: ['notes.txt'] })
        const group = session.groups[0]
        group.setView('crackme', 'hex')
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
        right.setView('crackme', 'hex')
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

        const restored = setup(undefined, saved)
        const group = restored.session.groups[0]
        expect(group.displayedPath).toBe('crackme')
        expect(group.displayedView).toBe('hex')
        restored.session.selectFile('image.png')
        flushSync()
        expect(group.displayedView).toBe('hex')
        expect(restored.orders).toHaveLength(0)
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

describe('the views still to come', () => {
    it('name the File, its size and what it is', () => {
        const target = document.createElement('div')
        const hex = mount(HexEditor, {
            target,
            props: {
                path: 'blob.bin',
                file: { encoding: 'base64', content: 'AQIDBA==' },
                kind: 'bytes'
            }
        })
        expect(target.textContent).toContain('Hex editor')
        expect(target.textContent).toContain('blob.bin: 4 bytes, bytes.')
        unmount(hex)
        const preview = mount(FilePreview, {
            target,
            props: {
                path: 'image.png',
                file: { encoding: 'base64', content: png },
                kind: { preview: 'image', mime: 'image/png' }
            }
        })
        expect(target.textContent).toContain('Preview')
        expect(target.textContent).toContain('image.png: 10 bytes, an image (image/png).')
        unmount(preview)
    })
})
