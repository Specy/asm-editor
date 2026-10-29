/**
 * The Emulator's notes on a program's run in the Workbench's Log: after the Build that ran it to
 * `main` and after the exit they explain, never for a test run, whose entry already says how each
 * Testcase went ([binary-import.md](../../../../../docs/design/binary-import.md), decision 17,
 * plan M12).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import type { CycleCount, EmulatorNote } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { TestcaseResult } from '#lib/Project.svelte.ts'
import { ExecutionSupersededError } from '#lib/languages/ExecutionController.ts'
import { toast } from '#stores/toastStore.ts'
import LogView from '#cmp/specific/workbench/LogView.svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { appendLog, noteEntry } from './workbenchLog'

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

let nextId = 0
const note = (text: string, tone: EmulatorNote['tone'] = 'warning'): EmulatorNote => ({
    id: ++nextId,
    tone,
    text
})

function setup() {
    const fixture = editorGroupsFixture('X86', {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain', content: 'nop' } }
    })
    disposers.push(fixture.dispose)
    const emulator = fixture.emulator as typeof fixture.emulator & {
        termination?: unknown
        executionTime: number
        test: () => Promise<never[]>
    }
    emulator.executionTime = 12
    flushSync()
    return { ...fixture, emulator }
}

const kinds = (log: readonly { kind: string; text: string }[]) =>
    log.map((entry) => `${entry.kind}: ${entry.text}`)

describe('a Build that Stop ends part way', () => {
    it('logs nothing and leaves the bottom panel, while its run to main owns the Core', async () => {
        const { session, emulator } = setup()
        let release!: () => void
        let stepped = 0
        emulator.compile = () =>
            new Promise<void>((resolve) => {
                //the run to main: the program exists, but the Build still owns it
                emulator.canExecute = true
                release = resolve
            })
        ;(emulator as unknown as { step: () => Promise<boolean> }).step = async () => {
            stepped++
            return false
        }
        emulator.clear = () => {
            emulator.canExecute = false
        }
        session.bottomTab = 'log'
        const build = session.build()
        flushSync()
        expect(session.building).toBe(true)
        //Step waits for the Build, from the dock as from the shortcut
        await session.step()
        expect(stepped).toBe(0)
        session.stop()
        release()
        await build
        flushSync()
        expect(session.log).toEqual([])
        expect(session.bottomTab).toBe('log')
        expect(session.building).toBe(false)
    })
})

describe('a test run that a clear ends part way', () => {
    /**
     * A test run as the Emulator's ends at a `clear()`, whoever made it: failing with
     * `ExecutionSupersededError` once the Testcase it cut short is over, which a Core that cannot
     * be halted finishes unseen.
     */
    function endedByClear(emulator: ReturnType<typeof setup>['emulator']) {
        let release: (() => void) | undefined
        ;(emulator as unknown as { test: () => Promise<unknown[]> }).test = () =>
            new Promise((_, reject) => (release = () => reject(new ExecutionSupersededError())))
        return {
            started: () => release !== undefined,
            release: () => release?.()
        }
    }

    it('shows no results and logs nothing when Stop ended it', async () => {
        const { session, emulator } = setup()
        const run = endedByClear(emulator)
        session.bottomTab = 'terminal'
        const testing = session.test()
        await vi.waitFor(() => expect(run.started()).toBe(true))
        session.stop()
        run.release()
        await testing
        flushSync()
        expect(session.testcasesResult).toEqual([])
        expect(session.log).toEqual([])
        expect(session.bottomTab).toBe('terminal')
        expect(session.running).toBe(false)
    })

    it('drops the run without an error when the clear was not its Stop, such as the agent Building', async () => {
        const { session, emulator } = setup()
        const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        const run = endedByClear(emulator)
        //the results of the run before, which this one never replaced
        const earlier = [{ errors: [], passed: true, testcase: {} }] as unknown as TestcaseResult[]
        session.testcasesResult = earlier
        session.bottomTab = 'terminal'
        const testing = session.test()
        await vi.waitFor(() => expect(run.started()).toBe(true))
        run.release()
        await testing
        flushSync()
        expect(error).not.toHaveBeenCalled()
        expect(session.testcasesResult).toEqual(earlier)
        expect(session.log).toEqual([])
        expect(session.bottomTab).toBe('terminal')
        expect(session.running).toBe(false)
    })
})

describe('notes in the Log', () => {
    it("follow the Build's own entry, whatever the Build ran into", async () => {
        const { session, emulator } = setup()
        emulator.compile = async () => {
            emulator.notes = [
                note("This emulator doesn't have libz.so.6, so the program may not start.")
            ]
            //effects run while the Build is still going
            await tick()
            emulator.notes = [
                ...emulator.notes,
                note('The program did not reach main within 50,000,000 instructions')
            ]
            await tick()
            emulator.canExecute = true
        }
        await session.build()
        flushSync()
        expect(kinds(session.log)).toEqual([
            expect.stringMatching(/^build: Built main\.asm in /),
            "note: This emulator doesn't have libz.so.6, so the program may not start.",
            'note: The program did not reach main within 50,000,000 instructions'
        ])
        expect(session.log.slice(1).map((entry) => entry.tone)).toEqual(['warning', 'warning'])
    })

    it('follow the exit they explain, and come as the run meets them', async () => {
        const { session, emulator } = setup()
        emulator.compile = async () => {
            emulator.canExecute = true
        }
        await session.build()
        flushSync()
        emulator.notes = [
            note('`getcpu` (syscall 309) is not implemented; the call returned ENOSYS')
        ]
        flushSync()
        expect(session.log.at(-1)).toMatchObject({
            kind: 'note',
            text: '`getcpu` (syscall 309) is not implemented; the call returned ENOSYS'
        })
        //the end and the note about it arrive together, as reading the end makes the note
        emulator.terminated = true
        emulator.termination = {
            kind: 'signal',
            number: 4,
            name: 'SIGILL',
            description: 'Illegal instruction',
            unsupported: "stopped: AVX-512 isn't supported yet"
        }
        emulator.notes = [
            ...emulator.notes,
            note(
                "The program stopped at `vaddps zmm0, zmm1, zmm2` (`0x555555555195`): this emulator doesn't support AVX-512 instructions yet."
            )
        ]
        flushSync()
        expect(kinds(session.log).slice(-2)).toEqual([
            "exit: Ran in 12ms, stopped: AVX-512 isn't supported yet",
            "note: The program stopped at `vaddps zmm0, zmm1, zmm2` (`0x555555555195`): this emulator doesn't support AVX-512 instructions yet."
        ])
        expect(session.log.at(-2)?.tone).toBe('error')
        //each note once, also when the list is read again
        emulator.notes = [...emulator.notes]
        flushSync()
        expect(session.log.filter((entry) => entry.kind === 'note')).toHaveLength(2)
    })

    it('follow an exit that says the cycles of a Target that counts them', async () => {
        const { session, emulator } = setup()
        emulator.compile = async () => {
            emulator.canExecute = true
        }
        await session.build()
        flushSync()
        //the counter as the M68K shows it above the PC, which the exit line ends with
        ;(emulator as typeof emulator & { cycles?: CycleCount }).cycles = {
            total: 1_234_567n,
            last: 8
        }
        emulator.terminated = true
        emulator.termination = { kind: 'exit' }
        flushSync()
        expect(kinds(session.log).at(-1)).toBe('exit: Ran 1,234,567 cycles in 12ms')
    })

    it('are left out of a test run, whose entry says how each Testcase went', async () => {
        const { session, emulator } = setup()
        emulator.test = async () => {
            emulator.notes = [
                note('`getcpu` (syscall 309) is not implemented; the call returned ENOSYS')
            ]
            await tick()
            return []
        }
        await session.test()
        flushSync()
        expect(session.log.map((entry) => entry.kind)).toEqual(['test'])
        //and stay out once the test run is over
        emulator.notes = [...emulator.notes]
        flushSync()
        expect(session.log.map((entry) => entry.kind)).toEqual(['test'])
    })

    it('draw their code apart from their words', () => {
        const target = document.createElement('div')
        document.body.append(target)
        const entries = appendLog(
            [],
            noteEntry({
                tone: 'warning',
                text: '`ptrace` (syscall 101) is not implemented; the call returned ENOSYS'
            }),
            1,
            0
        )
        const view = mount(LogView, { target, props: { entries } })
        flushSync()
        disposers.push(() => {
            void unmount(view)
            target.remove()
        })
        const text = target.querySelector('.note')!
        expect(text.querySelector('code')?.textContent).toBe('ptrace')
        expect(text.textContent).toBe(
            'ptrace (syscall 101) is not implemented; the call returned ENOSYS'
        )
    })
})
