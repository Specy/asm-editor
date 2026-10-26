import { afterEach, describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import Select from './Select.svelte'

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

function render() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const changes: string[] = []
    const props = $state({
        options: ['X86', 'M68K', 'MIPS', 'RISC-V'].map((language) => ({
            key: language,
            value: language
        })),
        value: 'X86',
        ariaLabel: 'Instruction set',
        onChange: (value: string) => changes.push(value)
    })
    const select = mount(Select<string>, { target, props })
    mounted.push(() => unmount(select))
    flushSync()
    const control = target.querySelector<HTMLButtonElement>('[role="combobox"]')!
    return {
        props,
        changes,
        control,
        type: (key: string) => {
            control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
            flushSync()
        }
    }
}

describe('type ahead on a closed list', () => {
    it('chooses the first option that starts with the letters, as a native select does', () => {
        //the letters typed close together make one match
        vi.useFakeTimers()
        onTestFinished(() => void vi.useRealTimers())
        const select = render()
        select.type('m')
        expect(select.props.value).toBe('M68K')
        expect(select.changes).toEqual(['M68K'])
        expect(select.control.getAttribute('aria-expanded')).toBe('false')
        expect(select.control.textContent).toContain('M68K')
        //the letters that follow narrow the match
        select.type('i')
        expect(select.props.value).toBe('MIPS')
        //a letter typed later starts a new match, and one naming what it holds changes nothing
        vi.advanceTimersByTime(1000)
        select.type('r')
        vi.advanceTimersByTime(1000)
        select.type('r')
        expect(select.props.value).toBe('RISC-V')
        expect(select.changes).toEqual(['M68K', 'MIPS', 'RISC-V'])
    })
})
