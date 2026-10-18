/**
 * Decompile and the Pseudocode beside its Listing
 * ([file-views.md](../../../../../docs/design/file-views.md), decisions 5, 6 and 11; the plan's
 * E8.3 to E8.6): crackme's real Listing, decompiled by the real decompiler through the client's
 * path for where there is no Worker, as jsdom has none.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { EditorGroup } from './EditorGroup.svelte'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { lineOfAddress, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { PseudocodeClient } from '#lib/pseudocode/pseudocodeClient.ts'
import type { PseudocodeDocument } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import { listingLineOfTarget, pseudocodeTargetAt } from '#lib/pseudocode/pseudocodeMap.ts'
import { createPseudocodeProviders } from '#lib/monaco/pseudocodeProviders.ts'
import { setModelPseudocode } from '#lib/monaco/pseudocodeModels.ts'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { fileViewIdentity } from '#lib/languages/service/uri.ts'
import type { StoredProject } from '#lib/Project.svelte.ts'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import PseudocodeNotice from '#cmp/specific/workbench/PseudocodeNotice.svelte'
import PseudocodeStatus from '#cmp/specific/workbench/PseudocodeStatus.svelte'

/**
 * The run-time addresses whose function the decompiler answers with its time limit's message, as
 * it does for a function it gives up on after 30 seconds; the rest decompile for real. The
 * package is told where its files are: a DOM test's module URL is an http one, which the package
 * would fetch them from.
 */
const slow = vi.hoisted(() => new Set<number>())
vi.mock('@specy/decompiler', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@specy/decompiler')>()
    const { pathToFileURL } = await import('node:url')
    const { resolve } = await import('node:path')
    const dist = resolve('../decompiler/js/dist')
    return {
        ...actual,
        loadDecompiler: async (options: Parameters<typeof actual.loadDecompiler>[0]) => {
            const decompiler = await actual.loadDecompiler({
                ...options,
                wasmUrl: `${dist}/wasm/decompiler.wasm`,
                specsUrl: pathToFileURL(`${dist}/specs/x86-64/`)
            })
            return {
                ...decompiler,
                memory: () => decompiler.memory(),
                dispose: () => decompiler.dispose(),
                openProgram(image: Parameters<typeof decompiler.openProgram>[0]) {
                    const program = decompiler.openProgram(image)
                    return {
                        warnings: program.warnings,
                        dispose: () => program.dispose(),
                        decompile: (address: number, decompileOptions?: object) =>
                            slow.has(address)
                                ? {
                                      address,
                                      error: 'main took longer than 30 seconds to decompile'
                                  }
                                : program.decompile(address, decompileOptions)
                    }
                }
            }
        }
    }
})

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackmeBytes = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme')
const crackme = crackmeBytes.toString('base64')
/** crackme's load base, a PIE's planned one. */
const BASE = 0x555555554000
/** "hunter2", at link-time 0x2017, in a segment whose file offset is its address. */
const HUNTER2 = 0x2017

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    slow.clear()
    vi.restoreAllMocks()
})

/** crackme beside a text File, with a Build that stops at `main` as the x86 Emulator does. */
function setup(data: StoredProject = {}) {
    const fixture = editorGroupsFixture('X86', {
        entry: 'crackme',
        files: {
            crackme: { encoding: 'base64', content: crackme },
            'notes.txt': { encoding: 'plain', content: 'password?' }
        },
        ...data
    })
    disposers.push(fixture.dispose)
    const { emulator } = fixture
    const store = new ListingDocuments((order) =>
        Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
    )
    emulator.listings = store
    emulator.compile = async (_historySize, sources) => {
        const files = JSON.parse(JSON.stringify(sources.files))
        emulator.buildSources = { ...sources, files }
        emulator.canExecute = true
        const program = store.openExecutable(sources.entry, files[sources.entry])!
        store.setSession(sources.entry, program)
        const listing = await program.ready
        const main = listing.functions.find((item) => item.name === 'main')!
        emulator.currentFile = sources.entry
        emulator.line = lineOfAddress(listing, main.address)
        emulator.pc = BigInt(main.address + BASE)
    }
    emulator.clear = () => {
        emulator.canExecute = false
        emulator.buildSources = undefined
        store.clearSession()
    }
    flushSync()
    return fixture
}

function show(session: WorkbenchSession, path: string, group: EditorGroup = session.groups[0]) {
    session.selectFile(path, group)
    flushSync()
    return group
}

/** Waits for the Pseudocode of a pane's function to be decompiled, or to fail, and shown. */
async function decompiled(group: EditorGroup): Promise<PseudocodeDocument> {
    for (let attempt = 0; attempt < 500; attempt++) {
        flushSync()
        const document = group.requestedPseudocode
        if (document && document.status !== 'decompiling') {
            expect(group.displayedPseudocode).toBe(document)
            return document
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`${group.displayedPath}'s Pseudocode was not decompiled`)
}

/** The Listing a pane decompiles from, once generated. */
function listingOf(group: EditorGroup): Listing {
    return group.pseudocodeListing!.listing!
}

/** The line of a document whose text holds `text`. */
function lineWith(document: PseudocodeDocument, text: string) {
    return document.text.split('\n').findIndex((line) => line.includes(text))
}

/** The Listing line `text` is on, in the function at `from`. */
function listingLine(listing: Listing, from: string, text: string) {
    const fn = listing.functions.find((item) => item.name === from)!
    const rows = listing.text.split('\n')
    return rows.findIndex((row, index) => index >= fn.line && row.trim() === text)
}

/**
 * The Listing pane's editor, as far as a reveal reads it: holding its model, and moving its cursor
 * as the real one does, which the session hears as the Editor's cursor event.
 */
function listingEditor(session: WorkbenchSession, pane: EditorGroup) {
    const revealed: number[] = []
    pane.editor = {
        getModel: () => ({
            uri: {
                scheme: 'asm-editor',
                authority: session.languageSessionId,
                path: `/live/${pane.displayedPath}`,
                fragment: 'listing'
            },
            isDisposed: () => false,
            getLineCount: () => pane.displayedListing!.listing!.text.split('\n').length
        }),
        revealLineInCenter: (line: number) => revealed.push(line),
        setPosition: ({ lineNumber }: { lineNumber: number }) =>
            session.cursorMoved(pane, lineNumber - 1),
        getVisibleRanges: () => [],
        focus: () => {}
    } as unknown as typeof pane.editor
    return revealed
}

/** Decompile pressed in the view switch of a pane's dock. */
function pressDecompile(session: WorkbenchSession, group: EditorGroup) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionControlsHarness, { target, props: { session, group } })
    flushSync()
    disposers.push(() => unmount(app))
    const buttons = [...target.querySelectorAll('[role="group"][aria-label="View"] button')]
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Hex',
        'Disassemble',
        'Decompile'
    ])
    ;(buttons[2] as HTMLButtonElement).click()
    flushSync()
}

describe('Decompile', () => {
    it("splits one pane: the Listing on the left, crackme's main Pseudocode beside it", async () => {
        const { session, project } = setup()
        const pane = show(session, 'crackme')
        expect(pane.displayedView).toBe('hex')
        pressDecompile(session, pane)
        //the pressed pane shows the Pseudocode, and a new one on its left the Listing
        expect(session.groups).toHaveLength(2)
        const [listingPane] = session.groups
        expect(session.groups[1]).toBe(pane)
        expect(pane.displayedView).toBe('pseudocode')
        expect(listingPane.displayedPath).toBe('crackme')
        expect(listingPane.displayedView).toBe('listing')
        //a person's choice, saved as the File's last view; the Listing beside it is no choice
        expect(project.fileViews).toEqual({ crackme: 'pseudocode' })
        expect(listingPane.displayedListing).toBe(pane.pseudocodeListing)

        const document = await decompiled(pane)
        expect(document.status).toBe('ready')
        expect(pane.pseudocodeFunction?.name).toBe('main')
        const text = document.text.split('\n')
        //a header naming the function and its run-time addresses, then Ghidra's text
        expect(text[0]).toBe('// main, 0x5555555551e9 to 0x5555555552ba')
        expect(text[2]).toBe('undefined8 main(void)')
        expect(document.text).toContain('iVar1 = strcmp(acStack_98,"hunter2");')
        expect(document.text).toContain('puts("Correct!");')
        //a read-only C model of its own, kept like the Listing's
        expect(pane.displayedLanguage).toBe('c')
        expect(pane.modelIdentity).toMatchObject({
            path: 'crackme',
            view: 'pseudocode',
            functionAddress: 0x11e9
        })
        expect(pane.displayedCode).toBe(document.text)
        expect(pane.editorDisabled).toBe(true)
        //read-only, but its lines take Breakpoints on their instructions (decision 10)
        expect(pane.breakpointsEditable).toBe(true)
        expect(session.retainedModelKeys).toContain(pane.modelKey)
        //the Listing pane has the execution controls, the Pseudocode its switch
        expect(session.controlsGroup).toBe(listingPane)
        expect(pane.hasDock(true)).toBe(true)
    })

    it('opens the Listing in the other pane when there are two', async () => {
        const { session } = setup({ openTabs: ['notes.txt'] })
        const left = show(session, 'notes.txt')
        const right = show(session, 'crackme', session.splitEditor())
        session.decompile(right)
        flushSync()
        expect(session.groups).toEqual([left, right])
        expect(left.displayedPath).toBe('crackme')
        expect(left.displayedView).toBe('listing')
        expect(left.tabs.paths).toEqual(['notes.txt', 'crackme'])
        expect(right.displayedView).toBe('pseudocode')
        await decompiled(right)
        expect(session.pseudocodePair).toMatchObject({ source: right, assembly: left })
    })

    it('decompiles the function the Listing’s cursor is in', async () => {
        const { session } = setup()
        const pane = show(session, 'crackme')
        pane.setView('crackme', 'listing')
        flushSync()
        const listing = (await pane.displayedListing!.ready)!
        session.cursorMoved(pane, listingLine(listing, '_start', 'hlt'))
        session.decompile(pane)
        flushSync()
        expect(pane.pseudocodeFunction?.name).toBe('_start')
        expect((await decompiled(pane)).text).toContain('__libc_start_main(main,')
    })

    it('opens a reopened Project on the Pseudocode with the Listing on its left', async () => {
        const { session } = setup({ openTabs: ['crackme'], fileViews: { crackme: 'pseudocode' } })
        flushSync()
        expect(session.groups.map((group) => group.displayedView)).toEqual([
            'listing',
            'pseudocode'
        ])
        await decompiled(session.groups[1])
        expect(session.pseudocodePair?.assembly).toBe(session.groups[0])
    })
})

describe('the Pseudocode beside its Listing', () => {
    /** crackme's main decompiled beside its Listing, as Decompile leaves them. */
    async function paired() {
        const fixture = setup()
        const { session } = fixture
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        const document = await decompiled(pane)
        return { ...fixture, pane, listingPane, document, listing: listingOf(pane) }
    }

    it('links their lines: colours, and a selection in either highlights the other', async () => {
        const { session, pane, listingPane, document, listing } = await paired()
        const pairing = session.linePairing!
        expect(pairing).toMatchObject({ source: pane, assembly: listingPane })
        const strcmp = lineWith(document, 'strcmp(acStack_98')
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        //each side's colours, the Listing's inside main alone
        const main = listing.functions.find((fn) => fn.name === 'main')!
        expect(pane.lineColoring?.ranges.some((range) => range.startLine === strcmp)).toBe(true)
        expect(listingPane.lineColoring?.ranges.length).toBeGreaterThan(0)
        for (const range of listingPane.lineColoring!.ranges) {
            expect(range.startLine).toBeGreaterThanOrEqual(main.line)
            expect(range.endLine).toBeLessThan(main.endLine)
        }
        //a click on the call selects its Pseudocode line, and the reverse
        session.selectMappedLines(listingPane, [call])
        expect(session.mappingSelection).toEqual([{ path: 'crackme', line: strcmp }])
        expect(listingPane.mappedLines).toContain(call)
        expect(session.activeMappingColors?.size).toBe(1)
        session.selectMappedLines(pane, [lineWith(document, 'if (iVar1 == 0)')])
        expect(
            listingPane.mappedLines.map((line) => listing.text.split('\n')[line].trim())
        ).toEqual(['test eax, eax', 'jne .LAB_2'])
    })

    it("follows the Listing's cursor into another function, and stays outside any", async () => {
        const { session, pane, listingPane, listing } = await paired()
        session.cursorMoved(listingPane, listingLine(listing, '_start', 'hlt'))
        flushSync()
        expect(pane.pseudocodeFunction?.name).toBe('_start')
        const start = await decompiled(pane)
        expect(start.text).toContain('__libc_start_main(main,')
        expect(session.pseudocodePair?.map).toBe(start.map)
        //a line of no function, such as a section's, leaves it
        const section = listing.text
            .split('\n')
            .findIndex((row) => row.startsWith('section .rodata'))
        expect(section).toBeGreaterThan(0)
        session.cursorMoved(listingPane, section)
        flushSync()
        expect(pane.pseudocodeFunction?.name).toBe('_start')
        //and back in main, its Pseudocode, kept, shows at once
        session.cursorMoved(listingPane, listingLine(listing, 'main', 'call strcmp@plt'))
        flushSync()
        expect(pane.requestedPseudocode?.fn.name).toBe('main')
        expect((await decompiled(pane)).text).toContain('strcmp(acStack_98,"hunter2")')
    })

    it('names the function being decompiled in its notice, as "Decompiling…" does', async () => {
        const { session, pane, listingPane, listing } = await paired()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const notice = mount(PseudocodeNotice, { target: host, props: { group: pane } })
        disposers.push(() => unmount(notice))
        flushSync()
        expect(host.textContent?.trim()).toBe(
            'Pseudocode of main, decompiled from crackme by Ghidra: read-only, and not meant to compile.'
        )
        //main's Pseudocode stays in view while _start's is decompiled, under the name of _start
        session.cursorMoved(listingPane, listingLine(listing, '_start', 'hlt'))
        flushSync()
        expect(pane.requestedPseudocode?.status).toBe('decompiling')
        expect(pane.displayedPseudocode?.fn.name).toBe('main')
        expect(host.textContent).toContain('Pseudocode of _start,')
        await decompiled(pane)
        flushSync()
        expect(host.textContent).toContain('Pseudocode of _start,')
    })

    it('gives each function’s Pseudocode a model of its own, which two panes never share', async () => {
        const { session, pane, listingPane, listing } = await paired()
        const main = pane.modelKey
        expect(main).toMatch(/#pseudocode-11e9$/)
        session.cursorMoved(listingPane, listingLine(listing, '_start', 'hlt'))
        flushSync()
        await decompiled(pane)
        const start = pane.modelKey
        expect(start).not.toBe(main)
        //the other pane on main's Pseudocode of the same File, as a moved tab may show it, has
        //main's model, not the one this pane shows
        listingPane.followFunction(
            'crackme',
            listing.functions.find((fn) => fn.name === 'main')!.address
        )
        listingPane.setView('crackme', 'pseudocode', false)
        expect(listingPane.displayedPseudocode?.fn.name).toBe('main')
        expect(listingPane.modelKey).toBe(main)
        expect(pane.modelKey).toBe(start)
        listingPane.setView('crackme', 'listing', false)
        flushSync()
        //the Pseudocode a pane last showed of a File keeps its model while it shows another
        session.selectFile('notes.txt', pane)
        flushSync()
        expect(session.retainedModelKeys).toContain(start)
    })

    it('goes to a call’s definition in both panes', async () => {
        const { session, pane, listingPane, document, listing } = await paired()
        const revealed = listingEditor(session, listingPane)
        //the target of the name under the cursor, as the definition provider finds it
        const strcmp = lineWith(document, 'strcmp(acStack_98')
        const column = document.text.split('\n')[strcmp].indexOf('strcmp') + 2
        const token = pseudocodeTargetAt(document.lines, document.firstLine, strcmp, column)!
        const line = listingLineOfTarget(listing, token.target)
        expect(listing.text.split('\n')[line]).toBe('strcmp@plt:')
        expect(await session.followPseudocodeTarget(pane, line)).toBe(true)
        //the Listing moves to the stub, and the Pseudocode to it
        expect(revealed).toEqual([line + 1])
        expect(pane.pseudocodeFunction?.name).toBe('strcmp@plt')
        expect(listingPane.cursorLine).toBe(line)
        await decompiled(pane)
        expect(pane.displayedPseudocode?.text).toMatch(/^\/\/ strcmp@plt, /)
        //a global's moves the Listing alone
        const main = listing.functions.find((fn) => fn.name === 'main')!
        pane.followFunction('crackme', main.address)
        const back = await decompiled(pane)
        const fgets = lineWith(back, 'stdin@GLIBC_2.2.5')
        const stdin = pseudocodeTargetAt(
            back.lines,
            back.firstLine,
            fgets,
            back.text.split('\n')[fgets].indexOf('stdin')
        )!
        expect(
            await session.followPseudocodeTarget(pane, listingLineOfTarget(listing, stdin.target))
        ).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('main')
    })

    it("answers Go to Definition with the target's line in the Listing's model", async () => {
        const { pane, document, listing } = await paired()
        //the parts of Monaco the provider uses
        class Range {
            constructor(
                readonly startLineNumber: number,
                readonly startColumn: number,
                readonly endLineNumber: number,
                readonly endColumn: number
            ) {}
        }
        const monaco = { Range, Uri: { from: (parts: object) => parts } } as unknown as MonacoType
        const uri = 'pseudocode-model'
        disposers.push(
            setModelPseudocode(uri, {
                lines: document.lines,
                firstLine: document.firstLine,
                listing,
                listingIdentity: fileViewIdentity(pane.modelIdentity!, 'listing')
            })
        )
        const { definition, hover } = createPseudocodeProviders(monaco)
        const model = { uri: { toString: () => uri } } as Parameters<
            typeof definition.provideDefinition
        >[0]
        const strcmp = lineWith(document, 'strcmp(acStack_98')
        const column = document.text.split('\n')[strcmp].indexOf('strcmp') + 1
        const position = { lineNumber: strcmp + 1, column } as Parameters<
            typeof definition.provideDefinition
        >[1]
        const found = definition.provideDefinition(model, position, {} as never) as {
            uri: { fragment: string; path: string }
            range: Range
            originSelectionRange: Range
        }[]
        const line = listing.text.split('\n').indexOf('strcmp@plt:')
        expect(found).toHaveLength(1)
        expect(found[0].uri).toMatchObject({ path: '/live/crackme', fragment: 'listing' })
        expect(found[0].range.startLineNumber).toBe(line + 1)
        expect(found[0].originSelectionRange).toMatchObject({
            startColumn: column,
            endColumn: column + 'strcmp'.length
        })
        const hovered = hover.provideHover(model, position, {} as never) as {
            contents: { value: string }[]
        }
        expect(hovered.contents[0].value).toBe(
            '`strcmp@plt` at `0x5555555550f0` in the Listing: Go to Definition shows it there.'
        )
        //Ghidra's own names, and locals, have no definition
        const local = { lineNumber: strcmp + 1, column: 5 } as typeof position
        expect(definition.provideDefinition(model, local, {} as never)).toBeNull()
    })

    it('survives a Byte edit, the Pseudocode decompiled again from the edited bytes', async () => {
        const { session, pane, listingPane, document } = await paired()
        expect(session.editFileBytes('crackme', HUNTER2 + 6, Uint8Array.of(0x33))).toBe(true)
        flushSync()
        await tick()
        const edited = await decompiled(pane)
        expect(edited).not.toBe(document)
        expect(edited.text).toContain('iVar1 = strcmp(acStack_98,"hunter3");')
        //the same panes, the same function, still paired
        expect(session.groups).toEqual([listingPane, pane])
        expect(pane.pseudocodeFunction?.name).toBe('main')
        expect(listingPane.displayedListing).toBe(pane.pseudocodeListing)
        expect(session.pseudocodePair).toMatchObject({ source: pane, assembly: listingPane })
    })

    it('closes the program of an Executable no pane decompiles any more', async () => {
        const release = vi.spyOn(PseudocodeClient.prototype, 'release')
        const { pane } = await paired()
        expect(release).not.toHaveBeenCalled()
        pane.setView('crackme', 'hex')
        flushSync()
        expect(release).toHaveBeenCalledWith('crackme')
    })
})

describe('Breakpoints on Pseudocode lines', () => {
    /** crackme's main decompiled beside its Listing, and the lines of its `if` on the password. */
    async function paired() {
        const fixture = setup()
        const { session } = fixture
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        const document = await decompiled(pane)
        const listing = listingOf(pane)
        const branch = lineWith(document, 'if (iVar1 == 0)')
        const test = listingLine(listing, 'main', 'test eax, eax')
        const jne = listingLine(listing, 'main', 'jne .LAB_2')
        return { ...fixture, pane, listingPane, document, listing, branch, test, jne }
    }

    it("go on the `if`'s test in the Listing, and come off it there", async () => {
        const { session, emulator, pane, listingPane, listing, branch, test } = await paired()
        expect(pane.breakpointsEditable).toBe(true)
        session.toggleBreakpoint(branch, pane)
        flushSync()
        //an ordinary Breakpoint of the Executable, at the link-time address of the test
        expect(emulator.breakpoints).toEqual([
            { file: 'crackme', address: listing.lines.addresses[test] }
        ])
        expect(listingPane.displayedBreakpoints).toEqual([test])
        expect(pane.displayedBreakpoints).toEqual([branch])
        //removed in the Listing, the Pseudocode's mark goes with it
        session.toggleBreakpoint(test, listingPane)
        flushSync()
        expect(emulator.breakpoints).toEqual([])
        expect(pane.displayedBreakpoints).toEqual([])
    })

    it('mark a line for any of its instructions, and a click there removes them all', async () => {
        const { session, emulator, pane, listingPane, listing, branch, test, jne } = await paired()
        session.toggleBreakpoint(jne, listingPane)
        flushSync()
        expect(pane.displayedBreakpoints).toEqual([branch])
        //set at the jne, not at the block's first instruction: removed, and none placed
        session.toggleBreakpoint(branch, pane)
        flushSync()
        expect(emulator.breakpoints).toEqual([])
        session.toggleBreakpoint(test, listingPane)
        session.toggleBreakpoint(jne, listingPane)
        flushSync()
        expect(pane.displayedBreakpoints).toEqual([branch])
        session.toggleBreakpoint(branch, pane)
        flushSync()
        expect(emulator.breakpoints).toEqual([])
        expect(listingPane.displayedBreakpoints).toEqual([])
        //a line without instructions takes none
        session.toggleBreakpoint(lineWith(pane.displayedPseudocode!, 'int iVar1;'), pane)
        expect(emulator.breakpoints).toEqual([])
        expect(listing.lines.addresses[test]).toBeLessThan(listing.lines.addresses[jne])
    })

    it('stay on their instructions when the function shown changes, and show again in it', async () => {
        const { session, emulator, pane, listingPane, listing, branch } = await paired()
        session.toggleBreakpoint(branch, pane)
        session.cursorMoved(listingPane, listingLine(listing, '_start', 'hlt'))
        flushSync()
        await decompiled(pane)
        expect(pane.displayedBreakpoints).toEqual([])
        expect(emulator.breakpoints).toHaveLength(1)
        session.cursorMoved(listingPane, listingLine(listing, 'main', 'call strcmp@plt'))
        flushSync()
        await decompiled(pane)
        expect(pane.displayedBreakpoints).toEqual([branch])
    })

    it('show in a Debug session, where the Pseudocode of the Build takes them too', async () => {
        const { session, emulator, pane, listingPane, branch, test } = await paired()
        session.toggleBreakpoint(branch, pane)
        await session.build()
        await tick()
        flushSync()
        await decompiled(pane)
        expect(pane.sourceSelection).toMatchObject({ sourceKind: 'build' })
        expect(pane.breakpointsEditable).toBe(true)
        expect(pane.displayedBreakpoints).toEqual([branch])
        expect(listingPane.displayedBreakpoints).toEqual([test])
        session.toggleBreakpoint(branch, pane)
        flushSync()
        expect(emulator.breakpoints).toEqual([])
        expect(listingPane.displayedBreakpoints).toEqual([])
    })

    it('are not taken by the Build output’s Pseudocode', async () => {
        const { session, emulator } = setup()
        emulator.buildOutput = {
            path: 'main',
            bytes: new Uint8Array(crackmeBytes),
            generation: 1,
            sources: { entry: 'crackme', files: {} }
        }
        flushSync()
        const pane = show(session, 'main')
        expect(pane.displayedBuildOutput).toBe(true)
        session.decompile(pane)
        flushSync()
        const document = await decompiled(pane)
        expect(document.status).toBe('ready')
        expect(pane.breakpointsEditable).toBe(false)
        session.toggleBreakpoint(lineWith(document, 'if (iVar1 == 0)'), pane)
        expect(emulator.breakpoints).toEqual([])
        expect(pane.displayedBreakpoints).toEqual([])
    })
})

describe('a function that does not decompile', () => {
    it('shows why, with the decompiler’s message, and decompiles again on Try again', async () => {
        const { session } = setup()
        const pane = show(session, 'crackme')
        slow.add(0x5555555551e9)
        session.decompile(pane)
        flushSync()
        const document = await decompiled(pane)
        expect(document.status).toBe('failed')
        expect(document.error).toBe('main took longer than 30 seconds to decompile')
        const host = window.document.createElement('div')
        window.document.body.appendChild(host)
        const status = mount(PseudocodeStatus, {
            target: host,
            props: {
                group: pane,
                onRetry: () => session.pseudocode.retry(pane.displayedPseudocode!)
            }
        })
        disposers.push(() => unmount(status))
        flushSync()
        expect(host.querySelector('h2')?.textContent).toBe('No Pseudocode')
        expect(host.querySelector('p')?.textContent).toBe(
            'main could not be decompiled: main took longer than 30 seconds to decompile'
        )
        //a less busy machine may beat the limit
        slow.clear()
        host.querySelector('button')!.click()
        flushSync()
        expect(host.querySelector('h2')?.textContent).toBe('Decompiling…')
        expect((await decompiled(pane)).status).toBe('ready')
        flushSync()
        expect(host.querySelector('h2')).toBeNull()
    })
})

describe('the Pseudocode in a Debug session', () => {
    it('shows the program counter’s function and line, the Listing beside it following it', async () => {
        const { session, emulator } = setup()
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        await decompiled(pane)
        await session.build()
        await tick()
        flushSync()
        //the Listing pane runs the program, the Pseudocode pane stays on Decompile
        expect(listingPane.sourceSelection).toMatchObject({ sourceKind: 'build' })
        expect(listingPane.instructionLine).toBe(emulator.line)
        expect(pane.displayedView).toBe('pseudocode')
        expect(pane.sourceSelection).toMatchObject({ sourceKind: 'build' })
        const document = await decompiled(pane)
        expect(pane.pseudocodeFunction?.name).toBe('main')
        //main's endbr64 is in no line of the Pseudocode
        expect(pane.highlightedLine).toBe(-1)
        //a Step onto the call of strcmp
        const listing = listingPane.displayedListing!.listing!
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        emulator.line = call
        emulator.pc = BigInt(listing.lines.addresses[call] + BASE)
        session.revealCurrentInstruction()
        flushSync()
        expect(pane.highlightedLine).toBe(lineWith(document, 'strcmp(acStack_98'))
        expect(session.executionSourceLocation).toEqual({
            path: 'crackme',
            line: lineWith(document, 'strcmp(acStack_98')
        })
        //a Step into another function takes the Pseudocode there
        const start = listingLine(listing, '_start', 'hlt')
        emulator.line = start
        emulator.pc = BigInt(listing.lines.addresses[start] + BASE)
        session.revealCurrentInstruction()
        await tick()
        flushSync()
        expect(pane.pseudocodeFunction?.name).toBe('_start')
        session.stop()
        flushSync()
        expect(pane.highlightedLine).toBe(-1)
    })

    it("keeps the Build output's Pseudocode when a Step shows the program's source", async () => {
        const source = 'global _start\n_start:\n    mov rax, 60\n    syscall\n'
        const files = { 'main.asm': { encoding: 'plain' as const, content: source } }
        const { session, emulator } = setup({ entry: 'main.asm', files })
        emulator.buildOutput = {
            path: 'main',
            bytes: new Uint8Array(crackmeBytes),
            generation: 1,
            sources: { entry: 'main.asm', files }
        }
        flushSync()
        const pane = show(session, 'main')
        session.decompile(pane)
        flushSync()
        const [listingPane] = session.groups
        await decompiled(pane)
        //a Debug session of main.asm, whose Step shows its source: in the pane beside, which
        //showed the Build output's Listing, never in place of a Pseudocode
        emulator.buildSources = { entry: 'main.asm', files }
        emulator.canExecute = true
        flushSync()
        await session.revealSourceLocation('main.asm', 2)
        flushSync()
        expect(session.groups).toEqual([listingPane, pane])
        expect(listingPane.displayedPath).toBe('main.asm')
        expect(pane.displayedPath).toBe('main')
        expect(pane.displayedView).toBe('pseudocode')
        //with the Pseudocode alone, the source opens in a new pane beside it
        session.closeGroup(listingPane)
        flushSync()
        await session.revealSourceLocation('main.asm', 3)
        flushSync()
        expect(session.groups).toHaveLength(2)
        expect(session.groups[0]).toBe(pane)
        expect(pane.displayedView).toBe('pseudocode')
        expect(session.groups[1].displayedPath).toBe('main.asm')
        expect(session.executionGroup).toBe(session.groups[1])
    })
})
