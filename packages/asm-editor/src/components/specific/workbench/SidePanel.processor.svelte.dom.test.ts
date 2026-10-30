/**
 * The Documentation panel of an M68K Project follows the processor its program chooses, and the
 * "68000 · 68010 · 68020" switch in its header, kept off by its flag, lets a reader look at another
 * without editing the code ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
 * decision 36). The Chapters are stand-ins: s68k's WebAssembly does not load under jsdom.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { m68kDialectKey, m68kProcessorSwitch } from '#lib/languages/M68K/m68kDialect.ts'
import type { M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
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

/** The dialects the panel asked the Chapters for, in order. */
const loads = vi.hoisted(() => ({ dialects: [] as string[] }))

vi.mock('#lib/documentation/documentation.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('#lib/documentation/documentation.ts')>()),
    documentationFor: async () => [],
    m68kDocumentationFor: async (dialect: M68kDialect) => {
        loads.dialects.push(m68kDialectKey(dialect))
        return { chapters: [], hidden: new Set() }
    }
}))

beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
    Element.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof Element.prototype.animate
    Element.prototype.getAnimations ??= () => []
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    m68kProcessorSwitch.enabled = false
    loads.dialects = []
})

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })
const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    {
        id: 'documentation',
        title: 'Documentation',
        icon,
        group: 'top',
        maximizable: true,
        access: 'on'
    }
]

/** The Documentation panel of an M68K Project, whose live analysis says `dialect`. */
function documentationPanel(dialect: M68kDialect | undefined) {
    const fixture = editorGroupsFixture('M68K', {
        files: { 'main.x68': text('    simhalt') },
        programs: { 'main.x68': { settings: {}, testcases: [] } },
        selectedProgram: 'main.x68'
    })
    const analyse = (m68kDialect: M68kDialect | undefined) => {
        fixture.session.languageAnalysis = {
            sessionId: fixture.session.languageSessionId,
            revision: 1,
            target: 'M68K',
            diagnostics: [],
            symbols: [],
            occurrences: [],
            fileStatus: {},
            ...(m68kDialect ? { m68kDialect } : {})
        }
        flushSync()
    }
    if (dialect) analyse(dialect)
    const viewport = $state({ deviceClass: 'desktop' as const, canHover: true })
    let active = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => active, set: (id) => (active = id) })
    ui.open('documentation')
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session: fixture.session, ui, rail, part: 'side-panel' }
    })
    flushSync()
    disposers.push(() => {
        void unmount(app)
        fixture.dispose()
    })
    const choice = () => target.querySelector<HTMLElement>('.panel-header [aria-label="Processor"]')
    const picked = () =>
        choice()?.querySelector('[aria-pressed="true"]')?.textContent?.trim() ?? undefined
    const pick = (processor: string) => {
        ;[...choice()!.querySelectorAll<HTMLButtonElement>('button')]
            .find((button) => button.textContent?.trim() === processor)!
            .click()
        flushSync()
    }
    return { target, analyse, choice, picked, pick }
}

describe('the Documentation panel of an M68K Project', () => {
    it('shows what the program’s processor has, with no switch while its flag is off', async () => {
        const view = documentationPanel({ processor: '68010', bitFields: false })
        await vi.waitFor(() => expect(loads.dialects).toEqual(['68010']))
        expect(view.choice()).toBeNull()
        view.analyse({ processor: '68000', bitFields: true })
        await vi.waitFor(() => expect(loads.dialects).toEqual(['68010', '68000+bit']))
    })

    it('with the switch on, follows the program until the reader picks a processor', async () => {
        m68kProcessorSwitch.enabled = true
        const view = documentationPanel({ processor: '68000', bitFields: false })
        expect(view.picked()).toBe('68000')
        view.analyse({ processor: '68010', bitFields: false })
        expect(view.picked()).toBe('68010')
        await vi.waitFor(() => expect(loads.dialects.at(-1)).toBe('68010'))

        view.pick('68020')
        expect(view.picked()).toBe('68020')
        await vi.waitFor(() => expect(loads.dialects.at(-1)).toBe('68020'))
        //the reader's pick stays while the program changes
        view.analyse({ processor: '68000', bitFields: true })
        expect(view.picked()).toBe('68020')
        //and looking back keeps the program's `opt bit`
        view.pick('68010')
        await vi.waitFor(() => expect(loads.dialects.at(-1)).toBe('68010+bit'))
    })

    it('has no switch before the analysis knows the processor, and shows everything', () => {
        m68kProcessorSwitch.enabled = true
        const view = documentationPanel(undefined)
        expect(view.choice()).toBeNull()
        expect(loads.dialects).toEqual([])
    })
})
