/**
 * The Emulator's notes on a program's run in the Workbench's Log: after the Build that ran it to
 * `main` and after the exit they explain, never for a test run, whose entry already says how each
 * Testcase went ([binary-import.md](../../../../../docs/design/binary-import.md), decision 17,
 * plan M12).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import type { EmulatorNote } from '#lib/languages/commonLanguageFeatures.svelte.ts'
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

describe('notes in the Log', () => {
    it("follow the Build's own entry, whatever the Build ran into", async () => {
        const { session, emulator } = setup()
        emulator.compile = async () => {
            emulator.notes = [note('libz.so.6 is not one of the bundled libraries')]
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
            'note: libz.so.6 is not one of the bundled libraries',
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
            description: 'Illegal instruction'
        }
        emulator.notes = [
            ...emulator.notes,
            note(
                'The program ran `vmovd xmm0, edi` at `0x555555555195`, which the emulator does not support'
            )
        ]
        flushSync()
        expect(kinds(session.log).slice(-2)).toEqual([
            'exit: Ran in 12ms, Illegal instruction (signal 4)',
            'note: The program ran `vmovd xmm0, edi` at `0x555555555195`, which the emulator does not support'
        ])
        //each note once, also when the list is read again
        emulator.notes = [...emulator.notes]
        flushSync()
        expect(session.log.filter((entry) => entry.kind === 'note')).toHaveLength(2)
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
            unmount(view)
            target.remove()
        })
        const text = target.querySelector('.note')!
        expect(text.querySelector('code')?.textContent).toBe('ptrace')
        expect(text.textContent).toBe(
            'ptrace (syscall 101) is not implemented; the call returned ENOSYS'
        )
    })
})
