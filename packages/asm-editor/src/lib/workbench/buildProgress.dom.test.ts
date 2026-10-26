/**
 * A Build never waits silently ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decision 2): while it goes on, the dock says what it waits for and offers Cancel, which goes back
 * to editing whatever the Build waits on, and a Build whose download failed says what could not be
 * downloaded and to Build again, in the Terminal, the Log and a toast.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { BuildDownloadError } from '#lib/languages/BaseEmulator.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { ShortcutAction } from '#stores/shortcutsStore.ts'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

/**
 * An x86 Project whose pane shows its Entry, and that pane's dock. The Emulator's Build is the
 * test's to write: by default each ends only when the test calls its `finish`, as one waiting on
 * a download that stalled does when the Core gives the download up.
 */
function setup() {
    const fixture = editorGroupsFixture('X86', {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain', content: 'nop' } }
    })
    disposers.push(fixture.dispose)
    const { session, emulator } = fixture
    const build = {
        started: 0,
        signal: undefined as AbortSignal | undefined,
        cleared: 0,
        finish: [] as (() => void)[]
    }
    emulator.compile = (_historySize, _sources, signal) => {
        build.started += 1
        build.signal = signal
        return new Promise<void>((resolve) => build.finish.push(resolve))
    }
    emulator.clear = () => {
        build.cleared += 1
        emulator.canExecute = false
        emulator.buildPhase = undefined
    }
    session.selectFile('main.asm', session.groups[0])
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
    return { ...fixture, build, button, labels, press }
}

describe('a Build in progress', () => {
    it('says what it waits for, and Cancel goes back to editing', async () => {
        const { session, emulator, build, button, labels, press } = setup()
        const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        press('Build')
        expect(session.building).toBe(true)
        const busy = button('Build')!
        expect(busy.disabled).toBe(true)
        expect(busy.getAttribute('aria-busy')).toBe('true')
        expect(busy.textContent?.trim()).toBe('Building…')
        expect(labels()).toEqual(['Build', 'Cancel the Build'])

        emulator.buildPhase = 'Downloading libstdc++.so.6…'
        flushSync()
        expect(busy.textContent?.trim()).toBe('Downloading libstdc++.so.6…')
        expect(tooltipText(busy)).toBe('Downloading libstdc++.so.6…')

        //the Build's download never ends, and Cancel still does
        press('Cancel the Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(build.signal?.aborted).toBe(true)
        expect(build.cleared).toBe(1)
        expect(session.debugSession).toBe(false)
        expect(session.log).toEqual([])
        expect(error).not.toHaveBeenCalled()
        expect(labels()).toEqual(['Build'])
        expect(button('Build')!.disabled).toBe(false)
        expect(button('Build')!.textContent?.trim()).toBe('Build')

        //and Build can be pressed again, which says what it waits for while the Core still
        //finishes the cancelled one
        press('Build')
        expect(build.started).toBe(2)
        expect(session.building).toBe(true)
        expect(button('Build')!.textContent?.trim()).toBe('Finishing the cancelled Build…')
        build.finish[0]()
        await vi.waitFor(() => expect(button('Build')!.textContent?.trim()).toBe('Building…'))
    })

    it('shows its run to main as the Build still, which Cancel ends as Stop does', async () => {
        const { session, emulator, build, labels, button, press } = setup()
        emulator.compile = (_historySize, _sources, signal) => {
            build.signal = signal
            //the program exists, but the Build still runs it to `main`
            emulator.canExecute = true
            emulator.buildPhase = 'Starting the program…'
            return new Promise<void>(() => {})
        }
        press('Build')
        expect(session.debugSession).toBe(true)
        //Build and Cancel, not the session's controls, until the Build is done
        expect(labels()).toEqual(['Build', 'Cancel the Build'])
        expect(button('Build')!.textContent?.trim()).toBe('Starting the program…')
        press('Cancel the Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(session.debugSession).toBe(false)
        expect(session.log).toEqual([])
        expect(labels()).toEqual(['Build'])
    })

    it('ends at Stop, and at the Clear execution shortcut, as at Cancel', async () => {
        const { session, build, labels, press } = setup()
        press('Build')
        session.stop()
        await vi.waitFor(() => expect(session.building).toBe(false))
        expect(build.signal?.aborted).toBe(true)
        press('Build')
        expect(session.building).toBe(true)
        ;(session as unknown as { runShortcut(type: ShortcutAction): void }).runShortcut(
            ShortcutAction.ClearExecution
        )
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(build.signal?.aborted).toBe(true)
        expect(session.log).toEqual([])
        expect(labels()).toEqual(['Build'])
    })

    it('ends a failed download with what to do, in the Terminal, the Log and a toast', async () => {
        const { session, emulator, button, press } = setup()
        const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        const message =
            "Couldn't download libstdc++.so.6 (no response for 20 seconds). Check your internet connection, then press Build again."
        emulator.compile = async () => {
            //what GenericEmulator tells the Terminal before it throws
            emulator.errors = [message]
            throw new BuildDownloadError('libstdc++.so.6', 'no response for 20 seconds')
        }
        session.bottomTab = 'problems'
        press('Build')
        await vi.waitFor(() => expect(session.building).toBe(false))
        flushSync()
        expect(error).toHaveBeenCalledWith(message)
        expect(session.errorStrings).toBe(message)
        //there is nothing in the Problems to show
        expect(session.bottomTab).toBe('terminal')
        expect(session.log).toEqual([
            expect.objectContaining({
                kind: 'build',
                tone: 'error',
                text: expect.stringMatching(/^Build of main\.asm failed in /),
                details: [{ tone: 'error', text: message }]
            })
        ])
        expect(button('Build')!.disabled).toBe(false)
        expect(button('Build')!.textContent?.trim()).toBe('Build')
        expect(button('Cancel the Build')).toBeNull()
    })
})
