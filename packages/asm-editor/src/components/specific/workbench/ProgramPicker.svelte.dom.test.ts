/**
 * The Program picker at the right of the bottom panel's tab strip
 * ([programs.md](../../../../../../docs/design/programs.md), decision 10): hidden with fewer than
 * two Programs, listing them by label with a missing Entry marked, choosing the Selected program
 * without changing the panes, and disabled during a Debug session, which it shows the Program of.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import type { StoredProject, TestcaseResult } from '#lib/Project.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import type { DeviceClass } from '#lib/workbench/deviceClass.ts'
import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import { editorGroupsFixture } from '#lib/workbench/__fixtures__/editorGroups.svelte.ts'
import WorkbenchPartHarness from './__fixtures__/WorkbenchPartHarness.svelte'

//svelte/motion, which the side panel beside it in the harness loads, reads the reduced motion
//query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

beforeAll(() => {
    //jsdom has no popovers, no Web Animations, which the list's transition runs on, and no CSS
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
    globalThis.CSS ??= {} as typeof CSS
    CSS.escape ??= (text: string) => text
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })

/** The picker over a Project of three Programs, `main.s` selected and `gone.s` missing. */
function picker(data: StoredProject = {}, deviceClass: DeviceClass = 'desktop') {
    const fixture = editorGroupsFixture('RISC-V', {
        files: { 'main.s': text('nop'), 'sort.s': text('nop'), 'notes.txt': text('') },
        programs: {
            'sort.s': { settings: {}, testcases: [] },
            'main.s': { settings: {}, testcases: [] },
            'gone.s': { settings: {}, testcases: [] }
        },
        selectedProgram: 'main.s',
        ...data
    })
    const viewport = $state({ deviceClass, canHover: true })
    let panel = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => panel, set: (id) => (panel = id) })
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session: fixture.session, ui, part: 'program-picker' }
    })
    flushSync()
    disposers.push(() => {
        unmount(app)
        fixture.dispose()
    })
    const button = () => target.querySelector<HTMLButtonElement>('[role="combobox"]')
    const options = () => [...target.querySelectorAll<HTMLElement>('[role="option"]')]
    const open = async () => {
        button()!.click()
        flushSync()
        await tick()
        await tick()
    }
    return { ...fixture, target, button, options, open }
}

it('is hidden while the Project has fewer than two Programs', () => {
    expect(picker({ programs: { 'main.s': { settings: {}, testcases: [] } } }).button()).toBeNull()
    expect(picker({ programs: {} }).button()).toBeNull()
})

it('lists the Programs by label, a missing Entry marked, and shows the selected one', async () => {
    const view = picker()
    expect(view.button()?.getAttribute('aria-label')).toBe('Program')
    expect(view.button()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Program main.s')
    await view.open()
    expect(view.options().map((option) => option.textContent?.trim())).toEqual([
        'gone.s — missing',
        'main.s',
        'sort.s'
    ])
    expect(view.options()[0].querySelector('.missing')).not.toBeNull()
    expect(view.options()[1].getAttribute('aria-selected')).toBe('true')
})

it('marks a missing Selected program on the control too', () => {
    const view = picker({ selectedProgram: 'gone.s' })
    expect(view.button()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Program gone.s — missing')
})

it('selects the Program picked, leaving the panes as they are', async () => {
    const view = picker()
    view.session.selectFile('main.s')
    flushSync()
    await view.open()
    view.options()
        .find((option) => option.textContent?.trim() === 'sort.s')!
        .click()
    flushSync()
    expect(view.project.selectedProgram).toBe('sort.s')
    expect(view.session.groups.map((group) => group.displayedPath)).toEqual(['main.s'])
    expect(view.button()?.textContent).toContain('sort.s')
})

it("is disabled during a Debug session, saying why, and shows that session's Program", () => {
    const view = picker()
    view.emulator.buildSources = { files: view.project.files, entry: 'sort.s' }
    view.emulator.canExecute = true
    flushSync()
    expect(view.button()?.disabled).toBe(true)
    expect(view.button()?.closest('.program-picker')?.getAttribute('title')).toBe(
        'Stop the Debug session before changing programs'
    )
    expect(view.button()?.textContent).toContain('sort.s')
    expect(view.project.selectedProgram).toBe('main.s')

    view.emulator.canExecute = false
    view.emulator.buildSources = undefined
    flushSync()
    expect(view.button()?.disabled).toBe(false)
    expect(view.button()?.textContent).toContain('main.s')
})

it('is enabled again once a test run ends', async () => {
    const view = picker({
        programs: {
            'sort.s': { settings: {}, testcases: [] },
            'main.s': {
                settings: {},
                testcases: [
                    {
                        input: [],
                        expectedOutput: '',
                        startingRegisters: {},
                        expectedRegisters: {},
                        startingMemory: [],
                        expectedMemory: []
                    }
                ]
            }
        }
    })
    let finish!: () => void
    Object.assign(view.emulator, {
        test: () => new Promise<TestcaseResult[]>((resolve) => (finish = () => resolve([])))
    })
    const run = view.session.test()
    await vi.waitFor(() => expect(view.session.testing).toBe(true))
    flushSync()
    expect(view.button()?.disabled).toBe(true)
    finish()
    await run
    flushSync()
    expect(view.session.programsLocked).toBeUndefined()
    expect(view.button()?.disabled).toBe(false)
})

it('shows the label alone on a phone', () => {
    const view = picker({}, 'phone')
    expect(view.button()?.textContent?.trim()).toBe('main.s')
})
