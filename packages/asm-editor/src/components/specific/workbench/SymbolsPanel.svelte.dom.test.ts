/**
 * The Symbols panel
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision
 * 18), in the side panel over crackme's real Listing: what it lists and of which File,
 * its filter and its switch, its loading state, and the line a row reveals; and the C++ names of
 * the x86 Core's `cpp` fixture ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md),
 * decision 11).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount, type Component } from 'svelte'
import type { StoredProject } from '#lib/Project.svelte.ts'
import { hasExecutable } from '#lib/executables.ts'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import type { Listing } from '#lib/listing/listing.ts'
import type { ListingOrder } from '#lib/listing/listingClient.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { liveSource } from '#lib/monaco/projectSourceSelection.ts'
import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { editorGroupsFixture } from '#lib/workbench/__fixtures__/editorGroups.svelte.ts'
import WorkbenchPartHarness from './__fixtures__/WorkbenchPartHarness.svelte'
import type { RailEntry } from './workbenchContext'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')
const cpp = readFileSync('../x86/blink-js/tests/fixtures/elf/cpp').toString('base64')

let decoder: ListingDecoder
let demangler: Demangler
beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
    HTMLElement.prototype.scrollIntoView ??= () => {}
    HTMLElement.prototype.showPopover ??= function () {}
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    { id: 'explorer', title: 'Explorer', icon, group: 'top', maximizable: false, access: 'on' },
    { id: 'symbols', title: 'Symbols', icon, group: 'top', maximizable: false, access: 'on' }
]

/**
 * The side panel showing Symbols, over crackme, the Entry, beside a text File. With `hold`, the
 * Listing is generated only when `release` is called.
 */
function symbolsPanel(
    data: StoredProject = {},
    { hold = false, readonly = false, touch = false } = {}
) {
    const fixture = editorGroupsFixture(
        'X86',
        {
            entry: 'crackme',
            files: {
                crackme: { encoding: 'base64', content: crackme },
                'notes.txt': { encoding: 'plain', content: 'password?' }
            },
            ...data
        },
        { readonly }
    )
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const generate = async (order: ListingOrder) => {
        order.onProgress?.(0.4)
        if (hold) await held
        //as the Listing worker makes it, which loads the demangler for a C++ program
        return generateListing(decoder, { ...order, version: 'v1', demangler })
    }
    fixture.emulator.listings = new ListingDocuments(generate)
    const viewport = $state({ deviceClass: 'desktop' as const, canHover: !touch })
    let active = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => active, set: (id) => (active = id) })
    ui.open('symbols')
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
    const panel = () => target.querySelector<HTMLElement>('.symbols')!
    const rows = () => [...target.querySelectorAll<HTMLButtonElement>('button.symbol-row')]
    const rowTexts = () =>
        rows().map((row) =>
            [...row.querySelectorAll('span')].map((span) => span.textContent!.trim())
        )
    const filterInput = () => target.querySelector<HTMLInputElement>('.filter input')!
    const typeFilter = (text: string) => {
        filterInput().value = text
        filterInput().dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
    }
    const pick = (label: string) => {
        target
            .querySelector<HTMLButtonElement>(
                `[role="group"][aria-label="Symbols to list"] button[aria-label="${label}"]`
            )!
            .click()
        flushSync()
    }
    /** The Listing the panel reads, once generated. */
    const listed = async (path = 'crackme'): Promise<Listing> => {
        const document = fixture.session.listingFor(liveSource(path))!
        const listing = await document.ready
        flushSync()
        return listing
    }
    return {
        ...fixture,
        ui,
        target,
        panel,
        rows,
        rowTexts,
        filterInput,
        typeFilter,
        pick,
        listed,
        release
    }
}

function show(session: WorkbenchSession, path: string, group: EditorGroup = session.groups[0]) {
    session.selectFile(path, group)
    session.focusEditorGroup(group)
    flushSync()
    return group
}

/**
 * A pane's editor as far as a reveal reads it: holding the Listing's model once the pane shows the
 * Listing, and moving its cursor as the real one does, which the session hears as the Editor's
 * cursor event. Records the Monaco lines revealed.
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
            getLineCount: () => pane.displayedListing?.listing?.text.split('\n').length ?? 0
        }),
        revealLineInCenter: (line: number) => revealed.push(line),
        setPosition: ({ lineNumber }: { lineNumber: number }) =>
            session.cursorMoved(pane, lineNumber - 1),
        focus: () => {}
    } as unknown as typeof pane.editor
    return revealed
}

async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        flushSync()
    }
    expect(condition()).toBe(true)
}

describe('the rail entry', () => {
    it('is offered only in a Project that has an Executable', () => {
        expect(hasExecutable({ crackme: { encoding: 'base64', content: crackme } })).toBe(true)
        expect(
            hasExecutable({
                'main.s': { encoding: 'plain', content: 'nop' },
                'data.bin': { encoding: 'base64', content: 'AAECAw==' }
            })
        ).toBe(false)
    })
})

describe('the Symbols panel', () => {
    it('names its File and lists its functions, then its strings', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        await view.listed()
        expect(view.panel().querySelector('.symbols-file')?.textContent?.trim()).toBe('crackme')
        expect(view.panel().querySelector('.count')?.textContent?.trim()).toBe('22 functions')
        const functions = view.rowTexts()
        expect(functions).toHaveLength(22)
        expect(functions[0]).toEqual(['_init', '0x555555555000', '27 B'])
        expect(functions).toContainEqual(['main', '0x5555555551e9', '210 B'])
        expect(view.rows()[0].title).toBe('_init at 0x555555555000, 27 bytes')

        view.pick('Strings')
        expect(view.panel().querySelector('.count')?.textContent?.trim()).toBe('6 strings')
        expect(view.rowTexts()).toContainEqual(['"hunter2"', '0x555555556017'])
        //a newline as C writes it, so the row stays one line
        expect(view.rowTexts()).toContainEqual(['"\\n"', '0x555555556015'])
        expect(view.filterInput().placeholder).toBe('Filter by text or address')
    })

    it('filters by name or address, and strings by text', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        await view.listed()
        view.typeFilter('MAIN')
        expect(view.rowTexts().map(([name]) => name)).toEqual(['main'])
        expect(view.panel().querySelector('.count')?.textContent?.trim()).toBe('1 of 22 functions')
        view.typeFilter('0x5555555551e9')
        expect(view.rowTexts().map(([name]) => name)).toEqual(['main'])
        view.typeFilter('strcmp')
        expect(view.rowTexts().map(([name]) => name)).toEqual(['strcmp@plt_resolver', 'strcmp@plt'])
        //the filter stays when the list switches
        view.typeFilter('pass')
        expect(view.rows()).toHaveLength(0)
        expect(view.panel().textContent).toContain('Nothing matches “pass”.')
        view.pick('Strings')
        expect(view.rowTexts()).toEqual([['"Enter password: "', '0x555555556004']])
        //Escape empties it
        view.filterInput().dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        )
        flushSync()
        expect(view.filterInput().value).toBe('')
        expect(view.rows()).toHaveLength(6)
    })

    it('says while the Listing is being generated', async () => {
        const view = symbolsPanel({}, { hold: true })
        show(view.session, 'crackme')
        expect(view.panel().querySelector('[role="status"]')?.textContent?.trim()).toBe(
            'Generating the Listing: 40%'
        )
        expect(view.panel().querySelector('progress')).not.toBeNull()
        expect(view.rows()).toHaveLength(0)
        view.release()
        await view.listed()
        expect(view.rows()).toHaveLength(22)
    })

    it("lists the Selected program's Entry when the focused pane shows no Executable", async () => {
        const view = symbolsPanel({
            files: {
                crackme: { encoding: 'base64', content: crackme },
                other: { encoding: 'base64', content: crackme },
                'main.s': { encoding: 'plain', content: 'nop' }
            },
            programs: { crackme: { settings: {}, testcases: [] }, 'main.s': {} },
            selectedProgram: 'crackme'
        })
        show(view.session, 'main.s')
        await view.listed()
        const file = view.panel().querySelector<HTMLElement>('.symbols-file')!
        expect(file.querySelector('strong')?.textContent).toBe('crackme')
        expect(file.querySelector('.entry-mark')).not.toBeNull()
        expect(file.title).toBe("crackme, the Selected program's Entry file")
        //an Executable in the focused pane comes first
        show(view.session, 'other')
        expect(file.isConnected && file.querySelector('strong')?.textContent).toBe('other')
        expect(view.panel().querySelector('.entry-mark')).toBeNull()
        //and with neither, the panel says how to list some
        show(view.session, 'main.s')
        view.session.selectProgram('main.s')
        flushSync()
        expect(view.rows()).toHaveLength(0)
        expect(view.panel().textContent).toContain('Show an Executable in the editor')
    })

    it('reveals a row in the Listing, switching the focused pane from the bytes', async () => {
        const view = symbolsPanel()
        const pane = show(view.session, 'crackme')
        view.session.groups[0].setView('crackme', 'hex', false)
        flushSync()
        const listing = await view.listed()
        const revealed = listingEditor(view.session, pane)
        const main = listing.functions.find((fn) => fn.name === 'main')!
        view.rows()
            .find((row) => row.textContent?.includes('main'))!
            .click()
        await until(() => revealed.length > 0)
        expect(pane.displayedView).toBe('listing')
        expect(revealed).toEqual([main.line + 1])
        //the row the cursor is in is marked
        expect(view.target.querySelector('.symbol-row.current')?.textContent).toContain('main')
        //a string, in the pane showing the Listing now
        view.pick('Strings')
        view.rows()
            .find((row) => row.textContent?.includes('hunter2'))!
            .click()
        await until(() => revealed.length > 1)
        const hunter2 = listing.labels.find((label) => label.name === 's_hunter2')!
        expect(revealed[1]).toBe(hunter2.line + 1)
        expect(view.target.querySelector('.symbol-row.current')?.textContent).toContain('hunter2')
    })

    it('moves the Listing beside a focused Pseudocode, which follows a function', async () => {
        const view = symbolsPanel()
        const { session } = view
        //no decompiler here: the Pseudocode's function is what is checked
        vi.spyOn(session.pseudocode, 'open').mockReturnValue(undefined)
        const left = show(session, 'crackme')
        left.setView('crackme', 'listing', false)
        const right = session.splitEditor()
        show(session, 'crackme', right)
        right.setView('crackme', 'pseudocode', false)
        flushSync()
        const listing = await view.listed()
        const revealed = listingEditor(session, left)
        const main = listing.functions.find((fn) => fn.name === 'main')!
        view.rows()
            .find((row) => row.textContent?.includes('main'))!
            .click()
        await until(() => revealed.length > 0)
        expect(revealed).toEqual([main.line + 1])
        expect(right.pseudocodeFunctions.crackme).toBe(main.address)
        expect([left.displayedView, right.displayedView]).toEqual(['listing', 'pseudocode'])
    })

    it("lists a C++ program's functions by their demangled names, and filters by either", async () => {
        const view = symbolsPanel({
            entry: 'cpp',
            files: { cpp: { encoding: 'base64', content: cpp } }
        })
        show(view.session, 'cpp')
        const listing = await view.listed('cpp')
        const destructor = listing.functions.find(
            (fn) => fn.name === '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEED1Ev'
        )!
        const address = `0x${(destructor.address + listing.base).toString(16)}`
        const size = destructor.end - destructor.address
        expect(view.rowTexts()).toContainEqual(['std::string::~basic_string', address, `${size} B`])
        expect(view.rowTexts()).toContainEqual(['main', expect.any(String), expect.any(String)])
        //the filter reads the short name, the signature and the raw name
        view.typeFilter('~basic_string')
        expect(view.rowTexts().map(([name]) => name)).toEqual(['std::string::~basic_string'])
        expect(view.rows()[0].title).toBe(
            `std::string::~basic_string() at ${address}, ${size} bytes\n${destructor.name}`
        )
        view.typeFilter('_M_data(char*)')
        expect(view.rowTexts().map(([name]) => name)).toEqual(['std::string::_M_data(char*)'])
        view.typeFilter('_ZdlPvm')
        expect(view.rowTexts().map(([name]) => name)).toEqual([
            'operator delete@plt_resolver',
            'operator delete@plt'
        ])
        //a row still reveals the raw name's line
        const reveal = vi.spyOn(view.session, 'revealListingLine').mockResolvedValue(true)
        view.typeFilter('~basic_string')
        view.rows()[0].click()
        expect(reveal).toHaveBeenCalledWith(liveSource('cpp'), destructor.line)
    })

    it('is worked from the keyboard: Enter reveals the first match, the arrows move', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        const listing = await view.listed()
        const reveal = vi.spyOn(view.session, 'revealListingLine').mockResolvedValue(true)
        view.typeFilter('main')
        const key = (element: HTMLElement, name: string) => {
            element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
            flushSync()
        }
        key(view.filterInput(), 'Enter')
        const main = listing.functions.find((fn) => fn.name === 'main')!
        expect(reveal).toHaveBeenCalledWith(liveSource('crackme'), main.line)
        view.typeFilter('@plt')
        key(view.filterInput(), 'ArrowDown')
        expect(document.activeElement).toBe(view.rows()[0])
        key(view.rows()[0], 'ArrowDown')
        expect(document.activeElement).toBe(view.rows()[1])
        key(view.rows()[1], 'End')
        expect(document.activeElement).toBe(view.rows().at(-1))
        key(view.rows().at(-1)!, 'Home')
        key(view.rows()[0], 'ArrowUp')
        expect(document.activeElement).toBe(view.filterInput())
    })
})

describe('renaming and commenting from the Symbols panel', () => {
    /** The row of a function, by the name it shows. */
    const rowOf = (view: ReturnType<typeof symbolsPanel>, name: string) =>
        view.rows().find((row) => row.querySelector('.symbol-name')?.textContent === name)!
    const menuItems = () =>
        [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((item) => ({
            label: item.textContent!.trim(),
            disabled: item.disabled
        }))
    const pickItem = (label: string) => {
        ;[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((item) => item.textContent!.trim() === label)!
            .click()
        flushSync()
    }
    /** Opens a row's menu, which focuses its first item once drawn. */
    const openMenu = async (row: HTMLElement) => {
        row.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 30,
                clientY: 40
            })
        )
        flushSync()
        await tick()
    }
    const type = (view: ReturnType<typeof symbolsPanel>, text: string) => {
        const field = view
            .panel()
            .querySelector<HTMLInputElement | HTMLTextAreaElement>(
                '.annotation-prompt input, .annotation-prompt textarea'
            )!
        field.value = text
        field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        return field
    }
    const submit = (view: ReturnType<typeof symbolsPanel>) => {
        view.panel()
            .querySelector('.annotation-prompt form')!
            .dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
        flushSync()
    }

    it('renames a function from its row’s menu, the row then listing it so, and resets it', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        await view.listed()
        await openMenu(rowOf(view, 'main'))
        expect(menuItems()).toEqual([
            { label: 'Rename…', disabled: false },
            { label: 'Comment…', disabled: false }
        ])
        pickItem('Rename…')
        const prompt = view.panel().querySelector('.annotation-prompt')!
        expect(prompt.textContent).toContain('Rename main')
        //a refused name says why, and Save waits
        type(view, 'my name')
        expect(prompt.querySelector('.annotation-error')?.textContent).toBe(
            'A name holds letters, digits and underscores only, not a space'
        )
        type(view, 'check_password')
        submit(view)
        expect(view.panel().querySelector('.annotation-prompt')).toBeNull()
        expect(view.project.files.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' }
        })
        await until(() => rowOf(view, 'check_password') !== undefined)
        expect(rowOf(view, 'check_password').title).toContain('Renamed from main')
        //the filter still finds it by the name it had
        view.typeFilter('main')
        expect(view.rowTexts().map((row) => row[0])).toContain('check_password')
        view.typeFilter('')
        await openMenu(rowOf(view, 'check_password'))
        expect(menuItems().map((item) => item.label)).toEqual(['Rename…', 'Comment…', 'Reset name'])
        pickItem('Reset name')
        expect(view.project.files.crackme.annotations).toBeUndefined()
        await until(() => rowOf(view, 'main') !== undefined)
    })

    it('comments on a function, its comment shown in the prompt again', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        await view.listed()
        await openMenu(rowOf(view, 'main'))
        pickItem('Comment…')
        expect(view.panel().querySelector('.annotation-prompt')!.textContent).toContain(
            'Comment on the function main'
        )
        type(view, 'Asks for the password')
        submit(view)
        expect(view.project.files.crackme.annotations).toEqual({
            functionComments: { '0x11e9': 'Asks for the password' }
        })
        await until(() => view.session.listingFor(liveSource('crackme'))?.status === 'ready')
        await openMenu(rowOf(view, 'main'))
        pickItem('Comment…')
        expect(
            view.panel().querySelector<HTMLTextAreaElement>('.annotation-prompt textarea')!.value
        ).toBe('Asks for the password')
    })

    it('opens Rename… on F2 while a row has the keyboard, and gives the keyboard back', async () => {
        const view = symbolsPanel()
        show(view.session, 'crackme')
        await view.listed()
        const row = rowOf(view, '_start')
        row.focus()
        row.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })
        )
        flushSync()
        const prompt = view.panel().querySelector<HTMLElement>('.annotation-prompt')!
        expect(prompt.textContent).toContain('Rename _start')
        prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        flushSync()
        expect(view.panel().querySelector('.annotation-prompt')).toBeNull()
        expect(document.activeElement).toBe(row)
        //a PLT stub's says why it keeps its name
        const warn = vi.spyOn(toast, 'warn')
        rowOf(view, 'puts@plt').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })
        )
        flushSync()
        expect(view.panel().querySelector('.annotation-prompt')).toBeNull()
        expect(warn).toHaveBeenCalledWith('puts is named by the library it comes from')
    })

    it('has a button for a row’s menu on a touch screen, which has no right click', async () => {
        const view = symbolsPanel({}, { touch: true })
        show(view.session, 'crackme')
        await view.listed()
        const button = rowOf(view, 'main').parentElement!.querySelector<HTMLButtonElement>(
            'button.row-menu'
        )!
        expect(button.getAttribute('aria-label')).toBe('Rename or comment on main')
        button.click()
        flushSync()
        await tick()
        expect(menuItems().map((item) => item.label)).toEqual(['Rename…', 'Comment…'])
        //with a mouse there is none
        const mouse = symbolsPanel()
        show(mouse.session, 'crackme')
        await mouse.listed()
        expect(mouse.panel().querySelector('button.row-menu')).toBeNull()
    })

    it('offers nothing to change in a read-only Workbench', async () => {
        const view = symbolsPanel({}, { readonly: true })
        show(view.session, 'crackme')
        await view.listed()
        await openMenu(rowOf(view, 'main'))
        expect(menuItems()).toEqual([
            { label: 'Rename…', disabled: true },
            { label: 'Comment…', disabled: true }
        ])
        rowOf(view, 'main').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })
        )
        flushSync()
        expect(view.panel().querySelector('.annotation-prompt')).toBeNull()
    })
})
