/**
 * Step over and Step out from the session
 * ([stepping-plan.md](../../../../../docs/design/stepping-plan.md)): their shortcuts, and the gate
 * that keeps every other command out of one that is running its routine.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { ShortcutAction } from '#stores/shortcutsStore.ts'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte.ts'

let dispose = () => {}
afterEach(() => dispose())

/** A session over a fake Emulator that counts the commands it is given. */
function setup() {
    const fixture = editorGroupsFixture()
    dispose = fixture.dispose
    const emulator = Object.assign(fixture.emulator, {
        canExecute: true,
        interrupt: undefined,
        stepWaiting: false,
        stepping: false,
        canStepOut: true,
        canUndo: true,
        step: vi.fn(async () => false),
        stepOver: vi.fn(async () => ({ terminated: false, completed: true })),
        stepOut: vi.fn(async () => ({ terminated: false, completed: true })),
        run: vi.fn(async () => 0),
        undo: vi.fn(() => 1),
        pause: vi.fn()
    })
    const press = (type: ShortcutAction) =>
        (fixture.session as unknown as { runShortcut(type: ShortcutAction): void }).runShortcut(
            type
        )
    return { session: fixture.session, emulator, press }
}

describe('the step shortcuts', () => {
    it('run the step each one names', async () => {
        const { emulator, press } = setup()
        press(ShortcutAction.Step)
        press(ShortcutAction.StepOver)
        press(ShortcutAction.StepOut)
        await vi.waitFor(() => expect(emulator.stepOut).toHaveBeenCalledOnce())
        expect(emulator.step).toHaveBeenCalledOnce()
        expect(emulator.stepOver).toHaveBeenCalledOnce()
    })

    it('leave Step out alone while there is no routine to leave', async () => {
        const { session, emulator, press } = setup()
        emulator.canStepOut = false
        press(ShortcutAction.StepOut)
        await session.stepOut()
        expect(emulator.stepOut).not.toHaveBeenCalled()
    })
})

describe('a Step over or a Step out in flight', () => {
    it('keeps Step, Step over, Step out and Undo out, from their buttons and their shortcuts', async () => {
        const { session, emulator, press } = setup()
        emulator.stepping = true
        press(ShortcutAction.Step)
        press(ShortcutAction.StepOver)
        press(ShortcutAction.StepOut)
        press(ShortcutAction.Undo)
        await session.step()
        await session.stepOver()
        await session.stepOut()
        expect(emulator.step).not.toHaveBeenCalled()
        expect(emulator.stepOver).not.toHaveBeenCalled()
        expect(emulator.stepOut).not.toHaveBeenCalled()
        expect(emulator.undo).not.toHaveBeenCalled()
    })

    it('is paused by Run, from the button it has not yet turned to Pause and from the shortcut', async () => {
        const { session, emulator, press } = setup()
        emulator.stepping = true
        await session.run()
        press(ShortcutAction.RunCode)
        expect(emulator.pause).toHaveBeenCalledTimes(2)
        expect(emulator.run).not.toHaveBeenCalled()
        expect(session.running).toBe(false)
    })
})
