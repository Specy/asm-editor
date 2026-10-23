/**
 * Decompile and the Pseudocode beside its Listing
 * ([file-views.md](../../../../../docs/design/file-views.md), decisions 5, 6 and 11; the plan's
 * E8.3 to E8.6): crackme's real Listing, decompiled by the real decompiler on the test's thread,
 * as jsdom has no Worker; and a C++ Executable's, its names demangled
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), P4).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { EditorGroup } from './EditorGroup.svelte'
import type { WorkbenchSession, WorkbenchSessionHost } from './WorkbenchSession.svelte'
import type { AddressBreakpoint } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { lineOfAddress, placeOfLine, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { PseudocodeClient } from '#lib/pseudocode/pseudocodeClient.ts'
import type { PseudocodeDocument } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import { listingLineOfTarget, pseudocodeTargetAt } from '#lib/pseudocode/pseudocodeMap.ts'
import { createPseudocodeProviders } from '#lib/monaco/pseudocodeProviders.ts'
import { movePseudocodeViewState } from '#lib/monaco/pseudocodeViewState.ts'
import { toast } from '#stores/toastStore.ts'
import { setModelPseudocode } from '#lib/monaco/pseudocodeModels.ts'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { fileViewIdentity } from '#lib/languages/service/uri.ts'
import { liveSource } from '#lib/monaco/projectSourceSelection.ts'
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
                openProgram(...args: Parameters<typeof decompiler.openProgram>) {
                    const program = decompiler.openProgram(...args)
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

//jsdom has no Worker: the Pseudocode worker's service runs on the test's thread
vi.mock('../pseudocode/pseudocode.worker?worker', async () => ({
    default: (await import('#lib/pseudocode/inThreadWorker.ts')).InThreadWorker
}))

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackmeBytes = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme')
const crackme = crackmeBytes.toString('base64')
/** crackme's load base, a PIE's planned one. */
const BASE = 0x555555554000
/** "hunter2", at link-time 0x2017, in a segment whose file offset is its address. */
const HUNTER2 = 0x2017
/** The decompiler package's FactCheck-like C++ program (g++ -O0), a PIE. */
const factcheck = readFileSync('../decompiler/js/tests/fixtures/elf/factcheck').toString('base64')

let decoder: ListingDecoder
let demangler: Demangler
beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    slow.clear()
    vi.restoreAllMocks()
})

/**
 * crackme beside a text File, with a Build that stops at `main` as the x86 Emulator does; or
 * another Executable, a C++ one's Listing demangled as the Listing worker demangles it. With
 * `hold`, each Listing waits to be generated until the function it returns is called.
 */
function setup(
    data: StoredProject = {},
    executable: { path: string; content: string; cpp?: boolean } = {
        path: 'crackme',
        content: crackme
    },
    host: Partial<WorkbenchSessionHost> = {}
) {
    const fixture = editorGroupsFixture(
        'X86',
        {
            entry: executable.path,
            files: {
                [executable.path]: { encoding: 'base64', content: executable.content },
                'notes.txt': { encoding: 'plain', content: 'password?' }
            },
            ...data
        },
        host
    )
    disposers.push(fixture.dispose)
    const { emulator } = fixture
    let held: Promise<void> | undefined
    const store = new ListingDocuments(async (order) => {
        await held
        return generateListing(decoder, {
            ...order,
            version: 'v1',
            ...(executable.cpp ? { demangler } : {})
        })
    })
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
    const hold = () => {
        let release = () => {}
        held = new Promise((resolve) => (release = resolve))
        return () => {
            held = undefined
            release()
        }
    }
    return { ...fixture, hold }
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
                //the version the pane shows, a Build's during a Debug session
                path:
                    pane.sourceSelection.sourceKind === 'build'
                        ? `/build-${pane.sourceSelection.buildGeneration}/${pane.displayedPath}`
                        : `/live/${pane.displayedPath}`,
                fragment: 'listing'
            },
            isDisposed: () => false,
            getLineCount: () => pane.displayedListing!.listing!.text.split('\n').length
        }),
        revealLineInCenter: (line: number) => revealed.push(line),
        setPosition: ({ lineNumber }: { lineNumber: number }) =>
            session.cursorMoved(pane, lineNumber - 1),
        getPosition: () => ({ lineNumber: pane.cursorLine + 1, column: 1 }),
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
        pane.setView('crackme', 'hex', false)
        flushSync()
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
        expect(host.textContent?.trim()).toBe('Pseudocode of main in crackme, read-only')
        //main's Pseudocode stays in view while _start's is decompiled, under the name of _start
        session.cursorMoved(listingPane, listingLine(listing, '_start', 'hlt'))
        flushSync()
        expect(pane.requestedPseudocode?.status).toBe('decompiling')
        expect(pane.displayedPseudocode?.fn.name).toBe('main')
        expect(host.textContent).toContain('Pseudocode of _start in crackme,')
        await decompiled(pane)
        flushSync()
        expect(host.textContent).toContain('Pseudocode of _start in crackme,')
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
        const fgets = lineWith(back, 'fgets(acStack_98,0x80,stdin)')
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
        const listing = pane.pseudocodeListing
        expect(session.editFileBytes('crackme', HUNTER2 + 6, Uint8Array.of(0x33))).toBe(true)
        flushSync()
        await tick()
        //the Listing is made again from the edited bytes, the one before shown until it is ready
        for (let attempt = 0; attempt < 100 && pane.pseudocodeListing === listing; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 10))
            flushSync()
        }
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

describe('the navigation history', () => {
    /** crackme's main beside its Listing, whose editor moves its cursor as a reveal asks. */
    async function paired() {
        const fixture = setup()
        const { session } = fixture
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        await decompiled(pane)
        const listing = listingOf(pane)
        const revealed = listingEditor(session, listingPane)
        const rows = listing.text.split('\n')
        const fn = (name: string) => listing.functions.find((item) => item.name === name)!
        return { ...fixture, pane, listingPane, listing, revealed, rows, fn }
    }

    it('goes back and forward in the Pseudocode after following a call, the Listing with it', async () => {
        const { session, pane, listingPane, listing, rows, fn } = await paired()
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        session.cursorMoved(listingPane, call)
        const stub = rows.indexOf('strcmp@plt:')
        expect(await session.followPseudocodeTarget(pane, stub)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('strcmp@plt')
        //both panes moved, and each keeps the place it left
        expect(pane.history.behind).toEqual([
            {
                selection: liveSource('crackme'),
                view: 'pseudocode',
                functionAddress: fn('main').address
            }
        ])
        //the line the Listing left, by the address it stands for too
        expect(listingPane.history.behind).toEqual([
            {
                selection: liveSource('crackme'),
                view: 'listing',
                line: call,
                place: placeOfLine(listing, call)
            }
        ])
        //Back: main's Pseudocode, and the Listing beside it on main
        expect(await session.goBack(pane)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('main')
        expect(listingPane.cursorLine).toBe(fn('main').line)
        expect(pane.history.canGoBack).toBe(false)
        //Forward: the stub again
        expect(await session.goForward(pane)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('strcmp@plt')
        expect(listingPane.cursorLine).toBe(stub)
        expect(pane.history.canGoForward).toBe(false)
        //Back in the Listing: the call it left, which the Pseudocode follows into main
        expect(await session.goBack(listingPane)).toBe(true)
        expect(listingPane.cursorLine).toBe(call)
        expect(pane.pseudocodeFunction?.name).toBe('main')
        expect(await session.goBack(listingPane)).toBe(false)
    })

    it("records the Listing's Go to Definition, Go to Symbol and the Symbols panel", async () => {
        const { session, pane, listingPane, listing, rows, fn } = await paired()
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        session.cursorMoved(listingPane, call)
        //Go to Definition, or a double-click, on `strcmp@plt` in the Listing
        const stub = rows.indexOf('strcmp@plt:')
        expect(
            await session.openResource(
                listingPane.modelIdentity!,
                { lineNumber: stub + 1, column: 1 },
                listingPane.editor
            )
        ).toBe(true)
        expect(listingPane.cursorLine).toBe(stub)
        //the Pseudocode beside it followed, and keeps the function it left too
        expect(pane.pseudocodeFunction?.name).toBe('strcmp@plt')
        //Go to Symbol moves the cursor on to `_start`, the Editor saying first where from
        session.recordJump(listingPane, stub)
        session.cursorMoved(listingPane, fn('_start').line)
        //a function picked in the Symbols panel, while the Listing has the keyboard
        session.focusEditorGroup(listingPane)
        expect(await session.revealListingLine(liveSource('crackme'), fn('main').line)).toBe(true)
        expect(
            listingPane.history.behind.map((place) => place.view === 'listing' && place.line)
        ).toEqual([call, stub, fn('_start').line])
        expect(
            pane.history.behind.map((place) => place.view === 'pseudocode' && place.functionAddress)
        ).toEqual([fn('main').address, fn('strcmp@plt').address, fn('_start').address])
        expect(await session.goBack(listingPane)).toBe(true)
        expect(listingPane.cursorLine).toBe(fn('_start').line)
        expect(pane.pseudocodeFunction?.name).toBe('_start')
        //the same panel while the Pseudocode has it follows the name there, both panes keeping
        //where they were
        session.focusEditorGroup(pane)
        expect(await session.revealListingLine(liveSource('crackme'), stub)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('strcmp@plt')
        expect(pane.history.behind.at(-1)).toEqual({
            selection: liveSource('crackme'),
            view: 'pseudocode',
            functionAddress: fn('_start').address
        })
        expect(listingPane.history.behind.at(-1)).toEqual({
            selection: liveSource('crackme'),
            view: 'listing',
            line: fn('_start').line,
            place: placeOfLine(listing, fn('_start').line)
        })
    })

    it('goes back and forward from outside the editor, keeping the browser on the page', async () => {
        const { session, pane, listingPane, listing, rows } = await paired()
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        session.cursorMoved(listingPane, call)
        expect(await session.followPseudocodeTarget(pane, rows.indexOf('strcmp@plt:'))).toBe(true)
        session.focusEditorGroup(listingPane)
        //a row of the Symbols panel, which keeps the keyboard after a click, and a text field
        const row = document.createElement('button')
        const field = document.createElement('input')
        document.body.append(row, field)
        const send = (target: HTMLElement, event: Event) => {
            target.addEventListener(event.type, (e) => session.handleHistoryInput(e as never), {
                once: true
            })
            target.dispatchEvent(event)
            return event.defaultPrevented
        }
        const key = (target: HTMLElement, key: string) =>
            send(target, new KeyboardEvent('keydown', { key, altKey: true, cancelable: true }))
        const button = (type: string, button: number) =>
            send(row, new MouseEvent(type, { button, cancelable: true }))
        //a text field keeps Alt+←, which moves by word there on a Mac
        expect(key(field, 'ArrowLeft')).toBe(false)
        expect(listingPane.cursorLine).toBe(rows.indexOf('strcmp@plt:'))
        expect(key(row, 'ArrowLeft')).toBe(true)
        await vi.waitFor(() => expect(listingPane.cursorLine).toBe(call))
        //with nowhere to go back to, Alt+← is the browser's
        expect(key(row, 'ArrowLeft')).toBe(false)
        //the mouse's forward button, which goes on its release
        expect(button('mousedown', 4)).toBe(true)
        expect(listingPane.cursorLine).toBe(call)
        expect(button('mouseup', 4)).toBe(true)
        expect(button('auxclick', 4)).toBe(true)
        await vi.waitFor(() => expect(listingPane.cursorLine).toBe(rows.indexOf('strcmp@plt:')))
        //and with nowhere further to go, the next press is the browser's
        expect(button('mousedown', 4)).toBe(false)
        expect(button('mouseup', 4)).toBe(false)
        //a pane on text has no history to move through
        session.selectFile('notes.txt', listingPane)
        flushSync()
        expect(button('mousedown', 3)).toBe(false)
        expect(button('mouseup', 3)).toBe(false)
    })

    it('goes back into a Listing still being generated, once it is', async () => {
        const { session, emulator } = setup()
        //the Listing comes when the test says, as a large one or the next Build's does
        let generated!: () => void
        const gate = new Promise<void>((resolve) => (generated = resolve))
        emulator.listings = new ListingDocuments(async (order) => {
            await gate
            return generateListing(decoder, { ...order, version: 'v1' })
        })
        const pane = show(session, 'notes.txt')
        listingEditor(session, pane)
        pane.history.record({ selection: liveSource('crackme'), view: 'listing', line: 40 })
        const back = session.goBack(pane)
        await tick()
        expect(pane.displayedView).toBe('listing')
        expect(pane.displayedListing?.status).toBe('generating')
        //it takes longer than a reveal's first attempts
        await new Promise((resolve) => setTimeout(resolve, 120))
        generated()
        expect(await back).toBe(true)
        expect(pane.cursorLine).toBe(40)
    })

    it("records a pointer menu's Show in Listing only in the pane it moves", async () => {
        const { session, emulator } = setup()
        const left = show(session, 'crackme')
        const right = show(session, 'crackme', session.splitEditor())
        await session.build()
        await tick()
        flushSync()
        const listing = left.displayedListing!.listing!
        const revealed = listingEditor(session, left)
        listingEditor(session, right)
        Object.assign(emulator, {
            getSourceLocationFromAddress: (address: bigint) => ({
                file: 'crackme',
                line: lineOfAddress(listing, Number(address) - BASE)
            })
        })
        const main = listing.functions.find((item) => item.name === 'main')!
        const start = listing.functions.find((item) => item.name === '_start')!
        session.cursorMoved(left, main.line)
        session.cursorMoved(right, main.line)
        //the right pane came back from somewhere it can go forward to again
        const ahead = { selection: right.sourceSelection, view: 'listing' as const, line: 3 }
        right.history.ahead = [ahead]
        await session.revealAddress(BigInt(start.address + BASE), { jump: true })
        expect(revealed.at(-1)).toBe(lineOfAddress(listing, start.address) + 1)
        expect(left.history.behind).toEqual([
            {
                selection: left.sourceSelection,
                view: 'listing',
                line: main.line,
                place: placeOfLine(listing, main.line)
            }
        ])
        expect(right.history.behind).toEqual([])
        expect(right.history.ahead).toEqual([ahead])
    })

    it('opens a closed tab again, and passes over a File that is gone', async () => {
        const { session, pane, listingPane, rows } = await paired()
        session.cursorMoved(listingPane, 3)
        expect(await session.followPseudocodeTarget(pane, rows.indexOf('strcmp@plt:'))).toBe(true)
        //the Listing pane shows notes.txt instead, as text: no place of the history, but Back
        //shows the Listing again
        session.selectFile('notes.txt', listingPane)
        flushSync()
        expect(session.navigationPosition(listingPane)).toBeUndefined()
        expect(await session.goBack(listingPane)).toBe(true)
        expect(listingPane.displayedPath).toBe('crackme')
        expect(listingPane.displayedView).toBe('listing')
        //a place in a File deleted since is dropped
        listingPane.history.record({ selection: liveSource('gone'), view: 'listing', line: 1 })
        expect(await session.goBack(listingPane)).toBe(false)
        expect(listingPane.history.canGoBack).toBe(false)
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

describe('Run to Cursor', () => {
    it("runs to a Pseudocode line's instructions or a Listing line's, during a Debug session", async () => {
        const { session, emulator } = setup()
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        let document = await decompiled(pane)
        const listing = listingOf(pane)
        const branch = lineWith(document, 'if (iVar1 == 0)')
        const test = listingLine(listing, 'main', 'test eax, eax')
        //nothing runs outside a Debug session
        expect(session.runToCursorTargets(pane, branch)).toBeUndefined()
        expect(session.runToCursorTargets(listingPane, test)).toBeUndefined()

        await session.build()
        await tick()
        flushSync()
        document = await decompiled(pane)
        //the `if`'s block starts at its test, where a Breakpoint on the line would go
        const target = { file: 'crackme', address: listing.lines.addresses[test] }
        expect(session.runToCursorTargets(pane, branch)).toEqual([target])
        expect(session.runToCursorTargets(listingPane, test)).toEqual([target])
        //a line without an instruction has nowhere to run to
        expect(session.runToCursorTargets(pane, lineWith(document, 'int iVar1;'))).toBeUndefined()
        const main = listing.functions.find((fn) => fn.name === 'main')!
        expect(session.runToCursorTargets(listingPane, main.line)).toBeUndefined()

        await session.runToCursor(pane, branch)
        expect(emulator.runsTo).toEqual([[target]])
        //a Breakpoint of the Run's own, which the person's list never holds
        expect(emulator.breakpoints).toEqual([])
        expect(session.running).toBe(false)
        //nor while the program runs, nor once it has ended
        session.running = true
        expect(session.runToCursorTargets(pane, branch)).toBeUndefined()
        session.running = false
        emulator.terminated = true
        flushSync()
        expect(session.runToCursorTargets(listingPane, test)).toBeUndefined()
    })
})

describe("a C++ Executable's Pseudocode", () => {
    const STRING_APPEND = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_'

    /** factcheck's main decompiled beside its Listing, whose editor moves as a reveal asks. */
    async function paired() {
        const fixture = setup({}, { path: 'factcheck', content: factcheck, cpp: true })
        const { session } = fixture
        const pane = show(session, 'factcheck')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        const document = await decompiled(pane)
        const listing = listingOf(pane)
        const revealed = listingEditor(session, listingPane)
        const fn = (name: string) => listing.functions.find((item) => item.name === name)!
        return { ...fixture, pane, listingPane, document, listing, revealed, fn }
    }

    /** The Pseudocode's notice and its status over it, as the pane shows them. */
    function mountNotices(pane: EditorGroup) {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const notice = mount(PseudocodeNotice, { target: host, props: { group: pane } })
        const status = mount(PseudocodeStatus, {
            target: host,
            props: { group: pane, onRetry: () => {} }
        })
        disposers.push(() => {
            unmount(status)
            unmount(notice)
        })
        flushSync()
        return host
    }

    it('reads main by its C++ names, one token each, and follows one there and back', async () => {
        const { session, pane, listingPane, document, listing, fn } = await paired()
        expect(pane.pseudocodeFunction?.name).toBe('main')
        expect(document.text).toContain('std::string::operator+=(auStack_128,auStack_c8);')
        expect(document.text).toContain(
            'std::vector<std::string>::push_back(auStack_198,auStack_128);'
        )
        expect(document.text).toContain(
            'piVar4 = (int *)std::map<std::string, int>::operator[](auStack_158,auStack_128);'
        )
        expect(document.text).not.toMatch(/\b_Z\w+/)
        //anywhere on the qualified name, the one token of the function it calls
        const name = 'std::string::operator+='
        const row = lineWith(document, `${name}(auStack_128,auStack_c8)`)
        const start = document.text.split('\n')[row].indexOf(name)
        const token = pseudocodeTargetAt(document.lines, document.firstLine, row, start)!
        expect(
            pseudocodeTargetAt(document.lines, document.firstLine, row, start + name.length - 2)
        ).toBe(token)
        expect([token.start, token.end]).toEqual([start, start + name.length])
        const append = fn(STRING_APPEND)
        expect(token.target).toBe(append.address)
        //Go to Definition: the Listing moves to its label, and the Pseudocode to it
        const line = listingLineOfTarget(listing, token.target)
        expect(line).toBe(append.line)
        expect(await session.followPseudocodeTarget(pane, line)).toBe(true)
        expect(pane.pseudocodeFunction).toBe(append)
        expect(listingPane.cursorLine).toBe(line)
        const shown = await decompiled(pane)
        //the header names it as lists do: by its signature, since std::string has two of them,
        //its declaration by its whole path
        expect(shown.text).toMatch(
            /^\/\/ std::string::operator\+=\(std::string const&\), 0x[\da-f]+ to 0x[\da-f]+\n\n/
        )
        expect(shown.text.split('\n')[2]).toContain(' std::string::operator+=(')
        //Back: main, the Listing with it
        expect(await session.goBack(pane)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('main')
        expect(listingPane.cursorLine).toBe(fn('main').line)
        expect(await session.goForward(pane)).toBe(true)
        expect(pane.pseudocodeFunction).toBe(append)
    })

    it('names the function it shows as lists do: its short name, or its signature where another shares it', async () => {
        const { session, pane, listingPane, fn } = await paired()
        const host = mountNotices(pane)
        expect(host.textContent).toContain('Pseudocode of main in factcheck, read-only')
        //"Decompiling…" names the function the Listing's cursor moved into, by its short name
        const push = fn(
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_'
        )
        expect(push.list).toBe('std::vector<std::string>::push_back')
        session.cursorMoved(listingPane, push.line)
        flushSync()
        expect(pane.requestedPseudocode?.status).toBe('decompiling')
        expect(host.textContent).toContain(
            'Pseudocode of std::vector<std::string>::push_back in factcheck,'
        )
        expect(host.textContent).toContain('Decompiling std::vector<std::string>::push_back')
        await decompiled(pane)
        //a deleting destructor beside the complete one, both game::Boss::~Boss
        const deleting = fn('_ZN4game4BossD0Ev')
        expect(deleting.list).toBe('game::Boss::~Boss() [deleting]')
        session.cursorMoved(listingPane, deleting.line)
        flushSync()
        const document = await decompiled(pane)
        flushSync()
        expect(document.text.split('\n')[0]).toMatch(
            /^\/\/ game::Boss::~Boss\(\) \[deleting\], 0x[\da-f]+ to 0x[\da-f]+$/
        )
        expect(host.textContent).toContain(
            'Pseudocode of game::Boss::~Boss() [deleting] in factcheck, read-only'
        )
        //the Symbols panel's choice, while the Pseudocode has the keyboard, follows it too
        session.focusEditorGroup(pane)
        expect(await session.revealListingLine(liveSource('factcheck'), fn('main').line)).toBe(true)
        expect(pane.pseudocodeFunction?.name).toBe('main')
    })

    it('takes Breakpoints on a namespaced function’s lines and runs to them', async () => {
        const { session, emulator, pane, listingPane, listing, fn } = await paired()
        const push = fn(
            '_ZNSt6vectorINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESaIS5_EE9push_backERKS5_'
        )
        session.cursorMoved(listingPane, push.line)
        flushSync()
        const document = await decompiled(pane)
        expect(document.text.split('\n')[0]).toMatch(/^\/\/ std::vector<std::string>::push_back, /)
        //its first line with instructions, a Breakpoint at the first of them
        const line = document.map!.addresses.findIndex((addresses) => addresses.length > 0)
        expect(line).toBeGreaterThan(0)
        session.toggleBreakpoint(line, pane)
        flushSync()
        expect(emulator.breakpoints).toHaveLength(1)
        const [breakpoint] = emulator.breakpoints as AddressBreakpoint[]
        expect(breakpoint).toMatchObject({ file: 'factcheck' })
        expect(breakpoint.address).toBeGreaterThanOrEqual(push.address)
        expect(breakpoint.address).toBeLessThan(push.end)
        expect(pane.displayedBreakpoints).toEqual([line])
        expect(listingPane.displayedBreakpoints).toEqual([
            lineOfAddress(listing, breakpoint.address)
        ])
        session.toggleBreakpoint(line, pane)
        flushSync()
        expect(emulator.breakpoints).toEqual([])
        //Run to Cursor in a Debug session, in the Pseudocode of the Build, which starts at the
        //program counter's function
        await session.build()
        await tick()
        flushSync()
        await decompiled(pane)
        pane.followFunction('factcheck', push.address)
        flushSync()
        await decompiled(pane)
        expect(pane.pseudocodeFunction?.name).toBe(push.name)
        expect(session.runToCursorTargets(pane, line)).toEqual([breakpoint])
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
        expect(document.error).toBe('main took longer than 30 seconds to decompile.')
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
            "Couldn't decompile main: main took longer than 30 seconds to decompile."
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

    it('stays where it was when the program exits, drawing no program counter', async () => {
        const { session, emulator } = setup()
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        await decompiled(pane)
        await session.build()
        await tick()
        flushSync()
        const document = await decompiled(pane)
        const listing = listingPane.displayedListing!.listing!
        const call = listingLine(listing, 'main', 'call strcmp@plt')
        emulator.line = call
        emulator.pc = BigInt(listing.lines.addresses[call] + BASE)
        session.revealCurrentInstruction()
        flushSync()
        expect(pane.highlightedLine).toBe(lineWith(document, 'strcmp(acStack_98'))
        //a Run to the end, which the Emulator shows on no line, its program counter still in
        //the program's code as after an `exit` system call of its own
        ;(emulator as unknown as { run: () => Promise<void> }).run = async () => {
            emulator.terminated = true
            ;(emulator as unknown as { termination: unknown }).termination = {
                kind: 'exit',
                code: 0
            }
            emulator.line = -1
        }
        await session.run()
        await tick()
        flushSync()
        expect(listingPane.displayedPath).toBe('crackme')
        expect(listingPane.displayedView).toBe('listing')
        expect(listingPane.instructionLine).toBe(-1)
        expect(pane.pseudocodeFunction?.name).toBe('main')
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

describe('renames and comments in the Pseudocode', () => {
    /** main's link-time address in crackme. */
    const MAIN = 0x11e9
    const runTime = (address: number) => `0x${(address + BASE).toString(16)}`

    /** crackme's main decompiled beside its Listing, in a Workbench of `host`. */
    async function paired(host: Partial<WorkbenchSessionHost> = {}) {
        const fixture = setup({}, undefined, host)
        const { session } = fixture
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        const document = await decompiled(pane)
        return { ...fixture, pane, listingPane, document, listing: listingOf(pane) }
    }

    /**
     * The Pseudocode a pane shows once the one it asks for is decompiled and its text holds
     * `text` (or, with `absent`, no longer does), after a change.
     */
    async function shownWith(pane: EditorGroup, text: string, absent = false) {
        for (let attempt = 0; attempt < 500; attempt++) {
            flushSync()
            const shown = pane.displayedPseudocode
            if (
                shown?.status === 'ready' &&
                pane.requestedPseudocode === shown &&
                shown.text.includes(text) !== absent
            )
                return shown
            await new Promise((resolve) => setTimeout(resolve, 10))
        }
        throw new Error(`the Pseudocode never ${absent ? 'lost' : 'showed'} ${text}`)
    }

    /** The line of the first `text` of a document, and a column `offset` into its `word`. */
    function at(document: PseudocodeDocument, text: string, word = text, offset = 1) {
        const line = lineWith(document, text)
        expect(line, text).toBeGreaterThanOrEqual(0)
        const column = document.text.split('\n')[line].indexOf(word)
        expect(column, word).toBeGreaterThanOrEqual(0)
        return { line, column: column + offset }
    }

    /** Waits for a pane's Listing to be the one asked for, and returns its text's lines. */
    async function listingRows(session: WorkbenchSession, pane: EditorGroup) {
        for (let attempt = 0; attempt < 500; attempt++) {
            flushSync()
            const requested = session.listingFor(pane.sourceSelection)
            if (requested?.status === 'ready' && pane.displayedListing === requested)
                return requested.listing!.text.split('\n')
            await new Promise((resolve) => setTimeout(resolve, 10))
        }
        throw new Error('the Listing was not generated')
    }

    it('renames a local with Rename…, its name checked as typed, only its function decompiled again', async () => {
        const { session, pane, listingPane, document } = await paired()
        const listingDocument = pane.pseudocodeListing
        const name = at(document, 'iVar1 = strcmp(acStack_98', 'acStack_98')
        expect(session.annotatablePath(pane)).toBe('crackme')
        expect(session.canRenameAt(pane, name.line, name.column)).toBe(true)
        expect(session.renameTargetAt(pane, name.line, name.column)).toBeUndefined()
        expect(session.variableTargetAt(pane, name.line, name.column)).toMatchObject({
            functionAddress: MAIN,
            id: 'stack:-0x98',
            parameter: false,
            current: 'acStack_98',
            raw: 'acStack_98'
        })
        expect(session.canResetNameAt(pane, name.line, name.column)).toBe(false)
        //just after the name, where a click past its last letter leaves the cursor
        expect(
            session.variableTargetAt(pane, name.line, name.column - 1 + 'acStack_98'.length)?.id
        ).toBe('stack:-0x98')
        //no name: a keyword, a string's text, a number
        const branch = at(document, 'if (iVar1 == 0)', 'if')
        expect(session.canRenameAt(pane, branch.line, branch.column)).toBe(false)
        const string = at(document, '"hunter2"', 'hunter2')
        expect(session.canRenameAt(pane, string.line, string.column)).toBe(false)

        expect(session.openRenamePrompt(pane, name.line, name.column)).toBe(true)
        const prompt = pane.openAnnotationPrompt!
        expect(prompt.spec).toMatchObject({
            kind: 'name',
            title: 'Rename acStack_98',
            text: 'acStack_98',
            pseudocodeFunction: MAIN
        })
        expect(prompt.spec.note).toBeUndefined()
        //over this Pseudocode, not the Listing beside it
        expect(listingPane.openAnnotationPrompt).toBeUndefined()
        const reason = (text: string) => {
            prompt.input(text)
            return prompt.problem
        }
        //its own name, which keeps it the decompiler's
        expect(reason('acStack_98')).toBeUndefined()
        expect(reason('local_98')).toBe(
            'The name “local_98” uses the same format that the decompiler uses. Choose a different name.'
        )
        expect(reason('sVar4')).toBe(
            'The name “sVar4” uses the same format that the decompiler uses. Choose a different name.'
        )
        expect(reason('main')).toBe(
            'The name “main” is already used as a function or global variable. Choose another name.'
        )
        expect(reason('puts')).toBe(
            'The name “puts” is already used as a function or global variable. Choose another name.'
        )
        expect(reason('int')).toBe('“int” is a C keyword. Choose another name.')
        expect(reason('my password')).toBe(
            'The name can only have letters, digits and underscores. This name has a space.'
        )
        expect(reason(' password ')).toBeUndefined()
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(pane.annotationPrompt).toBeUndefined()
        expect(session.project.files.crackme.annotations).toEqual({
            locals: { '0x11e9': { 'stack:-0x98': 'password' } }
        })
        flushSync()
        //only main is decompiled again: the Listing is the one it was, and the text stays shown
        expect(session.listingFor(pane.sourceSelection)).toBe(listingDocument)
        expect(pane.requestedPseudocode).not.toBe(document)
        expect(pane.displayedPseudocode).toBe(document)
        expect(pane.displayedCode).toBe(document.text)
        const renamed = await shownWith(pane, 'iVar1 = strcmp(password,"hunter2");')
        expect(renamed.text).toContain('char password [136];')
        expect(renamed.text).toContain('pcVar2 = fgets(password,0x80,stdin);')
        expect(pane.pseudocodeListing).toBe(listingDocument)
        //what the decompiler named it, which its hover and its prompt say
        expect(renamed.defaultNames.get('stack:-0x98')).toBe('acStack_98')

        //another variable cannot take the name, and takes its own
        const result = at(renamed, 'iVar1 = strcmp', 'iVar1')
        session.openRenamePrompt(pane, result.line, result.column)
        const other = pane.openAnnotationPrompt!
        other.input('password')
        expect(other.problem).toBe(
            'Another variable in this function is already called “password”.'
        )
        other.input('result')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        const both = await shownWith(pane, 'result = strcmp(password,"hunter2");')
        expect(both.text).toContain('if (result == 0) {')
        //the prompt of a renamed one says what it was
        const stack = at(both, 'result = strcmp(password', 'password')
        expect(session.canResetNameAt(pane, stack.line, stack.column)).toBe(true)
        session.openRenamePrompt(pane, stack.line, stack.column)
        expect(pane.openAnnotationPrompt!.spec).toMatchObject({
            title: 'Rename password',
            text: 'password',
            note: 'Renamed “acStack_98” to “password”. Rename it to “acStack_98” again to go back.'
        })
    })

    it('resets a local’s name: Reset name, or the decompiler’s name typed', async () => {
        const { session, pane } = await paired()
        expect(session.renameVariable('crackme', MAIN, 'stack:-0x98', 'password')).toBe(true)
        let renamed = await shownWith(pane, 'strcmp(password,')
        let name = at(renamed, 'strcmp(password', 'password')
        expect(session.canResetNameAt(pane, name.line, name.column)).toBe(true)
        expect(session.resetNameAt(pane, name.line, name.column)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        const reset = await shownWith(pane, 'strcmp(acStack_98,')
        name = at(reset, 'strcmp(acStack_98', 'acStack_98')
        expect(session.canResetNameAt(pane, name.line, name.column)).toBe(false)

        session.renameVariable('crackme', MAIN, 'stack:-0x98', 'password')
        renamed = await shownWith(pane, 'strcmp(password,')
        name = at(renamed, 'strcmp(password', 'password')
        session.openRenamePrompt(pane, name.line, name.column)
        const prompt = pane.openAnnotationPrompt!
        prompt.input('acStack_98')
        expect(prompt.problem).toBeUndefined()
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        await shownWith(pane, 'strcmp(acStack_98,')
    })

    it('refuses a parameter its function’s C declaration names, saying why', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const hello = readFileSync('../x86/blink-js/tests/fixtures/elf/hello-atexit-static')
        const { session } = setup({}, { path: 'hello', content: hello.toString('base64') })
        const pane = show(session, 'hello')
        session.decompile(pane)
        flushSync()
        await decompiled(pane)
        const puts = listingOf(pane).functions.find((fn) => fn.name === 'puts')!
        pane.followFunction('hello', puts.address)
        flushSync()
        const document = await decompiled(pane)
        expect(document.text).toContain('int puts(char *s)')
        const parameter = at(document, 'int puts(char *s)', 's)')
        expect(session.variableTargetAt(pane, parameter.line, parameter.column)).toMatchObject({
            parameter: true,
            current: 's',
            refusal:
                "“s” can't be renamed, as its name comes from the C library's declaration of puts."
        })
        expect(session.canRenameAt(pane, parameter.line, parameter.column)).toBe(true)
        expect(session.canResetNameAt(pane, parameter.line, parameter.column)).toBe(false)
        expect(session.openRenamePrompt(pane, parameter.line, parameter.column)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith(
            "“s” can't be renamed, as its name comes from the C library's declaration of puts."
        )
        expect(pane.annotationPrompt).toBeUndefined()
        //its locals are the person's to name
        const local = at(document, 'sVar6 = strlen(s)', 'sVar6')
        expect(session.openRenamePrompt(pane, local.line, local.column)).toBe(true)
        expect(session.project.files.hello.annotations).toBeUndefined()
    }, 30_000)

    it('renames a function from its declaration and its calls, as the Listing does', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session, pane, listingPane, document } = await paired()
        //a library function's name is the library's
        const call = at(document, 'iVar1 = strcmp', 'strcmp')
        expect(session.renameTargetAt(pane, call.line, call.column)).toMatchObject({
            refusal: "“strcmp” can't be renamed, as it comes from a shared library."
        })
        expect(session.openRenamePrompt(pane, call.line, call.column)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith(
            "“strcmp” can't be renamed, as it comes from a shared library."
        )

        const declaration = at(document, 'undefined8 main(void)', 'main')
        expect(session.renameTargetAt(pane, declaration.line, declaration.column)).toMatchObject({
            address: MAIN,
            raw: 'main',
            current: 'main'
        })
        expect(session.variableTargetAt(pane, declaration.line, declaration.column)).toBe(undefined)
        expect(session.openRenamePrompt(pane, declaration.line, declaration.column)).toBe(true)
        const prompt = pane.openAnnotationPrompt!
        expect(prompt.spec).toMatchObject({
            kind: 'name',
            title: 'Rename main',
            text: 'main',
            pseudocodeFunction: MAIN
        })
        prompt.input('_start')
        expect(prompt.problem).toBe(
            `Another label is already called “_start” (at ${runTime(0x1100)}).`
        )
        prompt.input('check_password')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' }
        })
        //the program is opened again with the name, the text shown until then
        flushSync()
        expect(pane.displayedCode).toBe(document.text)
        const renamed = await shownWith(pane, 'undefined8 check_password(void)')
        expect(renamed.text.split('\n')[0]).toBe(
            '// check_password, 0x5555555551e9 to 0x5555555552ba'
        )
        expect(await listingRows(session, listingPane)).toContain('check_password:')
        //the name it was renamed from, as the Listing's hover says it
        const again = at(renamed, 'undefined8 check_password(void)', 'check_password')
        expect(session.canResetNameAt(pane, again.line, again.column)).toBe(true)
        session.openRenamePrompt(pane, again.line, again.column)
        expect(pane.openAnnotationPrompt!.spec.note).toBe(
            'Renamed “main” to “check_password”. Rename it to “main” again to go back.'
        )
        session.closeAnnotationPrompt(pane)

        //and from a call, in _start, where the library's own is refused
        const start = listingOf(pane).functions.find((fn) => fn.name === '_start')!
        pane.followFunction('crackme', start.address)
        flushSync()
        const entry = await shownWith(pane, '__libc_start_main(check_password,')
        const library = at(entry, '__libc_start_main(', '__libc_start_main')
        expect(session.renameTargetAt(pane, library.line, library.column)?.refusal).toBe(
            "“__libc_start_main” can't be renamed, as it comes from a shared library."
        )
        const argument = at(entry, '__libc_start_main(check_password', 'check_password')
        expect(session.resetNameAt(pane, argument.line, argument.column)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        await shownWith(pane, '__libc_start_main(main,')
    })

    it('renames a stripped program’s invented function from a call of it', async () => {
        const stripped = readFileSync('../decompiler/js/tests/fixtures/elf/crackme-stripped')
        const { session } = setup({}, { path: 'stripped', content: stripped.toString('base64') })
        const pane = show(session, 'stripped')
        session.decompile(pane)
        flushSync()
        const listingPane = session.groups[0]
        await decompiled(pane)
        //a function nothing in the file names, calling another
        const caller = listingOf(pane).functions.find((fn) => fn.name === 'FUN_peachy_anteater')!
        pane.followFunction('stripped', caller.address)
        flushSync()
        const document = await decompiled(pane)
        const call = at(document, 'FUN_moonlit_vole(', 'FUN_moonlit_vole')
        const target = session.renameTargetAt(pane, call.line, call.column)!
        expect(target).toMatchObject({ raw: 'FUN_moonlit_vole', current: 'FUN_moonlit_vole' })
        expect(target.refusal).toBeUndefined()
        expect(session.openRenamePrompt(pane, call.line, call.column)).toBe(true)
        pane.openAnnotationPrompt!.input('deregister')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(session.project.files.stripped.annotations).toEqual({
            names: { [`0x${target.address.toString(16)}`]: 'deregister' }
        })
        await shownWith(pane, 'deregister(')
        expect(await listingRows(session, listingPane)).toContain('deregister:')
    })

    it('comments on a statement at its first instruction, shown above it and in the Listing', async () => {
        const { session, pane, listingPane, document, listing } = await paired()
        const branch = lineWith(document, 'if (iVar1 == 0)')
        const test = listing.lines.addresses[listingLine(listing, 'main', 'test eax, eax')]
        expect(session.commentTargetAt(pane, branch)).toEqual({ kind: 'comment', address: test })
        expect(session.canDeleteCommentAt(pane, branch)).toBe(false)
        expect(session.openCommentPrompt(pane, branch)).toBe(true)
        const prompt = pane.openAnnotationPrompt!
        expect(prompt.spec).toMatchObject({
            kind: 'comment',
            title: `Comment at ${runTime(test)}`,
            text: '',
            pseudocodeFunction: MAIN
        })
        expect(prompt.multiline).toBe(true)
        prompt.input('the password matched')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            comments: { [`0x${test.toString(16)}`]: 'the password matched' }
        })
        const commented = await shownWith(pane, '/* the password matched */')
        const rows = commented.text.split('\n')
        const moved = lineWith(commented, 'if (iVar1 == 0)')
        expect(rows[moved - 1].trim()).toBe('/* the password matched */')
        //at the end of the test's line in the Listing beside it
        const listed = await listingRows(session, listingPane)
        expect(listed.find((row) => row.includes('test eax, eax'))).toMatch(
            / ; the password matched$/
        )
        //its own line edits it, and Delete comment takes it away
        expect(session.commentTargetAt(pane, moved - 1)).toEqual({ kind: 'comment', address: test })
        session.openCommentPrompt(pane, moved - 1)
        expect(pane.openAnnotationPrompt!.spec.text).toBe('the password matched')
        session.closeAnnotationPrompt(pane)
        expect(session.canDeleteCommentAt(pane, moved)).toBe(true)
        expect(session.canDeleteCommentAt(pane, moved - 1)).toBe(true)
        expect(session.deleteCommentAt(pane, moved - 1)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        await shownWith(pane, 'the password matched', true)
    })

    it('comments on the function from its declaration, or with Function comment… from any line', async () => {
        const { session, pane, listingPane, document } = await paired()
        const declaration = lineWith(document, 'undefined8 main(void)')
        expect(session.commentTargetAt(pane, declaration)).toMatchObject({
            kind: 'function comment',
            address: MAIN,
            function: { name: 'main' }
        })
        //Comment… is the function comment there, so no Function comment… beside it
        expect(session.commentTargetAt(pane, declaration, true)).toBeUndefined()
        //no comment on a brace, a declaration, the decompiler's warning or the header
        expect(session.commentTargetAt(pane, declaration + 1)).toBeUndefined()
        expect(session.commentTargetAt(pane, lineWith(document, 'int iVar1;'))).toBeUndefined()
        expect(session.commentTargetAt(pane, lineWith(document, 'WARNING'))).toBeUndefined()
        expect(session.commentTargetAt(pane, 0)).toBeUndefined()
        const strcmp = lineWith(document, 'strcmp(acStack_98')
        expect(session.commentTargetAt(pane, strcmp, true)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
        expect(session.commentTargetAt(pane, 0, true)?.kind).toBe('function comment')
        expect(session.openCommentPrompt(pane, strcmp, true)).toBe(true)
        expect(pane.openAnnotationPrompt!.spec.title).toBe('Comment on main')
        pane.openAnnotationPrompt!.input('Asks for the password\nand checks it')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            functionComments: { '0x11e9': 'Asks for the password\nand checks it' }
        })
        const commented = await shownWith(pane, 'Asks for the password')
        const first = lineWith(commented, 'Asks for the password')
        expect(first).toBeLessThan(lineWith(commented, 'undefined8 main(void)'))
        //each of its lines edits it
        expect(session.commentTargetAt(pane, first)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
        expect(session.commentTargetAt(pane, first + 1)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
        //above main's label in the Listing
        const listed = await listingRows(session, listingPane)
        const label = listed.indexOf('main:')
        expect(listed.slice(label - 2, label)).toEqual([
            '; Asks for the password',
            '; and checks it'
        ])
    })

    it('undoes and redoes renames and comments made there, the Pseudocode following', async () => {
        const { session, pane, document, listing } = await paired()
        const test = listing.lines.addresses[listingLine(listing, 'main', 'test eax, eax')]
        expect(session.canUndoAnnotation('crackme')).toBe(false)
        session.renameVariable('crackme', MAIN, 'stack:-0x98', 'password')
        session.setComment('crackme', test, 'matched')
        await shownWith(pane, '/* matched */')
        expect(session.annotatablePath(pane)).toBe('crackme')
        expect(session.canUndoAnnotation('crackme')).toBe(true)
        expect(session.undoAnnotation('crackme')).toBe(true)
        let shown = await shownWith(pane, '/* matched */', true)
        expect(shown.text).toContain('strcmp(password,')
        expect(session.undoAnnotation('crackme')).toBe(true)
        shown = await shownWith(pane, 'strcmp(acStack_98,')
        expect(shown.text).toBe(document.text)
        expect(session.canRedoAnnotation('crackme')).toBe(true)
        expect(session.redoAnnotation('crackme')).toBe(true)
        await shownWith(pane, 'strcmp(password,')
    })

    it('takes none in a read-only Workbench, nor in the Build output’s Pseudocode', async () => {
        const { session, pane, document } = await paired({ readonly: true })
        const name = at(document, 'iVar1 = strcmp(acStack_98', 'acStack_98')
        expect(session.annotatablePath(pane)).toBeUndefined()
        expect(session.canRenameAt(pane, name.line, name.column)).toBe(false)
        expect(session.commentTargetAt(pane, name.line)).toBeUndefined()
        expect(session.openRenamePrompt(pane, name.line, name.column)).toBe(false)
        expect(session.openCommentPrompt(pane, name.line)).toBe(false)

        const built = setup()
        built.emulator.buildOutput = {
            path: 'main',
            bytes: new Uint8Array(crackmeBytes),
            generation: 1,
            sources: { entry: 'crackme', files: {} }
        }
        flushSync()
        const output = show(built.session, 'main')
        built.session.decompile(output)
        flushSync()
        const decompiledOutput = await decompiled(output)
        const local = at(decompiledOutput, 'iVar1 = strcmp(acStack_98', 'acStack_98')
        expect(output.displayedBuildOutput).toBe(true)
        expect(built.session.annotatablePath(output)).toBeUndefined()
        expect(built.session.canRenameAt(output, local.line, local.column)).toBe(false)
    })

    it('is refused while a Build, a Run or the Testcases run, with the reason', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session, pane, document } = await paired()
        const name = at(document, 'iVar1 = strcmp(acStack_98', 'acStack_98')
        const branch = lineWith(document, 'if (iVar1 == 0)')
        session.building = true
        //offered, so the key says why
        expect(session.canRenameAt(pane, name.line, name.column)).toBe(true)
        expect(session.openRenamePrompt(pane, name.line, name.column)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Wait for the Build to finish, then try again.')
        session.building = false
        session.running = true
        expect(session.openCommentPrompt(pane, branch)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Pause the program to rename or comment.')
        session.running = false
        session.testing = true
        expect(session.renameVariable('crackme', MAIN, 'stack:-0x98', 'password')).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Wait for the Testcases to finish, then try again.')
        session.testing = false
        expect(session.project.files.crackme.annotations).toBeUndefined()
    })

    it('keeps the text, with no "Decompiling…" over it, until the function is decompiled again', async () => {
        const { session, pane, document, listing, hold } = await paired()
        const host = window.document.createElement('div')
        window.document.body.appendChild(host)
        const status = mount(PseudocodeStatus, {
            target: host,
            props: { group: pane, onRetry: () => {} }
        })
        disposers.push(() => unmount(status))
        const reveal = vi.spyOn(
            session as unknown as { revealPseudocodeLine: (group: EditorGroup) => Promise<void> },
            'revealPseudocodeLine'
        )
        const test = listing.lines.addresses[listingLine(listing, 'main', 'test eax, eax')]
        //a comment makes the Listing again, then decompiles main again
        const release = hold()
        session.setComment('crackme', test, 'matched')
        session.renameVariable('crackme', MAIN, 'stack:-0x98', 'password')
        //main's text is shown all along: the one before, then once decompiled with the comment
        //from the Listing it is shown beside until the new one is ready, then from that one
        const shown = () => {
            flushSync()
            const displayed = pane.displayedPseudocode
            expect(displayed?.status).toBe('ready')
            expect(displayed?.fn.address).toBe(MAIN)
            expect(pane.modelIdentity).toBeDefined()
            expect(pane.displayedCode).toBe(displayed!.text)
            expect(host.textContent).not.toContain('Decompiling')
        }
        flushSync()
        expect(pane.requestedPseudocode?.status).toBe('decompiling')
        expect(pane.displayedPseudocode).toBe(document)
        for (let step = 0; step < 20; step++) {
            await new Promise((resolve) => setTimeout(resolve, 10))
            shown()
            expect(session.listingFor(pane.sourceSelection)?.status).toBe('generating')
        }
        release()
        for (
            let attempt = 0;
            attempt < 500 && pane.displayedPseudocode?.listingDocument === document.listingDocument;
            attempt++
        ) {
            await new Promise((resolve) => setTimeout(resolve, 5))
            shown()
        }
        const commented = await shownWith(pane, '/* matched */')
        expect(commented.text).toContain('strcmp(password,')
        expect(pane.displayedCode).toBe(commented.text)
        //the editor keeps its place in it, rather than going to the Listing's cursor
        expect(reveal).not.toHaveBeenCalled()
        //another function is shown where the Listing's cursor is
        pane.followFunction(
            'crackme',
            listing.functions.find((fn) => fn.name === '_start')!.address
        )
        flushSync()
        await decompiled(pane)
        expect(reveal).toHaveBeenCalledOnce()
    })

    it('moves the cursor to the same place of the text decompiled again', async () => {
        const { session, pane, document, listing } = await paired()
        const test = listing.lines.addresses[listingLine(listing, 'main', 'test eax, eax')]
        session.setFunctionComment('crackme', MAIN, 'checks it')
        session.setComment('crackme', test, 'matched\non two lines')
        session.renameVariable('crackme', MAIN, 'stack:-0x98', 'pw')
        const after = await shownWith(pane, 'strcmp(pw,')
        const state = (line: number, column: number) =>
            ({
                cursorState: [
                    {
                        inSelectionMode: false,
                        selectionStart: { lineNumber: line + 1, column: column + 1 },
                        position: { lineNumber: line + 1, column: column + 1 }
                    }
                ],
                viewState: {
                    scrollLeft: 0,
                    firstPosition: { lineNumber: line + 1, column: 1 },
                    firstPositionDeltaTop: 0
                },
                contributionsState: {}
            }) as unknown as Parameters<typeof movePseudocodeViewState>[0]
        const moved = (line: number, column: number) => {
            const result = movePseudocodeViewState(state(line, column), document, after)
            return {
                line: result.cursorState[0].position.lineNumber - 1,
                column: result.cursorState[0].position.column - 1,
                first: result.viewState.firstPosition.lineNumber - 1
            }
        }
        //on the renamed name, three letters into it, which has two
        const name = at(document, 'iVar1 = strcmp(acStack_98', 'acStack_98', 3)
        const call = lineWith(after, 'iVar1 = strcmp(pw')
        expect(moved(name.line, name.column)).toEqual({
            line: call,
            column: after.text.split('\n')[call].indexOf('pw') + 2,
            first: call
        })
        //past a comment written above it, after the name
        const branch = at(document, 'if (iVar1 == 0)', '{', 0)
        expect(moved(branch.line, branch.column)).toMatchObject({
            line: lineWith(after, 'if (iVar1 == 0)'),
            column: branch.column
        })
        //the declaration below the function comment, and a brace with the line it follows
        const declaration = lineWith(document, 'undefined8 main(void)')
        expect(moved(declaration, 3).line).toBe(lineWith(after, 'undefined8 main(void)'))
        expect(moved(declaration + 1, 0).line).toBe(lineWith(after, 'undefined8 main(void)') + 1)
        //the header stays
        expect(moved(0, 4)).toEqual({ line: 0, column: 4, first: 0 })
    })

    it('renames a local of the Build’s Pseudocode during a paused Debug session', async () => {
        const { session } = setup()
        const pane = show(session, 'crackme')
        session.decompile(pane)
        flushSync()
        await decompiled(pane)
        await session.build()
        await tick()
        flushSync()
        expect(pane.sourceSelection).toMatchObject({ sourceKind: 'build' })
        const document = await decompiled(pane)
        const name = at(document, 'iVar1 = strcmp(acStack_98', 'acStack_98')
        expect(session.annotatablePath(pane)).toBe('crackme')
        expect(session.openRenamePrompt(pane, name.line, name.column)).toBe(true)
        pane.openAnnotationPrompt!.input('password')
        expect(session.saveAnnotationPrompt(pane)).toBe(true)
        //the Build's record keeps its bytes; the version shown has the live File's names
        expect(session.emulator.buildSources?.files.crackme.annotations).toBeUndefined()
        await shownWith(pane, 'strcmp(password,')
    })
})
