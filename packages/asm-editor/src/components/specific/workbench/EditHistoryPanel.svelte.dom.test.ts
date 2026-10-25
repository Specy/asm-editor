/**
 * The Edit history panel ([pixel-editor.md](../../../../../../docs/design/pixel-editor.md),
 * decision 12) in the side panel: the Edit journal's steps of the File the focused pane shows in
 * Hex or Pixels, newest first, gone back and forward to from a row, Undo and Redo above them.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import { fileBytes } from '#lib/projectFiles.ts'
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

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

const icon = (() => {}) as unknown as Component
const rail: RailEntry[] = [
    { id: 'history', title: 'Edit history', icon, group: 'top', maximizable: false, access: 'on' }
]

/** The side panel showing the Edit history, over a byte File shown in Hex and a text File. */
function historyPanel() {
    const fixture = editorGroupsFixture('MIPS', {
        entry: 'main.s',
        files: {
            'main.s': { encoding: 'plain', content: 'nop' },
            'blob.bin': { encoding: 'base64', content: 'AQIDBA==' }
        }
    })
    const { session } = fixture
    const viewport = $state({ deviceClass: 'desktop' as const, canHover: true })
    let active = $state<string | null>(null)
    const ui = new WorkbenchUi(viewport, { get: () => active, set: (id) => (active = id) })
    ui.open('history')
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session, ui, rail, part: 'side-panel' }
    })
    session.selectFile('blob.bin')
    flushSync()
    disposers.push(() => {
        unmount(app)
        fixture.dispose()
    })
    const rows = () => [...target.querySelectorAll<HTMLButtonElement>('button.step')]
    return {
        ...fixture,
        target,
        rows,
        /** Each row's label, `>` marking the current one and `~` one Undo took back. */
        listed: () =>
            rows().map(
                (row) =>
                    (row.classList.contains('current') ? '>' : '') +
                    (row.classList.contains('undone') ? '~' : '') +
                    row.querySelector('.label')!.textContent!.trim()
            ),
        button: (label: string) =>
            target.querySelector<HTMLButtonElement>(`.edit-history button[aria-label="${label}"]`)!,
        bytes: () => [...fileBytes(fixture.project.files['blob.bin'])]
    }
}

describe('the Edit history panel', () => {
    it('lists the steps newest first, the File before them last', () => {
        const panel = historyPanel()
        expect(panel.session.groups[0].displayedView).toBe('hex')
        expect(panel.listed()).toEqual(['>Before these changes'])
        expect(panel.target.textContent).toContain('No changes yet')
        panel.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        panel.session.editFileByteRuns('blob.bin', [{ offset: 1, bytes: Uint8Array.of(8) }], 'Fill')
        flushSync()
        expect(panel.listed()).toEqual(['>Fill', 'Typing', 'Before these changes'])
        //the File's path heads the steps, in a section drawn as the Settings panel's
        expect(panel.target.querySelector('.collapsible.outlined .toggle')!.textContent).toContain(
            'blob.bin'
        )
        //no byte counts, only what each step was and when, and a pill on the current one
        expect(panel.target.textContent).not.toMatch(/\d+(\.\d+)? ?(B|KB|MB)\b/)
        expect(panel.target.querySelector('.step.current .pill')!.textContent).toBe('current')
        expect(panel.target.querySelectorAll('.pill')).toHaveLength(1)
    })

    it('goes back and forward to a row, and greys the steps Undo took back', () => {
        const panel = historyPanel()
        for (const offset of [0, 1, 2])
            panel.session.editFileBytes('blob.bin', offset, Uint8Array.of(9))
        flushSync()
        panel.button('Undo').click()
        flushSync()
        expect(panel.listed()).toEqual(['~Typing', '>Typing', 'Typing', 'Before these changes'])
        expect(panel.bytes()).toEqual([9, 9, 3, 4])
        panel.rows().at(-1)!.click()
        flushSync()
        expect(panel.bytes()).toEqual([1, 2, 3, 4])
        expect(panel.listed()).toEqual(['~Typing', '~Typing', '~Typing', '>Before these changes'])
        expect(panel.button('Undo').disabled).toBe(true)
        panel.rows()[0].click()
        flushSync()
        expect(panel.bytes()).toEqual([9, 9, 9, 4])
        expect(panel.button('Redo').disabled).toBe(true)
        panel.button('Undo').click()
        flushSync()
        panel.button('Redo').click()
        flushSync()
        expect(panel.listed()[0]).toBe('>Typing')
    })

    it('saves what a Hex editor typed before going back, and takes that back first', () => {
        const panel = historyPanel()
        panel.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        flushSync()
        let pending: Uint8Array | undefined = Uint8Array.of(7)
        panel.session.registerTypingFlush(() => {
            if (pending) panel.session.editFileBytes('blob.bin', 3, pending)
            pending = undefined
        })
        panel.button('Undo').click()
        flushSync()
        expect(panel.bytes()).toEqual([9, 2, 3, 4])
        expect(panel.listed()).toEqual(['~Typing', '>Typing', 'Before these changes'])
    })

    it('takes no change while the Files are locked, and says why', () => {
        const panel = historyPanel()
        panel.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        const run = panel.project.fileSystem.beginSession()
        flushSync()
        expect(panel.target.textContent).toContain('Debug session')
        panel.rows().at(-1)!.click()
        flushSync()
        expect(panel.bytes()).toEqual([9, 2, 3, 4])
        expect(panel.button('Undo').disabled).toBe(true)
        run.stop()
    })

    it('keeps listing the edited Files whatever the pane shows, a row bringing its File back', () => {
        const panel = historyPanel()
        panel.session.selectFile('main.s')
        flushSync()
        expect(panel.rows()).toEqual([])
        expect(panel.target.textContent).toContain(
            'Edits made in the pixel and hex editors appear here.'
        )
        //steps made in Hex, and the pane gone on to the source
        panel.session.selectFile('blob.bin')
        panel.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        panel.session.editFileBytes('blob.bin', 1, Uint8Array.of(8))
        panel.session.selectFile('main.s')
        flushSync()
        expect(panel.listed()).toEqual(['>Typing', 'Typing', 'Before these changes'])
        //a row opens the File in its editor and goes to just after its step
        panel.rows()[1].click()
        flushSync()
        const group = panel.session.groups[0]
        expect(group.displayedPath).toBe('blob.bin')
        expect(group.displayedView).toBe('hex')
        expect(panel.bytes()).toEqual([9, 2, 3, 4])
        expect(panel.listed()).toEqual(['~Typing', '>Typing', 'Before these changes'])
        //the current row of a File no pane shows only opens it
        panel.session.selectFile('main.s')
        flushSync()
        panel.rows()[1].click()
        flushSync()
        expect(group.displayedPath).toBe('blob.bin')
        expect(panel.bytes()).toEqual([9, 2, 3, 4])
    })

    it('lists the File the pane shows first, then the last changed', () => {
        const panel = historyPanel()
        panel.project.fileSystem.writeBytes('other.bin', Uint8Array.of(0, 0), true, 'base64')
        panel.session.editFileBytes('other.bin', 0, Uint8Array.of(1))
        panel.session.editFileBytes('blob.bin', 0, Uint8Array.of(9))
        flushSync()
        const titles = () =>
            [...panel.target.querySelectorAll('.collapsible .toggle')].map((toggle) =>
                toggle.textContent!.trim()
            )
        expect(titles()).toEqual(['blob.bin', 'other.bin'])
        panel.session.selectFile('main.s')
        panel.session.editFileBytes('other.bin', 1, Uint8Array.of(2))
        flushSync()
        expect(titles()).toEqual(['other.bin', 'blob.bin'])
    })
})
