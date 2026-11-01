/**
 * Restart, in Run's place once the program has ended: Stop, then a Build of the Debug session's
 * Program, which waits at its start as after any Build, with Run back. It is a plain button, not
 * the accent Run has, and the debug column stays while it rebuilds.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

/** A RISC-V Project whose pane shows its Entry, its dock, and a Build that succeeds at once. */
function setup() {
    const fixture = editorGroupsFixture('RISC-V', {
        entry: 'main.s',
        files: { 'main.s': { encoding: 'plain', content: 'nop' } }
    })
    disposers.push(fixture.dispose)
    const { session, emulator } = fixture
    const built: string[] = []
    let cleared = 0
    emulator.compile = async (_historySize, sources) => {
        built.push(sources.entry)
        emulator.buildSources = sources
        emulator.canExecute = true
        emulator.terminated = false
    }
    emulator.clear = () => {
        cleared += 1
        emulator.canExecute = false
        emulator.terminated = false
    }
    session.selectFile('main.s', session.groups[0])
    flushSync()

    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionControlsHarness, { target, props: { session } })
    flushSync()
    disposers.push(() => unmount(app))
    const button = (label: string) =>
        target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    const labels = () =>
        [...target.querySelectorAll('button')].map((item) => item.getAttribute('aria-label'))
    const press = (label: string) => {
        button(label)!.click()
        flushSync()
    }
    return { ...fixture, built, cleared: () => cleared, button, labels, press }
}

describe('Restart', () => {
    it("takes Run's place once the program has ended, and builds it again to its start", async () => {
        const { session, emulator, built, cleared, button, labels, press } = setup()
        press('Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(labels()).toEqual(['Stop', 'Run', 'Undo', 'Step'])

        emulator.terminated = true
        flushSync()
        expect(labels()).toEqual(['Stop', 'Restart', 'Undo', 'Step'])
        const restart = button('Restart')!
        expect(restart.disabled).toBe(false)
        expect(restart.classList.contains('primary')).toBe(false)
        expect(tooltipText(restart)).toBe('Reset the program to the start')

        press('Restart')
        //Stop's clear, and the Build of the same Program, with the column kept meanwhile
        expect(cleared()).toBe(1)
        expect(session.building).toBe(true)
        expect(session.restarting).toBe(true)
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(built).toEqual(['main.s', 'main.s'])
        expect(session.restarting).toBe(false)
        expect(session.debugSession).toBe(true)
        expect(labels()).toEqual(['Stop', 'Run', 'Undo', 'Step'])
        expect(button('Run')!.classList.contains('primary')).toBe(true)
    })

    it('is the button Run was, as wide as its widest face, so nothing beside it moves', async () => {
        const { session, emulator, button, press } = setup()
        press('Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        const run = button('Run')!
        const faces = () =>
            [...run.querySelectorAll('.run-face')].map((face) => ({
                word: face.textContent?.trim(),
                shown: !face.classList.contains('reserved')
            }))
        expect(faces()).toEqual([
            { word: 'Run', shown: true },
            { word: 'Pause', shown: false },
            { word: 'Restart', shown: false }
        ])
        emulator.terminated = true
        flushSync()
        expect(button('Restart')).toBe(run)
        expect(faces().filter((face) => face.shown)).toEqual([{ word: 'Restart', shown: true }])
    })

    it('is not offered while the program can still go on', async () => {
        const { session, emulator, labels, press } = setup()
        press('Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        //stopped at a Breakpoint, or waiting for input: Run still has something to do
        emulator.terminated = false
        flushSync()
        expect(labels()).not.toContain('Restart')
        expect(labels()).toContain('Run')
    })

    it('ends the Debug session when its Build fails', async () => {
        const { session, emulator, press } = setup()
        press('Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        emulator.terminated = true
        flushSync()
        emulator.compile = async () => {
            throw new Error('the assembler went away')
        }
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        press('Restart')
        await vi.waitFor(() => expect(session.building).toBe(false))
        expect(session.restarting).toBe(false)
        expect(session.debugSession).toBe(false)
    })
})
