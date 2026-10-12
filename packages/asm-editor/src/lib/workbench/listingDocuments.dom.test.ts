/**
 * An Executable and the libraries its run loads, shown as Listings in the Workbench: read-only, at
 * the Executable's own path and under `@lib/`, with Breakpoints held as addresses
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 5, 11 and 18).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { editorFileKind } from './editorFileRouting'
import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ListingOrder } from '#lib/listing/listingClient.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import ListingNotice from '#cmp/specific/workbench/ListingNotice.svelte'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')

/** A Listing of one function, `main`, as the generator lays it out. */
function smallListing(name: string, base: number): Listing {
    const rows: [number, number, number, string][] = [
        [LINE_KIND.comment, -1, 0, `; ${name}`],
        [LINE_KIND.blank, -1, 0, ''],
        [LINE_KIND.section, 0x1000, 0, 'section .text'],
        [LINE_KIND.blank, -1, 0, ''],
        [LINE_KIND.label, 0x1000, 0, 'main:'],
        [LINE_KIND.instruction, 0x1000, 4, '    endbr64'],
        [LINE_KIND.instruction, 0x1004, 5, '    call puts@plt'],
        [LINE_KIND.label, 0x1009, 0, '.LAB_1:'],
        [LINE_KIND.instruction, 0x1009, 1, '    ret']
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
            byAddress: Int32Array.from([5, 6, 8])
        },
        labels: [
            {
                name: 'main',
                fullName: 'main',
                kind: 'function',
                origin: 'symbol',
                address: 0x1000,
                line: 4
            },
            {
                name: '.LAB_1',
                fullName: 'main.LAB_1',
                kind: 'block',
                origin: 'block',
                address: 0x1009,
                line: 7
            }
        ],
        functions: [{ name: 'main', address: 0x1000, end: 0x100a, line: 4, endLine: 9 }],
        entry: 0x1000
    }
}

/** Listings generated on demand, each finishing when the test says. */
function generator() {
    const orders: (ListingOrder & { finish(): void })[] = []
    const generate = (order: ListingOrder) =>
        new Promise<Listing>((resolve) => {
            orders.push({
                ...order,
                finish: () => resolve(smallListing(order.name, Number(order.base)))
            })
        })
    return { orders, generate }
}

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function setup() {
    const fixture = editorGroupsFixture('X86', {
        entry: 'crackme',
        files: {
            crackme: { encoding: 'base64', content: crackme },
            'notes.txt': { encoding: 'plain', content: 'password?' },
            'blob.bin': { encoding: 'base64', content: 'AQIDBA==' }
        }
    })
    disposers.push(fixture.dispose)
    const listings = generator()
    fixture.emulator.listings = new ListingDocuments(listings.generate)
    flushSync()
    return { ...fixture, listings }
}

async function settle(document: ListingDocument) {
    await document.ready.catch(() => undefined)
    flushSync()
}

describe('an Executable shown as its Listing', () => {
    it('is generated when shown, then read-only at the address it will run at', async () => {
        const { session, listings } = setup()
        session.selectFile('crackme')
        flushSync()
        const group = session.groups[0]
        const document = group.displayedListing!
        expect(document.status).toBe('generating')
        expect(listings.orders).toHaveLength(1)
        expect(listings.orders[0]).toMatchObject({ name: 'crackme', base: PIE_LOAD_BASE })
        //no model until the text exists
        expect(group.modelIdentity).toBeUndefined()
        expect(group.displayedCode).toBe('')

        listings.orders[0].finish()
        await settle(document)
        expect(group.displayedListing).toBe(document)
        expect(document.status).toBe('ready')
        expect(group.displayedCode).toBe(document.listing!.text)
        expect(group.modelIdentity).toMatchObject({ sourceKind: 'live', path: 'crackme' })
        expect(group.editorDisabled).toBe(true)
        expect(group.breakpointsEditable).toBe(true)
        expect(group.displayedFile?.encoding).toBe('base64')
        //showing it again generates nothing
        session.selectFile('notes.txt')
        session.selectFile('crackme')
        flushSync()
        expect(group.displayedListing).toBe(document)
        expect(listings.orders).toHaveLength(1)
        //a File that is no Executable has no Listing, bytes or text
        session.selectFile('notes.txt')
        flushSync()
        expect(group.displayedListing).toBeUndefined()
        session.selectFile('blob.bin')
        flushSync()
        expect(group.displayedListing).toBeUndefined()
        expect(group.displayedFile?.encoding).toBe('base64')
    })

    it("takes Breakpoints on its instructions as addresses, drawn on the address's line", async () => {
        const { session, emulator, listings } = setup()
        session.selectFile('crackme')
        flushSync()
        const group = session.groups[0]
        listings.orders[0].finish()
        await settle(group.displayedListing!)

        session.toggleBreakpoint(6, group)
        expect(emulator.breakpoints).toEqual([{ file: 'crackme', address: 0x1004 }])
        //a label, a section or a comment takes none
        session.toggleBreakpoint(4, group)
        session.toggleBreakpoint(2, group)
        session.toggleBreakpoint(0, group)
        expect(emulator.breakpoints).toHaveLength(1)
        flushSync()
        expect(group.displayedBreakpoints).toEqual([6])

        //renaming the File moves its Breakpoints with it
        session.fileRenamed('crackme', 'chall')
        expect(emulator.breakpoints).toEqual([{ file: 'chall', address: 0x1004 }])
        session.fileRenamed('chall', 'crackme')
        session.toggleBreakpoint(6, group)
        expect(emulator.breakpoints).toEqual([])
    })
})

describe('a Project File under @lib/', () => {
    it('shows and edits as any File, in a session or out of one', async () => {
        const fixture = editorGroupsFixture('X86', {
            entry: 'crackme',
            files: {
                crackme: { encoding: 'base64', content: crackme },
                '@lib/helper.asm': { encoding: 'plain', content: 'helper:\n    ret' },
                '@lib/util.c': { encoding: 'plain', content: 'int f(void) { return 1; }' }
            }
        })
        disposers.push(fixture.dispose)
        const { session, emulator } = fixture
        const listings = generator()
        emulator.listings = new ListingDocuments(listings.generate)
        flushSync()
        session.selectFile('@lib/helper.asm')
        flushSync()
        const group = session.groups[0]
        expect(group.displayedLibraryListing).toBe(false)
        expect(group.displayedListing).toBeUndefined()
        expect(group.displayedCode).toBe('helper:\n    ret')
        expect(group.editorDisabled).toBe(false)
        expect(editorFileKind('@lib/util.c')).toBe('source')
        //while an Executable runs and has loaded a library
        emulator.buildSources = { entry: 'crackme', files: { ...fixture.project.files } }
        emulator.canExecute = true
        const program = emulator.listings!.openExecutable('crackme', fixture.project.files.crackme)!
        emulator.listings!.setSession('crackme', program)
        flushSync()
        expect(emulator.listings!.isLibrary('@lib/helper.asm')).toBe(false)
        expect(group.displayedLibraryListing).toBe(false)
        expect(group.displayedFile?.encoding).toBe('plain')
    })
})

describe("a library's Listing", () => {
    function startSession(fixture: ReturnType<typeof setup>) {
        const { emulator, project, listings } = fixture
        const files: typeof project.files = JSON.parse(JSON.stringify(project.files))
        emulator.buildSources = { entry: 'crackme', files }
        emulator.canExecute = true
        const store = emulator.listings!
        const program = store.openExecutable('crackme', files.crackme)!
        store.setSession('crackme', program)
        const library = store.open({
            name: 'libc.so.6',
            base: 0x7ffff7c00000,
            content: '/lib/x86_64-linux-gnu/libc.so.6',
            bytes: () => new Uint8Array(0x2000)
        })
        store.setSession('@lib/libc.so.6', library, true)
        flushSync()
        return {
            program,
            library,
            finishAll: () => listings.orders.forEach((order) => order.finish())
        }
    }

    it('opens under @lib/ during a session, takes no Breakpoints and closes on Stop', async () => {
        const fixture = setup()
        const { session, emulator, project } = fixture
        session.selectFile('notes.txt')
        session.selectFile('crackme')
        flushSync()
        expect(project.openTabs).toEqual(['crackme', 'notes.txt'])
        const { program, library, finishAll } = startSession(fixture)
        finishAll()
        await settle(program)
        await settle(library)

        await session.revealSourceLocation('@lib/libc.so.6', 8)
        flushSync()
        const group = session.groups[0]
        expect(group.displayedPath).toBe('@lib/libc.so.6')
        expect(group.sourceSelection.sourceKind).toBe('build')
        expect(group.displayedListing).toBe(library)
        expect(group.displayedLibraryListing).toBe(true)
        expect(group.displayedFile).toBeUndefined()
        expect(group.displayedCode).toBe(library.listing!.text)
        expect(group.editorDisabled).toBe(true)
        expect(group.breakpointsEditable).toBe(false)
        expect(editorFileKind('@lib/libc.so.6')).toBe('assembly')
        session.toggleBreakpoint(6, group)
        expect(emulator.breakpoints).toEqual([])
        expect(group.tabs.paths).toEqual(['crackme', 'notes.txt', '@lib/libc.so.6'])
        //a library's Listing is no File of the Project, so it is never saved as a tab
        flushSync()
        expect(project.openTabs).toEqual(['crackme', 'notes.txt'])
        //its model is kept for the session, whichever tab is shown
        expect(session.retainedModelKeys.some((key) => key.endsWith('/@lib/libc.so.6'))).toBe(true)

        //Stop: the library's tab goes, the Executable's stays and shows its own Listing again
        emulator.listings!.clearSession()
        emulator.buildSources = undefined
        emulator.canExecute = false
        session.clearExecution()
        flushSync()
        expect(group.tabs.paths).toEqual(['crackme', 'notes.txt'])
        session.activateTab('crackme')
        flushSync()
        expect(group.sourceSelection).toEqual({ sourceKind: 'live', path: 'crackme' })
        expect(group.displayedListing?.status).toBe('ready')
        expect(group.displayedListing?.base).toBe(PIE_LOAD_BASE)
    })

    it('is shown while it is generated, then at the current line', async () => {
        const fixture = setup()
        const { session, emulator, listings } = fixture
        const { library } = startSession(fixture)
        emulator.currentFile = '@lib/libc.so.6'
        emulator.line = -1
        //what the Emulator does once the Listing is ready: it reads the current line again
        void library.ready.then(() => {
            emulator.line = 8
        })
        session.revealCurrentInstruction()
        flushSync()
        const group = session.groups[0]
        expect(group.displayedPath).toBe('@lib/libc.so.6')
        expect(group.displayedListing?.status).toBe('generating')
        expect(group.instructionLine).toBe(-1)

        listings.orders.find((order) => order.name === 'libc.so.6')!.finish()
        await settle(library)
        await new Promise((resolve) => setTimeout(resolve))
        flushSync()
        expect(group.displayedListing?.status).toBe('ready')
        expect(group.instructionLine).toBe(8)
    })
})

describe('the Listing notice', () => {
    it("says what the Listing is: an Executable's or a library's, read-only", async () => {
        const { generate, orders } = generator()
        const listings = new ListingDocuments(generate)
        const listing = listings.open({
            name: 'crackme',
            base: PIE_LOAD_BASE,
            content: 'crackme',
            bytes: () => new Uint8Array()
        })
        orders[0].finish()
        await listing.ready
        const host = document.createElement('div')
        const program = mount(ListingNotice, { target: host, props: { document: listing } })
        flushSync()
        expect(host.textContent?.trim()).toBe('Generated Listing of crackme: read-only.')
        unmount(program)
        const library = mount(ListingNotice, {
            target: host,
            props: { document: listing, library: true }
        })
        flushSync()
        expect(host.textContent?.trim()).toBe(
            'Generated Listing of crackme, a library the program loaded: read-only.'
        )
        unmount(library)
    })
})
