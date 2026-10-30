import { afterEach, describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
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

describe('groups', () => {
    function renderGroups() {
        HTMLElement.prototype.showPopover = () => {}
        HTMLElement.prototype.scrollIntoView = () => {}
        HTMLElement.prototype.animate = (() => ({
            cancel() {},
            finish() {},
            onfinish: null
        })) as unknown as typeof HTMLElement.prototype.animate
        window.matchMedia = vi.fn().mockReturnValue({ matches: false })
        globalThis.CSS ??= {} as typeof CSS
        CSS.escape ??= (text: string) => text
        const target = document.createElement('div')
        document.body.appendChild(target)
        const groups = { Fruit: ['Apple', 'Banana'], Vegetables: ['Carrot'] }
        const folded = new SvelteSet<string>()
        const changes: string[] = []
        const select = mount(Select<string>, {
            target,
            props: {
                get options() {
                    return Object.entries(groups).flatMap(([group, items]) => [
                        { key: group, value: '', disabled: true, expanded: !folded.has(group) },
                        ...(folded.has(group)
                            ? []
                            : items.map((item) => ({ key: item, value: item })))
                    ])
                },
                value: 'Apple',
                ariaLabel: 'Food',
                onChange: (value: string) => changes.push(value),
                onToggle: (option) => {
                    const group = String(option.key)
                    if (folded.has(group)) folded.delete(group)
                    else folded.add(group)
                }
            }
        })
        mounted.push(() => unmount(select))
        flushSync()
        const control = target.querySelector<HTMLButtonElement>('[role="combobox"]')!
        //what a screen reader reads, without the template's line breaks
        const text = (row: Element | null) =>
            row?.textContent?.replace(/\s+/g, ' ').replace(' ,', ',').trim()
        return {
            changes,
            control,
            rows: () => [...target.querySelectorAll('[role="option"]')].map(text),
            active: () =>
                text(document.getElementById(control.getAttribute('aria-activedescendant') ?? '')),
            type: (key: string) => {
                control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
                flushSync()
            },
            open: async () => {
                control.click()
                flushSync()
                await tick()
                await tick()
            }
        }
    }

    it('reaches a group row by the arrow keys and folds it with Left, Right, Enter and a click, choosing nothing', async () => {
        const select = renderGroups()
        await select.open()
        expect(select.active()).toBe('Apple')
        select.type('ArrowUp')
        expect(select.active()).toBe('Fruit, expanded')
        select.type('ArrowLeft')
        expect(select.rows()).toEqual(['Fruit, collapsed', 'Vegetables, expanded', 'Carrot'])
        expect(select.active()).toBe('Fruit, collapsed')
        //Left again leaves a folded group as it is
        select.type('ArrowLeft')
        expect(select.rows()).toHaveLength(3)
        select.type('ArrowRight')
        expect(select.rows()).toHaveLength(5)
        select.type('Enter')
        expect(select.rows()).toHaveLength(3)
        //a folded group's rows are not stepped through
        select.type('ArrowDown')
        expect(select.active()).toBe('Vegetables, expanded')
        //Left on an option that heads no group does nothing
        select.type('ArrowDown')
        select.type('ArrowLeft')
        expect(select.rows()).toHaveLength(3)
        document.querySelector<HTMLElement>('[role="option"]')!.click()
        flushSync()
        expect(select.rows()).toHaveLength(5)
        expect(select.changes).toEqual([])
        expect(select.control.getAttribute('aria-expanded')).toBe('true')
        expect(document.activeElement).toBe(select.control)
    })
})
