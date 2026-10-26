/**
 * The side panel's Programs ([programs.md](../../../../../../docs/design/programs.md), decision 10;
 * [programs-plan.md](../../../../../../docs/design/programs-plan.md), decision 14): the Settings and
 * Testcases headers name the Selected program while there are two or more, the Testcases are the
 * Selected program's, Settings keeps the instruction set under Project and the rest under Program,
 * and a Project with no Program is told how to make one.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import type { StoredProject, Testcase } from '#lib/Project.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { NO_PROGRAM_MESSAGE } from '#lib/workbench/WorkbenchSession.svelte.ts'
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
    HTMLElement.prototype.scrollIntoView ??= () => {}
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
    vi.restoreAllMocks()
})

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })
const testcase = (name: string): Testcase => ({
    name,
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
})

//the rail's icons are drawn by the rail, not by the panel
const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    { id: 'explorer', title: 'Explorer', icon, group: 'top', maximizable: false, access: 'on' },
    { id: 'testcases', title: 'Testcases', icon, group: 'top', maximizable: true, access: 'on' },
    { id: 'settings', title: 'Settings', icon, group: 'bottom', maximizable: false, access: 'on' }
]

/**
 * The side panel showing `panel`, over a Project of two Programs, `main.s` selected with one
 * Testcase and `sort.s` with its Arguments decided and two.
 */
function sidePanel(panel: string, data: StoredProject = {}) {
    const fixture = editorGroupsFixture('RISC-V', {
        files: { 'main.s': text('nop'), 'sort.s': text('nop'), 'notes.txt': text('') },
        programs: {
            'main.s': { settings: {}, testcases: [testcase('adds')] },
            'sort.s': {
                settings: { programArguments: 'sort me' },
                testcases: [testcase('sorts'), testcase('keeps order')]
            }
        },
        selectedProgram: 'main.s',
        ...data
    })
    //what the Testcases list reads of the Emulator, which the fixture has none of
    Object.assign(fixture.emulator, {
        registers: [],
        startingRegisterNames: [],
        hiddenRegisters: []
    })
    const viewport = $state({ deviceClass: 'desktop' as const, canHover: true })
    let active = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => active, set: (id) => (active = id) })
    ui.open(panel)
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
    const title = () =>
        target.querySelector('.panel-title')?.textContent?.replace(/\s+/g, ' ').trim()
    const shown = () => target.querySelector<HTMLElement>('.panel-body.shown')!
    return { ...fixture, ui, target, title, shown }
}

describe('the headers', () => {
    it.each(['settings', 'testcases'])(
        'name the Selected program in the %s header while there are two Programs',
        (panel) => {
            const view = sidePanel(panel)
            const name = panel === 'settings' ? 'Settings' : 'Testcases'
            expect(view.title()).toBe(`${name} · main.s`)
            //in the File's own case, which the header's capitals would change
            expect(view.target.querySelector('.program-label')?.textContent?.trim()).toBe(
                '· main.s'
            )
            view.session.selectProgram('sort.s')
            flushSync()
            expect(view.title()).toBe(`${name} · sort.s`)
            view.session.removeProgram('main.s')
            flushSync()
            expect(view.title()).toBe(name)
        }
    )

    it('leave the other panels alone', () => {
        expect(sidePanel('explorer').title()).toBe('Explorer')
    })
})

describe('the Testcases', () => {
    it("are the Selected program's, and a new one is added to it", () => {
        const view = sidePanel('testcases')
        const names = () =>
            [...view.shown().querySelectorAll<HTMLInputElement>('input')]
                .map((input) => input.value)
                .filter(Boolean)
        expect(view.target.querySelector('.panel-header')?.textContent).toContain('1 testcase')
        view.session.selectProgram('sort.s')
        flushSync()
        expect(view.target.querySelector('.panel-header')?.textContent).toContain('2 testcases')
        expect(names()).toContain('sorts')
        view.shown().querySelector<HTMLButtonElement>('.new-testcase')!.click()
        flushSync()
        expect(view.project.program('sort.s')?.testcases).toHaveLength(3)
        expect(view.project.program('main.s')?.testcases).toHaveLength(1)
    })

    it('say how to make a Program when there is none', () => {
        const view = sidePanel('testcases', { programs: {} })
        expect(view.shown().textContent).toContain(NO_PROGRAM_MESSAGE)
        expect(view.target.querySelector('.new-testcase')).toBeNull()
        expect(view.title()).toBe('Testcases')
    })
})

describe('the Settings', () => {
    const sectionTitles = (view: ReturnType<typeof sidePanel>) =>
        [...view.shown().querySelectorAll('.settings-panel > *')].map((section) =>
            section.querySelector('button, header')?.textContent?.replace(/\s+/g, ' ').trim()
        )

    it('keep the instruction set under Project and the Settings under Program', () => {
        const view = sidePanel('settings')
        const titles = sectionTitles(view)
        expect(titles.slice(0, 2)).toEqual(['Project', 'Program · main.s'])
        const [project, program] = view.shown().querySelectorAll('.settings-panel > *')
        expect(project.textContent).toContain('Instruction set')
        expect(project.textContent).not.toContain('take effect at the next Build')
        expect(program.textContent).toContain(
            'These belong to this program and take effect at the next Build.'
        )
    })

    it('title the Program section with no label while there is one Program', () => {
        const view = sidePanel('settings', {
            programs: { 'main.s': { settings: {}, testcases: [] } }
        })
        expect(sectionTitles(view)[1]).toBe('Program')
        expect(view.title()).toBe('Settings')
    })

    it('say how to make a Program when there is none', () => {
        const view = sidePanel('settings', { programs: {} })
        const program = view.shown().querySelectorAll('.settings-panel > *')[1]
        expect(program.textContent).toContain(NO_PROGRAM_MESSAGE)
        expect(program.textContent).not.toContain('take effect at the next Build')
    })
})

describe('the Explorer', () => {
    it('is locked while a test run lasts, which locks no FileSystem, and unlocked after', async () => {
        const view = sidePanel('explorer')
        let finish!: () => void
        Object.assign(view.emulator, {
            test: () => new Promise<[]>((resolve) => (finish = () => resolve([])))
        })
        const deletes = () =>
            [
                ...view.shown().querySelectorAll<HTMLButtonElement>('button[aria-label="Delete"]')
            ].map((button) => button.disabled)
        expect(deletes()).toEqual([false, false, false])
        const run = view.session.test()
        await vi.waitFor(() => expect(view.session.testing).toBe(true))
        flushSync()
        expect(view.project.fileSystem.locked).toBe(false)
        expect(deletes()).toEqual([true, true, true])
        finish()
        await run
        flushSync()
        expect(deletes()).toEqual([false, false, false])
    })
})
