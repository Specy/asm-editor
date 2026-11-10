/**
 * The Workbench is on screen before its Emulator's Core has loaded
 * ([workbench-loading-plan.md](../../../../../docs/design/workbench-loading-plan.md), Stage 2): what
 * needs the Core waits for it, a Build saying so, and what was done meanwhile reaches it as it
 * arrives. A Core that does not load leaves the Workbench open, with Reload in Build's place.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { toast } from '#stores/toastStore.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

/** An x86 Project whose pane shows its Entry, its Core still loading, and that pane's dock. */
function setup() {
    const fixture = editorGroupsFixture(
        'X86',
        { entry: 'main.asm', files: { 'main.asm': { encoding: 'plain', content: 'nop' } } },
        {},
        { pendingCore: true }
    )
    disposers.push(fixture.dispose)
    const { session, emulator } = fixture
    const compiled: BuildSources[] = []
    emulator.compile = async (_historySize, sources) => {
        compiled.push(sources)
    }
    const given: BuildSources[] = []
    emulator.setSources = (sources) => given.push(sources)
    session.selectFile('main.asm', session.groups[0])
    flushSync()

    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionControlsHarness, { target, props: { session } })
    flushSync()
    disposers.push(() => unmount(app))
    const buildButton = () =>
        target.querySelector<HTMLButtonElement>('button[aria-label="Build"]') ??
        target.querySelector<HTMLButtonElement>('button[aria-label="Reload"]')
    /** Lets the Emulator arrive and the session take it. */
    const arrive = async () => {
        fixture.arrive()
        await settle()
    }
    return { ...fixture, compiled, given, buildButton, arrive }
}

/** Lets promises settle and the effects they start run. */
async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()
    flushSync()
}

describe('a Workbench whose Core is still loading', () => {
    it('is no Debug session and has no Emulator yet', () => {
        const { session } = setup()
        expect(session.coreStatus).toBe('loading')
        expect(session.emulator).toBeUndefined()
        expect(session.debugSession).toBe(false)
        expect(session.executionDisabled).toBe(true)
        expect(() => session.core).toThrow()
        //the bottom panel has a Terminal to show all the same
        expect(session.terminal).toBeDefined()
    })

    it('takes a Build, which says it waits for the Core and builds once it arrives', async () => {
        const { session, compiled, buildButton, arrive } = setup()
        buildButton()!.click()
        flushSync()
        expect(session.building).toBe(true)
        expect(buildButton()!.textContent?.trim()).toBe('Loading the x86-64 emulator…')
        expect(compiled).toHaveLength(0)
        await arrive()
        expect(session.coreStatus).toBe('ready')
        expect(compiled).toHaveLength(1)
        expect(compiled[0].entry).toBe('main.asm')
        expect(session.building).toBe(false)
    })

    it('drops a Build cancelled while the Core loads', async () => {
        const { session, compiled, arrive } = setup()
        void session.build()
        flushSync()
        expect(session.building).toBe(true)
        session.cancelBuild()
        await settle()
        expect(session.building).toBe(false)
        await arrive()
        expect(compiled).toHaveLength(0)
        expect(session.log).toHaveLength(0)
    })

    it('gives the Core the Breakpoints set while it loaded', async () => {
        const { session, emulator, arrive } = setup()
        const pane = session.groups[0]
        session.toggleBreakpoint(3, pane)
        session.toggleBreakpoint(5, pane)
        session.toggleBreakpoint(5, pane)
        flushSync()
        expect(session.breakpoints).toEqual([{ line: 3, file: 'main.asm' }])
        expect(pane.shownBreakpoints).toEqual([{ line: 3, file: 'main.asm' }])
        await arrive()
        expect(emulator.breakpoints).toEqual([{ line: 3, file: 'main.asm' }])
        expect(session.breakpoints).toBe(emulator.breakpoints)
    })

    it('gives the Core what was typed and the Arguments set while it loaded', async () => {
        const { session, project, emulator, given, arrive } = setup()
        project.fileSystem.writeText('main.asm', 'nop\nnop')
        session.setProgramArguments('one two')
        flushSync()
        await arrive()
        expect(given.at(-1)?.files['main.asm']).toEqual({ encoding: 'plain', content: 'nop\nnop' })
        expect(emulator.programArguments).toBe('one two')
    })

    it('runs the Testcases once the Core arrives, waiting as a Build waits', async () => {
        const { session, emulator, buildButton, arrive } = setup()
        const runs: unknown[] = []
        Object.assign(emulator, { test: async (...args: unknown[]) => (runs.push(args), []) })
        const running = session.test()
        await new Promise((resolve) => setTimeout(resolve, 60))
        flushSync()
        expect(session.testWaitingForCore).toBe(true)
        expect(buildButton()!.textContent?.trim()).toBe('Loading the x86-64 emulator…')
        await arrive()
        await running
        expect(runs).toHaveLength(1)
        expect(session.testWaitingForCore).toBe(false)
        expect(session.testing).toBe(false)
    })

    it('ends a test run waiting for the Core at Stop, and never runs it', async () => {
        const { session, emulator, arrive } = setup()
        const runs: unknown[] = []
        Object.assign(emulator, { test: async (...args: unknown[]) => (runs.push(args), []) })
        const running = session.test()
        await new Promise((resolve) => setTimeout(resolve, 60))
        session.stop()
        await running
        expect(session.testing).toBe(false)
        expect(session.running).toBe(false)
        await arrive()
        expect(runs).toHaveLength(0)
    })

    it('lets the Core go, and runs nothing on it, when the Workbench goes before it arrives', async () => {
        const { session, emulator, arrive } = setup()
        const disposed = vi.fn()
        const runs: unknown[] = []
        Object.assign(emulator, {
            dispose: disposed,
            test: async (...args: unknown[]) => (runs.push(args), [])
        })
        const unmount = session.mount()
        const running = session.test()
        await new Promise((resolve) => setTimeout(resolve, 60))
        unmount()
        await running
        await arrive()
        expect(disposed).toHaveBeenCalledOnce()
        expect(session.emulator).toBeUndefined()
        expect(runs).toHaveLength(0)
    })

    it('says in the Log why a Build pressed while the Core loaded did not build', async () => {
        const { session, failToLoad } = setup()
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        void session.build()
        flushSync()
        failToLoad(new Error('chunk not found'))
        await settle()
        expect(JSON.stringify(session.log)).toContain("The x86-64 emulator didn't load")
        //and Build and Test do nothing more, Reload being the way on
        void session.build()
        void session.test()
        flushSync()
        expect(session.building).toBe(false)
        expect(session.running).toBe(false)
    })

    it('stays open when the Core does not load, with Reload in place of Build', async () => {
        const { session, failToLoad, buildButton } = setup()
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const toastError = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        void session.build()
        flushSync()
        failToLoad(new Error('chunk not found'))
        await settle()
        expect(session.coreStatus).toBe('failed')
        expect(session.building).toBe(false)
        const reload = buildButton()!
        expect(reload.getAttribute('aria-label')).toBe('Reload')
        expect(reload.disabled).toBe(false)
        //the dock says it once, rather than a toast for each Build the person tries
        expect(toastError).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalled()
    })
})
