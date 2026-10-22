/**
 * The Search panel ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
 * decisions 23 to 29), in the side panel over crackme's and the decompiler package's FactCheck-like
 * C++ program's real Listings, their Pseudocode decompiled by the real decompiler and the search
 * run by the real search service, both on the test's thread, as jsdom has no Worker: the rail
 * entry and Ctrl+Shift+F, the query and its toggles and patterns, the "Look in" ticks, the results
 * and their counts, Show more, a regular expression's error and the time limit, the Pseudocode's
 * background batch with its progress, Cancel and Try again, a rename reaching the results, and a
 * row opening its File, Listing line or function at the match, in the Navigation history.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import type { AvailableLanguages, StoredProject } from '#lib/Project.svelte.ts'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { liveSource } from '#lib/monaco/projectSourceSelection.ts'
import type { ProjectModelIdentity } from '#lib/languages/service/uri.ts'
import type { SearchWorkerRequest, SearchWorkerResponse } from '#lib/projectSearch/protocol.ts'
import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import type { BuiltinPanelId, PanelAccess } from '#lib/workbench/hostApi.ts'
import { editorGroupsFixture } from '#lib/workbench/__fixtures__/editorGroups.svelte.ts'
import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
import { EXAM_PANEL_ACCESS } from '#cmp/specific/exam/examAccess.ts'
import WorkbenchPartHarness from './__fixtures__/WorkbenchPartHarness.svelte'
import type { RailEntry } from './workbenchContext'
import { workbenchRail } from './workbenchRail'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

/**
 * The run-time addresses the decompiler answers with the background lane's time limit, as it
 * does for a function past 5 seconds; the rest decompile for real. The package is told where its
 * files are: a DOM test's module URL is an http one, which the package would fetch them from.
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
                                      error: 'main took longer than 5 seconds to decompile'
                                  }
                                : program.decompile(address, decompileOptions)
                    }
                }
            }
        }
    }
})

//jsdom has no Worker: the Pseudocode worker's service runs on the test's thread
vi.mock('../../../lib/pseudocode/pseudocode.worker?worker', async () => ({
    default: (await import('#lib/pseudocode/inThreadWorker.ts')).InThreadWorker
}))

/**
 * The search worker's service on the test's thread; a search for `(a+)+$` never ends, as a worker
 * stuck in a regular expression that backtracks: it says it began, then answers nothing.
 */
vi.mock('../../../lib/projectSearch/search.worker?worker', async () => {
    const { InThreadSearchWorker } = await import('#lib/projectSearch/inThreadSearchWorker.ts')
    class StuckOnBacktracking extends InThreadSearchWorker {
        private stuck = false
        postMessage(request: SearchWorkerRequest): void {
            if (this.stuck) return
            if (request.type === 'search' && request.query.text === '(a+)+$') {
                this.stuck = true
                const started: SearchWorkerResponse = { type: 'started', search: request.search }
                queueMicrotask(() =>
                    this.dispatchEvent(new MessageEvent('message', { data: started }))
                )
                return
            }
            super.postMessage(request)
        }
    }
    return { default: StuckOnBacktracking }
})

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')
const factcheck = readFileSync('../decompiler/js/tests/fixtures/elf/factcheck').toString('base64')
/** crackme's `main`, link-time, and its load base, a PIE's planned one. */
const MAIN = 0x11e9
const BASE = 0x555555554000

let decoder: ListingDecoder
let demangler: Demangler
beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
    //the mock's factory settled before any test asks for the package: an import made while it
    //still runs, by a session the test before left loading the decompiler, could get the real one
    await import('@specy/decompiler')
    HTMLElement.prototype.scrollIntoView ??= () => {}
    HTMLElement.prototype.showPopover ??= function () {}
})

//the real decompiler and Listings, on the test's thread
vi.setConfig({ testTimeout: 30_000 })

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    slow.clear()
    for (const kind of ['files', 'listings', 'pseudocode'] as const)
        workbenchLayout.setSearchLookIn(kind, true)
    vi.restoreAllMocks()
})

const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    { id: 'explorer', title: 'Explorer', icon, group: 'top', maximizable: false, access: 'on' },
    { id: 'search', title: 'Search', icon, group: 'top', maximizable: true, access: 'on' }
]

/** Waits for a condition, letting effects run between tries. */
async function until(condition: () => boolean, timeout = 20_000) {
    const end = Date.now() + timeout
    for (;;) {
        flushSync()
        if (condition()) return
        if (Date.now() > end) throw new Error('timed out waiting')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

/** The models and editors the panes would mount, as far as a reveal reads them. */
function editorsFor(session: WorkbenchSession) {
    type Selection = {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
    }
    type FakeEditor = {
        key: string
        value: string
        revealed: number[]
        selections: Selection[]
        position: { lineNumber: number; column: number }
    }
    const monaco = {
        Uri: {
            from: (parts: {
                scheme: string
                authority: string
                path: string
                fragment?: string
            }) => ({
                ...parts,
                toString: () =>
                    `${parts.scheme}://${parts.authority}${parts.path}${parts.fragment ? `#${parts.fragment}` : ''}`
            })
        },
        editor: {
            createModel: (text: string, language: string, uri: unknown) => {
                let value = text
                let disposed = false
                return {
                    uri,
                    getValue: () => value,
                    setValue: (next: string) => (value = next),
                    setEOL: () => {},
                    onDidChangeContent: () => ({ dispose() {} }),
                    getLanguageId: () => language,
                    isDisposed: () => disposed,
                    dispose: () => (disposed = true),
                    getLineCount: () => value.split('\n').length
                }
            },
            setModelLanguage: () => {}
        }
    } as unknown as MonacoType
    const editors = new Map<EditorGroup, FakeEditor>()
    const attach = () => {
        for (const group of session.groups) {
            const identity = group.modelIdentity as ProjectModelIdentity | undefined
            if (!identity) continue
            const key = group.modelKey
            const value = group.displayedCode
            const shown = editors.get(group)
            if (shown?.key === key && shown.value === value) continue
            const model = session.models.resolve(
                monaco,
                {
                    key,
                    value,
                    identity,
                    generatedFrom: group.displayedListing ?? group.displayedPseudocode
                },
                'plaintext'
            )
            const editor: FakeEditor = {
                key,
                value,
                revealed: [],
                selections: [],
                position: { lineNumber: 1, column: 1 }
            }
            editors.set(group, editor)
            group.editor = {
                getModel: () => model,
                revealLineInCenter: (line: number) => editor.revealed.push(line),
                setPosition: (position: { lineNumber: number; column: number }) => {
                    editor.position = position
                    session.cursorMoved(group, position.lineNumber - 1)
                },
                setSelection: (selection: Selection) => editor.selections.push(selection),
                revealRangeInCenterIfOutsideViewport: () => {},
                getPosition: () => editor.position,
                getSelection: () => null,
                hasTextFocus: () => false,
                getVisibleRanges: () => [],
                focus: () => {}
            } as unknown as typeof group.editor
        }
    }
    const timer = setInterval(attach, 5)
    disposers.push(() => clearInterval(timer))
    return {
        of: (group: EditorGroup) => editors.get(group),
        /** The text a pane's editor shows on a 1-based line. */
        line: (group: EditorGroup, lineNumber: number) =>
            editors.get(group)?.value.split('\n')[lineNumber - 1]
    }
}

/**
 * The side panel showing Search, over crackme beside two text Files, or over other Files; on a
 * phone with `phone`.
 */
function searchPanel(
    data: StoredProject = {},
    {
        language = 'X86',
        phone = false,
        open = true
    }: { language?: AvailableLanguages; phone?: boolean; open?: boolean } = {}
) {
    const fixture = editorGroupsFixture(language, {
        entry: 'crackme',
        files: {
            crackme: { encoding: 'base64', content: crackme },
            'notes.txt': { encoding: 'plain', content: 'the password is hunter2\nnot Hunter2' },
            'src/main.c': {
                encoding: 'plain',
                content: '#include <stdio.h>\nint main(void) { puts("hunter2"); }\n'
            }
        },
        ...data
    })
    const generated: string[] = []
    fixture.emulator.listings = new ListingDocuments(async (order) => {
        generated.push(order.name)
        //as the Listing worker makes it, which loads the demangler for a C++ program
        return generateListing(decoder, { ...order, version: 'v1', demangler })
    })
    const viewport = $state({
        deviceClass: (phone ? 'phone' : 'desktop') as 'phone' | 'desktop',
        canHover: !phone
    })
    let active = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => active, set: (id) => (active = id) })
    //as the Workbench's shell gives the session its panels
    fixture.session.panels = { searchProject: (query) => ui.searchProject(query) }
    if (open) ui.open('search')
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session: fixture.session, ui, rail, part: 'side-panel' }
    })
    flushSync()
    disposers.push(() => {
        unmount(app)
        fixture.dispose()
    })
    const query = () => target.querySelector<HTMLInputElement>('input[aria-label="Search"]')!
    const type = (text: string, input = query()) => {
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
    }
    const toggle = (label: string) => {
        target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
        flushSync()
    }
    const tick = (label: string) => {
        const box = [...target.querySelectorAll<HTMLLabelElement>('.look-in label')]
            .find((item) => item.textContent?.trim() === label)!
            .querySelector('input')!
        box.click()
        flushSync()
    }
    const summary = () => target.querySelector('.summary')?.textContent?.trim() ?? ''
    /** Each group's header: its name, its view and its count. */
    const groups = () =>
        [...target.querySelectorAll<HTMLElement>('.item.group')].map((item) =>
            [
                item.querySelector('.group-name')!.textContent!.trim(),
                item.querySelector('.view-tag')?.textContent?.trim() ?? 'File',
                Number(item.querySelector('.count-badge')!.textContent!.replace(/,/g, ''))
            ].join(' ')
        )
    const rows = () => [...target.querySelectorAll<HTMLElement>('.item.row')]
    const rowTexts = () => rows().map((row) => row.querySelector('.row-text')!.textContent!.trim())
    const functions = () =>
        [...target.querySelectorAll<HTMLElement>('.item.function .function-name')].map((item) =>
            item.textContent!.trim()
        )
    /** Waits for the search to be done with the current query. */
    const searched = () =>
        until(() => {
            const status = fixture.session.projectSearch.status
            return status !== 'searching' && status !== 'idle'
        })
    return {
        ...fixture,
        ui,
        target,
        generated,
        query,
        type,
        toggle,
        tick,
        summary,
        groups,
        rows,
        rowTexts,
        functions,
        searched
    }
}

describe('the rail and the shortcut', () => {
    const options = {
        symbolsOffered: false,
        hostPanels: [],
        hostLinks: []
    }
    const ids = (access: Partial<Record<BuiltinPanelId, PanelAccess>> = {}, symbols = false) =>
        workbenchRail({ ...options, access, symbolsOffered: symbols }).map((entry) => entry.id)

    it('offers Search after Symbols and before Testcases, in every Target, maximizable', () => {
        expect(ids({}, true)).toEqual([
            'explorer',
            'symbols',
            'search',
            'testcases',
            'documentation',
            'agent',
            'settings'
        ])
        expect(ids()).toContain('search')
        const entry = workbenchRail({ ...options, access: {} }).find(
            (item) => item.id === 'search'
        )!
        expect(entry.title).toBe('Search')
        expect(entry.maximizable).toBe(true)
    })

    it('leaves it out where a host switches it off, as an Exam does with the Explorer', () => {
        expect(ids({ search: 'off' })).not.toContain('search')
        expect(EXAM_PANEL_ACCESS.search).toBe('off')
        expect(EXAM_PANEL_ACCESS.explorer).toBe('off')
        expect(ids(EXAM_PANEL_ACCESS)).not.toContain('search')
    })

    it('opens on Ctrl+Shift+F with the query focused and filled with the selection', async () => {
        const view = searchPanel({}, { open: false })
        const group = view.session.groups[0]
        //a selection on one line, in the editor that has the keyboard
        group.editor = {
            hasTextFocus: () => true,
            getSelection: () => ({
                isEmpty: () => false,
                startLineNumber: 3,
                endLineNumber: 3
            }),
            getModel: () => ({ getValueInRange: () => 'hunter2' })
        } as unknown as typeof group.editor
        const event = new KeyboardEvent('keydown', {
            code: 'KeyF',
            key: 'F',
            ctrlKey: true,
            shiftKey: true,
            cancelable: true
        })
        ;(view.session as unknown as { handleCommandKey(e: KeyboardEvent): void }).handleCommandKey(
            event
        )
        flushSync()
        //the browser's own use of the key is held back
        expect(event.defaultPrevented).toBe(true)
        expect(view.ui.activePanel).toBe('search')
        await until(() => document.activeElement === view.query())
        expect(view.query().value).toBe('hunter2')
        await view.searched()
        expect(view.groups()).toContain('notes.txt File 2')
        //a selection over two lines fills nothing, and the query typed stays
        group.editor = {
            hasTextFocus: () => true,
            getSelection: () => ({ isEmpty: () => false, startLineNumber: 3, endLineNumber: 4 }),
            getModel: () => ({ getValueInRange: () => 'a\nb' })
        } as unknown as typeof group.editor
        ;(view.session as unknown as { handleCommandKey(e: KeyboardEvent): void }).handleCommandKey(
            new KeyboardEvent('keydown', { code: 'KeyF', ctrlKey: true, shiftKey: true })
        )
        flushSync()
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(view.query().value).toBe('hunter2')
    })
})

describe('searching', () => {
    it('finds a query in the text Files, the Listing and the Pseudocode, grouped and counted', async () => {
        const view = searchPanel()
        view.type('hunter2')
        await until(
            () =>
                view.groups().some((group) => group.includes('Listing')) &&
                view.groups().some((group) => group.includes('Pseudocode'))
        )
        await view.searched()
        //in any case: `Hunter2` too
        expect(view.groups()).toEqual([
            'crackme Listing 4',
            'crackme Pseudocode 1',
            'notes.txt File 2',
            'main.c File 1'
        ])
        expect(view.functions()).toEqual(['main'])
        expect(view.rowTexts()).toContain('the password is hunter2')
        expect(view.rowTexts().some((text) => text.includes('strcmp('))).toBe(true)
        expect(view.summary()).toBe('8 matches in 3 Files')
        //each match marked
        const marks = [...view.target.querySelectorAll('.item.row mark')].map(
            (mark) => mark.textContent
        )
        expect(marks.every((mark) => mark?.toLowerCase() === 'hunter2')).toBe(true)
    })

    it('takes Match case, Match whole word and a regular expression', async () => {
        const view = searchPanel()
        view.tick('Listings')
        view.tick('Pseudocode')
        view.type('Hunter2')
        await view.searched()
        expect(view.groups()).toEqual(['notes.txt File 2', 'main.c File 1'])
        view.toggle('Match case')
        expect(
            view.target
                .querySelector('button[aria-label="Match case"]')!
                .getAttribute('aria-pressed')
        ).toBe('true')
        await view.searched()
        expect(view.rowTexts()).toEqual(['not Hunter2'])
        view.toggle('Match case')
        view.type('hunter')
        await view.searched()
        expect(view.summary()).toBe('3 matches in 2 Files')
        view.toggle('Match whole word')
        await view.searched()
        expect(view.summary()).toBe('No results found.')
        view.toggle('Match whole word')
        view.toggle('Use regular expression')
        view.type('pass\\w+|not')
        await view.searched()
        expect(view.rowTexts()).toEqual(['the password is hunter2', 'not Hunter2'])
        //Alt+R in the query box switches the regular expression off again
        view.query().dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', altKey: true, bubbles: true })
        )
        flushSync()
        expect(view.session.projectSearch.regex).toBe(false)
        await view.searched()
        expect(view.summary()).toBe('No results found.')
    })

    it('looks in the Files the patterns include and do not exclude', async () => {
        const view = searchPanel()
        view.type('hunter2')
        await until(() => view.groups().some((group) => group.includes('Pseudocode')))
        await view.searched()
        view.target.querySelector<HTMLButtonElement>('button.details')!.click()
        flushSync()
        const include = view.target.querySelectorAll<HTMLInputElement>('.pattern input')[0]
        const exclude = view.target.querySelectorAll<HTMLInputElement>('.pattern input')[1]
        view.type('*.txt, src/**', include)
        await view.searched()
        expect(view.groups()).toEqual(['notes.txt File 2', 'main.c File 1'])
        view.type('', include)
        //a pattern with no slash matches a name in any folder; an Executable's Listing and
        //Pseudocode go by its path
        view.type('main.c, crackme', exclude)
        await view.searched()
        expect(view.groups()).toEqual(['notes.txt File 2'])
    })

    it('keeps the Look in ticks with the layout, for the next panel', async () => {
        const view = searchPanel()
        const ticks = () =>
            [...view.target.querySelectorAll<HTMLLabelElement>('.look-in label')].map(
                (label) => `${label.textContent!.trim()} ${label.querySelector('input')!.checked}`
            )
        expect(ticks()).toEqual(['Files true', 'Listings true', 'Pseudocode true'])
        view.tick('Files')
        view.tick('Pseudocode')
        view.type('hunter2')
        await until(() => view.groups().length > 0)
        await view.searched()
        expect(view.groups()).toEqual(['crackme Listing 4'])
        expect(workbenchLayout.values.searchLookIn).toEqual({
            files: false,
            listings: true,
            pseudocode: false
        })
        const next = searchPanel()
        expect(
            [...next.target.querySelectorAll<HTMLLabelElement>('.look-in label')].map(
                (label) => label.querySelector('input')!.checked
            )
        ).toEqual([false, true, false])
        //and nothing is searched with nothing ticked
        next.tick('Listings')
        expect(next.target.querySelector('.note')?.textContent).toContain('Tick a place')
    })

    it('offers no Look in without an Executable, in any Target', async () => {
        const view = searchPanel(
            {
                entry: 'main.s',
                files: {
                    'main.s': { encoding: 'plain', content: 'li a0, 1\nli a7, 93\necall' },
                    'README.md': { encoding: 'plain', content: '# Exit\nCalls ecall 93.' }
                }
            },
            { language: 'RISC-V' }
        )
        expect(view.target.querySelector('.look-in')).toBeNull()
        view.type('ecall')
        await view.searched()
        expect(view.groups()).toEqual(['main.s File 1', 'README.md File 1'])
    })

    it('lists 2,000 rows and the count of the rest, and Show more lists them', async () => {
        const lines = Array.from({ length: 2_500 }, (_, index) => `match ${index}`).join('\n')
        const view = searchPanel({
            entry: 'many.txt',
            files: { 'many.txt': { encoding: 'plain', content: lines } }
        })
        view.type('match')
        await view.searched()
        expect(view.summary()).toBe('2,500 matches in 1 File')
        expect(view.rows()).toHaveLength(2_000)
        const more = view.target.querySelector('.more')!
        expect(more.textContent).toContain('500 more lines not shown')
        more.querySelector('button')!.click()
        flushSync()
        await until(() => view.rows().length === 2_500)
        expect(view.target.querySelector('.more')).toBeNull()
    })

    it('says why a regular expression cannot be searched, and when one takes too long', async () => {
        const view = searchPanel()
        view.toggle('Use regular expression')
        view.type('hunter(')
        await until(() => view.session.projectSearch.status === 'invalid')
        const problem = view.target.querySelector('.problem')!
        expect(problem.textContent).toMatch(/^Not a valid regular expression: .+\.$/)
        expect(view.query().getAttribute('aria-invalid')).toBe('true')
        expect(view.query().getAttribute('aria-describedby')).toBe(problem.id)
        expect(view.rows()).toHaveLength(0)
        //a pattern that backtracks: the search worker is ended past the time limit
        view.type('(a+)+$')
        await until(() => view.session.projectSearch.status === 'timedOut', 6_000)
        expect(view.summary()).toBe('The search took too long.')
        //and a new query starts a new worker
        view.type('hunter2')
        await view.searched()
        expect(view.session.projectSearch.status).toBe('complete')
        expect(view.summary()).toMatch(/matches in/)
    })
})

describe('the Pseudocode in the background', () => {
    it('decompiles while the panel is shown, with progress and Cancel, and resumes', async () => {
        const view = searchPanel({
            entry: 'factcheck',
            files: { factcheck: { encoding: 'base64', content: factcheck } }
        })
        const lane = () => view.target.querySelector('.lanes')?.textContent ?? ''
        const button = (label: string) =>
            [...view.target.querySelectorAll<HTMLButtonElement>('.lane button')].find(
                (item) => item.textContent?.trim() === label
            )
        const progress = () => view.session.projectSearch.progress.factcheck
        //every function but the PLT stubs, while the decompiler loads for the first
        await until(() => /Decompiling \d+ of 290 functions of factcheck/.test(lane()))
        expect(view.target.querySelector<HTMLProgressElement>('.lane progress')!.max).toBe(290)
        expect(view.target.querySelector('.announcement')?.textContent).toBe(
            'Decompiling the functions of factcheck.'
        )
        button('Cancel')!.click()
        flushSync()
        await until(() => !progress().running)
        const stopped = progress().done
        expect(stopped).toBeLessThan(290)
        expect(lane()).toContain(`Decompiled ${stopped} of 290 functions of factcheck`)
        expect(view.target.querySelector('.announcement')?.textContent).toBe(
            'Stopped decompiling the functions of factcheck.'
        )
        //it stays stopped as the query changes
        view.type('main')
        await view.searched()
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(progress().done).toBe(stopped)
        expect(progress().running).toBe(false)
        //Resume carries on from there, and what it decompiles is searched as it comes
        button('Resume')!.click()
        flushSync()
        await until(() => progress().done === 290 && !progress().running)
        await until(() => view.groups().some((group) => group.startsWith('factcheck Pseudocode')))
        expect(view.target.querySelectorAll('.lane')).toHaveLength(0)
        expect(view.target.querySelector('.announcement')?.textContent).toBe(
            'Decompiled the functions of factcheck.'
        )
        expect(view.functions()).toContain('main')
        //unticking Pseudocode takes its results away, keeping what was decompiled
        view.tick('Pseudocode')
        await until(() => !view.groups().some((group) => group.includes('Pseudocode')))
        expect(view.session.pseudocode.search.entries('factcheck')).toHaveLength(290)
    })

    it('lists a function past the time limit as not searched, with Try again', async () => {
        slow.add(MAIN + BASE)
        const view = searchPanel()
        await until(() => view.session.projectSearch.progress.crackme?.failures.length === 1)
        await until(() => !view.session.projectSearch.progress.crackme.running)
        const failures = view.target.querySelector('.failures')!
        expect(failures.querySelector('summary')!.textContent).toContain(
            '1 function of crackme not searched'
        )
        expect(failures.querySelector('.failure-name')!.textContent).toBe('main')
        view.type('hunter2')
        await view.searched()
        expect(view.groups().some((group) => group.includes('Pseudocode'))).toBe(false)
        slow.clear()
        failures.querySelector<HTMLButtonElement>('button[aria-label="Try main again"]')!.click()
        flushSync()
        await until(() => view.groups().some((group) => group.includes('Pseudocode')))
        expect(view.target.querySelector('.failures')).toBeNull()
    })

    it('waits for a query before decompiling an Executable of over 1,000 functions', async () => {
        const view = searchPanel()
        //as if crackme had as many functions as a static program
        const { progress } = view.session.pseudocode.search
        vi.spyOn(view.session.pseudocode.search, 'progress').mockImplementation((path) => {
            const real = progress.call(view.session.pseudocode.search, path)
            return real && { ...real, total: 1_089 }
        })
        const start = vi.spyOn(view.session.pseudocode.search, 'start')
        await until(() => view.session.projectSearch.listings[0]?.status === 'ready')
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(start).not.toHaveBeenCalled()
        view.type('hunter2')
        await until(() => start.mock.calls.length === 1)
    })
})

describe('the results kept up to date', () => {
    it('finds a global renamed since, in the Listing and the Pseudocode', async () => {
        const view = searchPanel()
        view.type('check_password')
        await until(() => view.session.pseudocode.search.entries('crackme').length === 8)
        await view.searched()
        expect(view.summary()).toBe('No results found.')
        view.session.renameLabel('crackme', MAIN, 'check_password')
        await until(() => view.groups().some((group) => group.includes('Pseudocode')))
        await until(() => view.groups().some((group) => group.includes('Listing')))
        //`main` itself, and `_start`, which passes it to `__libc_start_main`
        expect(view.functions()).toEqual(['_start', 'check_password'])
        expect(view.rowTexts()).toContain('check_password:')
        //a text File edited is searched again too
        view.project.fileSystem.writeText('notes.txt', 'call check_password')
        await until(() => view.groups().includes('notes.txt File 1'))
    })

    it('drops a deleted File and follows a renamed one', async () => {
        const view = searchPanel()
        view.type('hunter2')
        await until(() => view.groups().some((group) => group.includes('Pseudocode')))
        await view.searched()
        view.project.fileSystem.rename('crackme', 'bin/crackme')
        view.session.fileRenamed('crackme', 'bin/crackme')
        const folders = () =>
            [...view.target.querySelectorAll('.item.group .folder')].map((item) =>
                item.textContent!.trim()
            )
        await until(() => folders()[0] === 'bin' && folders()[1] === 'bin')
        expect(view.groups()).toEqual([
            'crackme Listing 4',
            'crackme Pseudocode 1',
            'notes.txt File 2',
            'main.c File 1'
        ])
        view.project.fileSystem.remove('notes.txt')
        view.session.fileDeleted('notes.txt')
        await until(() => !view.groups().some((group) => group.startsWith('notes.txt')))
    })
})

describe('opening a result', () => {
    it('opens a text File with the match selected', async () => {
        const view = searchPanel()
        const editors = editorsFor(view.session)
        view.type('hunter2')
        await view.searched()
        const row = view.rows().find((item) => item.textContent?.includes('not Hunter2'))!
        row.click()
        const group = view.session.groups[0]
        await until(() => (editors.of(group)?.selections.length ?? 0) > 0)
        expect(group.displayedPath).toBe('notes.txt')
        expect(editors.of(group)!.selections.at(-1)).toEqual({
            startLineNumber: 2,
            startColumn: 5,
            endLineNumber: 2,
            endColumn: 12
        })
        expect(row.classList.contains('opened')).toBe(true)
        //the pane left crackme's Listing, the Entry it opened on, which Back returns to
        expect(group.history.canGoBack).toBe(true)
        expect(await view.session.goBack(group)).toBe(true)
        expect(group.displayedPath).toBe('crackme')
    })

    it("opens a Listing line found by its address, and the place left goes into the pane's history", async () => {
        const view = searchPanel()
        const editors = editorsFor(view.session)
        const group = view.session.groups[0]
        view.session.selectFile('crackme')
        await until(() => editors.of(group)?.key.includes('listing') === true)
        view.session.cursorMoved(group, 10)
        view.type('hunter2')
        await until(() => view.groups().some((item) => item.includes('Pseudocode')))
        await view.searched()
        const row = view.rows().find((item) => item.textContent?.includes('lea rdx'))!
        //a comment added above the line since: the line moved, its address did not
        const listing = view.session.listingFor(liveSource('crackme'))!.listing!
        const line = listing.text
            .split('\n')
            .findIndex((text) => text.includes('lea rdx, [rel s_hunter2]'))
        row.click()
        const selection = () => editors.of(group)?.selections.at(-1)
        await until(() => selection() !== undefined)
        expect(selection()).toEqual({
            startLineNumber: line + 1,
            startColumn: 21,
            endLineNumber: line + 1,
            endColumn: 28
        })
        expect(editors.line(group, line + 1)).toContain('lea rdx, [rel s_hunter2]')
        expect(group.history.canGoBack).toBe(true)
        expect(await view.session.goBack(group)).toBe(true)
        expect(group.cursorLine).toBe(10)
    })

    it('finds a Listing line again after a comment moved it', async () => {
        const view = searchPanel()
        const editors = editorsFor(view.session)
        const group = view.session.groups[0]
        view.type('hunter2')
        await until(() => view.groups().some((item) => item.includes('Listing')))
        await view.searched()
        const before = view.session.listingFor(liveSource('crackme'))!.listing!
        //the search's results are of this Listing; a comment above main moves every line below
        view.session.setFunctionComment('crackme', MAIN, 'one\ntwo\nthree')
        const row = view.rows().find((item) => item.textContent?.includes('lea rdx'))!
        row.click()
        await until(() => (editors.of(group)?.selections.length ?? 0) > 0)
        const after = view.session.listingFor(liveSource('crackme'))!.listing!
        expect(after).not.toBe(before)
        const line = after.text
            .split('\n')
            .findIndex((text) => text.includes('lea rdx, [rel s_hunter2]'))
        expect(editors.of(group)!.selections.at(-1)!.startLineNumber).toBe(line + 1)
    })

    it('opens a function in the Decompile view at the match, its Listing beside it', async () => {
        const view = searchPanel()
        const searched = view
        const editors = editorsFor(view.session)
        view.type('hunter2')
        await until(() => view.groups().some((item) => item.includes('Pseudocode')))
        await view.searched()
        const row = view.rows().find((item) => item.textContent?.includes('strcmp('))!
        row.click()
        //the Listing opens on the left, as Decompile lays them out
        const pane = (view: 'listing' | 'pseudocode') =>
            searched.session.groups.find((group) => group.displayedView === view)!
        await until(() => (editors.of(pane('pseudocode'))?.selections.length ?? 0) > 0)
        const [pseudocode, listing] = [pane('pseudocode'), () => pane('listing')]
        expect(pseudocode.displayedView).toBe('pseudocode')
        expect(pseudocode.pseudocodeFunction?.address).toBe(MAIN)
        const selected = editors.of(pseudocode)!.selections.at(-1)!
        //the pane's header comes before the decompiler's line 21
        expect(selected.startLineNumber).toBe(23)
        expect(
            editors
                .line(pseudocode, selected.startLineNumber)!
                .slice(selected.startColumn - 1, selected.endColumn - 1)
        ).toBe('hunter2')
        await until(() => listing()?.displayedView === 'listing')
        await until(() => (editors.of(listing())?.revealed.length ?? 0) > 0)
        //at the first instruction of the statement, which loads the password's address
        expect(editors.line(listing(), editors.of(listing())!.revealed.at(-1)!)).toBe(
            '    lea rax, [rbp-0x90]'
        )
        //the pane left crackme's Listing, which Back returns to
        expect(await view.session.goBack(pseudocode)).toBe(true)
        expect(pseudocode.displayedView).toBe('listing')
    })

    it("closes a phone's drawer once a result is open", async () => {
        const view = searchPanel({}, { phone: true })
        view.ui.drawerOpen = true
        flushSync()
        editorsFor(view.session)
        view.type('hunter2')
        await view.searched()
        view.rows()
            .find((item) => item.textContent?.includes('not Hunter2'))!
            .click()
        await until(() => !view.ui.drawerOpen)
        expect(view.session.groups[0].displayedPath).toBe('notes.txt')
    })

    it('moves through the results with the keyboard', async () => {
        const view = searchPanel()
        editorsFor(view.session)
        view.tick('Listings')
        view.tick('Pseudocode')
        view.type('hunter2')
        await view.searched()
        const items = () => [...view.target.querySelectorAll<HTMLElement>('[role="treeitem"]')]
        const press = (key: string) => {
            ;(document.activeElement as HTMLElement).dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
            )
            flushSync()
        }
        const focused = () => (document.activeElement as HTMLElement).getAttribute('aria-label')
        view.query().focus()
        press('ArrowDown')
        await until(() => focused()?.startsWith('notes.txt') === true)
        expect(items()[0].getAttribute('aria-expanded')).toBe('true')
        press('ArrowLeft')
        expect(items()[0].getAttribute('aria-expanded')).toBe('false')
        //the File's row folded away, main.c's group and row left
        expect(items()).toHaveLength(3)
        press('ArrowRight')
        press('ArrowRight')
        await until(() => focused()?.startsWith('Line 1:') === true)
        press('End')
        await until(() => focused()?.startsWith('Line 2:') === true)
        press('Home')
        await until(() => focused()?.startsWith('notes.txt') === true)
        press('ArrowUp')
        expect(document.activeElement).toBe(view.query())
        //Enter in the box opens the first result
        press('Enter')
        await until(() => view.session.groups[0].displayedPath === 'notes.txt')
    })
})
