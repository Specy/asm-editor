import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import MemoryControls from './MemoryControls.svelte'
import type { Emulator } from '$lib/languages/Emulator'
import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))
beforeAll(() => {
    HTMLElement.prototype.showPopover = () => {}
    HTMLElement.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        play() {},
        pause() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof HTMLElement.prototype.animate
    HTMLElement.prototype.scrollIntoView = () => {}
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    globalThis.CSS ??= {} as typeof CSS
    CSS.escape ??= (text: string) => text
})
let dispose = () => {}
afterEach(() => dispose())
function render(built = true) {
    const target = document.createElement('div')
    document.body.append(target)
    const change = vi.fn()
    const emulator = {
        buildSources: built ? { entry: 'main.s', files: {} } : undefined,
        memoryRegions: [
            {
                id: 'data',
                name: '.data',
                section: '.data',
                kind: 'data',
                start: 0x1000n,
                end: 0x1020n
            }
        ],
        dataLabels: [
            { name: 'buffer', section: '.data', address: 0x1003n, fromLibrary: false },
            { name: 'errno', section: '.data', address: 0x1010n, fromLibrary: true }
        ],
        resolveMemoryLabel: (name: string) =>
            name === 'buffer' ? 0x1003n : name === 'main' ? 0x2000n : undefined
    } as unknown as Emulator
    const app = mount(MemoryControls, {
        target,
        props: {
            emulator,
            currentAddress: 0x1000n,
            bytesPerPage: 8,
            memorySize: 0xffffffffn,
            systemSize: RegisterSize.Long,
            onAddressChange: change
        }
    })
    flushSync()
    dispose = () => {
        unmount(app)
        target.remove()
    }
    const input = target.querySelector<HTMLInputElement>('[aria-label="Address or label"]')!
    const type = (value: string) => {
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
    }
    const search = () => {
        target.querySelector<HTMLButtonElement>('[title="Search address"]')!.click()
        flushSync()
    }
    return { target, change, type, search, input }
}
it('keeps partially typed labels valid during rendering and submits label offsets and code labels', () => {
    const ui = render()
    ui.type('buf')
    expect(ui.input.value).toBe('buf')
    ui.type('buffer+16')
    ui.search()
    expect(ui.change).toHaveBeenLastCalledWith(0x1010n)
    ui.type('main')
    ui.search()
    expect(ui.change).toHaveBeenLastCalledWith(0x2000n)
    ui.type('unknown')
    ui.search()
    expect(ui.target.querySelector('[role="alert"]')?.textContent).toContain('Unknown label')
})
it('disables the picker before Build and reports why a label cannot resolve', () => {
    const ui = render(false)
    expect(
        ui.target.querySelector<HTMLButtonElement>('[aria-label="Memory regions"]')?.disabled
    ).toBe(true)
    ui.type('buffer')
    ui.search()
    expect(ui.target.querySelector('[role="alert"]')?.textContent).toContain('Build')
})
it('jumps to a data label and filters library labels until the toggle is checked', async () => {
    const ui = render()
    ui.target.querySelector<HTMLButtonElement>('[aria-label="Memory regions"]')!.click()
    flushSync()
    await tick()
    flushSync()
    await tick()
    expect(ui.target.querySelector('[role="listbox"]')?.textContent).toContain('buffer')
    expect(ui.target.querySelector('[role="listbox"]')?.textContent).not.toContain('errno')
    const toggle = ui.target.querySelector<HTMLButtonElement>('[role="switch"]')!
    toggle.click()
    flushSync()
    expect(ui.target.querySelector('[role="listbox"]')?.textContent).toContain('errno')
    const filter = ui.target.querySelector<HTMLInputElement>(
        '[aria-label="Filter memory regions"]'
    )!
    filter.value = 'buffer'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    expect(ui.target.querySelector('[role="listbox"]')?.textContent).not.toContain('errno')
    const row = [...ui.target.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (row) => row.querySelector('.data-label') && row.textContent?.includes('buffer')
    )!
    row.click()
    flushSync()
    expect(ui.change).toHaveBeenLastCalledWith(0x1000n)
})
it('uses displayed label names for keyboard type ahead and returns focus on filter Escape', async () => {
    const ui = render()
    const button = ui.target.querySelector<HTMLButtonElement>('[aria-label="Memory regions"]')!
    button.click()
    flushSync()
    await tick()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))
    flushSync()
    await tick()
    const active = document.getElementById(button.getAttribute('aria-activedescendant')!)
    expect(active?.querySelector('.data-label')?.textContent).toContain('buffer')
    const filter = ui.target.querySelector<HTMLInputElement>(
        '[aria-label="Filter memory regions"]'
    )!
    filter.focus()
    filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    flushSync()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
})
