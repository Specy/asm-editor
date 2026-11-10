/**
 * The execution dock's Step over and Step out buttons
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): drawn after Step when the
 * host offers them, disabled with Step, and Step out also while there is no routine to leave.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ExecutionDock from './ExecutionDock.svelte'

let cleanup = () => {}
afterEach(() => cleanup())

type DockProps = Partial<{
    running: boolean
    executionDisabled: boolean
    canStepOut: boolean
    onStepOver: () => void
    onStepOut: () => void
}>

function dock(props: DockProps) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionDock, {
        target,
        props: {
            debugging: true,
            building: false,
            running: false,
            buildDisabled: false,
            executionDisabled: false,
            canUndo: false,
            onBuild: () => {},
            onStop: () => {},
            onRun: () => {},
            onPause: () => {},
            onUndo: () => {},
            onStep: () => {},
            ...props
        }
    })
    flushSync()
    cleanup = () => {
        void unmount(app)
        target.remove()
    }
    const button = (name: string) =>
        target.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
    return { button, names: () => [...target.querySelectorAll('button')].map((b) => b.ariaLabel) }
}

describe('the dock', () => {
    it('draws Step over and Step out after Step when the host offers them', () => {
        const { names } = dock({ onStepOver: () => {}, onStepOut: () => {}, canStepOut: true })
        expect(names()).toEqual(['Stop', 'Run', 'Undo', 'Step', 'Step over', 'Step out'])
    })

    it('joins the three in one group, Step first', () => {
        const { button } = dock({ onStepOver: () => {}, onStepOut: () => {}, canStepOut: true })
        const group = button('Step')!.parentElement!
        expect(group.getAttribute('role')).toBe('group')
        expect([...group.querySelectorAll('button')].map((b) => b.ariaLabel)).toEqual([
            'Step',
            'Step over',
            'Step out'
        ])
        expect(button('Step over')!.textContent!.trim()).toBe('over')
    })

    it('draws neither for a host that offers none', () => {
        const { button } = dock({})
        expect(button('Step')).not.toBeNull()
        expect(button('Step over')).toBeNull()
        expect(button('Step out')).toBeNull()
        expect(button('Step')!.parentElement!.getAttribute('role')).toBeNull()
    })

    it('runs the command its button names', () => {
        const onStepOver = vi.fn()
        const onStepOut = vi.fn()
        const { button } = dock({ onStepOver, onStepOut, canStepOut: true })
        button('Step over')!.click()
        button('Step out')!.click()
        expect(onStepOver).toHaveBeenCalledOnce()
        expect(onStepOut).toHaveBeenCalledOnce()
    })

    it('disables Step out while there is no routine to leave', () => {
        const { button } = dock({ onStepOver: () => {}, onStepOut: () => {}, canStepOut: false })
        expect(button('Step over')!.disabled).toBe(false)
        expect(button('Step out')!.disabled).toBe(true)
    })

    it('disables both with Step: during a Run and while the program cannot execute', () => {
        for (const props of [{ running: true }, { executionDisabled: true }]) {
            const { button } = dock({
                onStepOver: () => {},
                onStepOut: () => {},
                canStepOut: true,
                ...props
            })
            expect(button('Step')!.disabled).toBe(true)
            expect(button('Step over')!.disabled).toBe(true)
            expect(button('Step out')!.disabled).toBe(true)
            cleanup()
        }
    })
})
