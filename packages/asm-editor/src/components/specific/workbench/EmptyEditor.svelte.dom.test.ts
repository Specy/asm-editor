/**
 * The pane with no File open: its New file asks for a path and makes a text File there, the first
 * Program of a Project with none, and opens it in the pane.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import { editorGroupsFixture } from '#lib/workbench/__fixtures__/editorGroups.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import WorkbenchPartHarness from './__fixtures__/WorkbenchPartHarness.svelte'
import type { RailEntry } from './workbenchContext'

//svelte/motion, which the side panel beside it in the harness loads, reads the reduced motion
//query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })
const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    { id: 'explorer', title: 'Explorer', icon, group: 'top', maximizable: false, access: 'on' }
]

/** The first pane, empty, over a Project of a text File and no Program. */
function emptyEditor() {
    const fixture = editorGroupsFixture('RISC-V', {
        files: { 'notes.txt': text('notes') },
        programs: {}
    })
    const viewport = $state({ deviceClass: 'desktop' as const, canHover: true })
    let panel = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => panel, set: (id) => (panel = id) })
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session: fixture.session, ui, rail, part: 'empty-editor' }
    })
    flushSync()
    disposers.push(() => {
        void unmount(app)
        fixture.dispose()
    })
    return {
        ...fixture,
        target,
        /** Answers the path question with `typed`, from the pane's New file. */
        async create(typed: string) {
            vi.spyOn(Prompt, 'askText').mockResolvedValue(typed)
            const button = [...target.querySelectorAll<HTMLButtonElement>('button.link')].find(
                (link) => link.textContent!.includes('New file')
            )!
            button.click()
            await new Promise((resolve) => setTimeout(resolve, 0))
            flushSync()
        }
    }
}

describe('the empty pane’s New file', () => {
    it('makes the File, its first Program and the pane’s selection at the path it resolves to', async () => {
        const view = emptyEditor()
        await view.create('./x.s')
        expect(Object.keys(view.project.files).sort()).toEqual(['notes.txt', 'x.s'])
        expect(view.project.programs).toEqual({ 'x.s': { settings: {}, testcases: [] } })
        expect(view.project.selectedProgram).toBe('x.s')
        expect(view.session.groups[0].displayedPath).toBe('x.s')
    })

    it('refuses a path above the root', async () => {
        const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const view = emptyEditor()
        await view.create('../x.s')
        expect(error).toHaveBeenCalledWith('Path escapes the Project root')
        expect(Object.keys(view.project.files)).toEqual(['notes.txt'])
        expect(view.project.programs).toEqual({})
    })
})
