import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import MemoryControls from './MemoryControls.svelte'
import type { Emulator } from '#lib/languages/Emulator.ts'
import {
    RegisterSize,
    type DataLabel,
    type MemoryRegion
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { memoryRegionColor } from '#lib/languages/memoryRegions.ts'

vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))
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
function render(
    built = true,
    showRegions = true,
    extra: { regions: MemoryRegion[]; labels: DataLabel[] } = { regions: [], labels: [] }
) {
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
            },
            ...extra.regions
        ],
        dataLabels: [
            { name: 'buffer', section: '.data', address: 0x1003n, fromLibrary: false },
            { name: 'errno', section: '.data', address: 0x1010n, fromLibrary: true },
            ...extra.labels
        ],
        resolveMemoryLabel: (name: string) =>
            new Map([
                ['buffer', 0x1003n],
                ['main', 0x2000n],
                ['DAT_singing_perch', 0x3010n]
            ]).get(name)
    } as unknown as Emulator
    const app = mount(MemoryControls, {
        target,
        props: {
            emulator,
            currentAddress: 0x1000n,
            bytesPerPage: 8,
            memorySize: 0xffffffffn,
            systemSize: RegisterSize.Long,
            onAddressChange: change,
            showRegions
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
        target.querySelector<HTMLButtonElement>('[aria-label="Search address"]')!.click()
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
it('writes 0x before the text only while it is hex digits, not before a name', () => {
    const ui = render()
    const prefix = () => ui.target.querySelector('.hex-address-label')?.textContent?.trim()
    expect(prefix()).toBe('0x')
    //an Invented name of an Executable's Listing, which used to read as 0xsinging_perch
    ui.type('DAT_singing_perch')
    expect(prefix()).toBeUndefined()
    ui.search()
    expect(ui.change).toHaveBeenLastCalledWith(0x3010n)
    //the address it went to, which is a number again
    expect(ui.input.value).toBe('00003010')
    expect(prefix()).toBe('0x')
    ui.type('buffer+16')
    expect(prefix()).toBeUndefined()
    ui.type('')
    expect(prefix()).toBe('0x')
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

it('leaves the region picker out when the regions are hidden, the page buttons still there', () => {
    const ui = render(true, false)
    expect(ui.target.querySelector('.region-picker')).toBeNull()
    expect(ui.target.querySelector('[aria-label="Previous page"]')).not.toBeNull()
    expect(ui.target.querySelector('[aria-label="Next page"]')).not.toBeNull()
})

it('lists the Arguments as a region of their own, with their parts under it', async () => {
    const ui = render(true, true, {
        regions: [
            {
                id: 'arguments',
                name: 'Arguments',
                section: 'Arguments',
                kind: 'arguments',
                start: 0x7fffffd4n,
                end: 0x7ffffffcn
            }
        ],
        labels: [
            { name: 'argv', section: 'Arguments', address: 0x7fffffd4n, fromLibrary: false },
            {
                name: 'argv[0]',
                section: 'Arguments',
                address: 0x7fffffe5n,
                fromLibrary: false,
                preview: './main'
            },
            {
                name: 'argv[1]',
                section: 'Arguments',
                address: 0x7fffffecn,
                fromLibrary: false,
                preview: 'hello'
            }
        ]
    })
    ui.target.querySelector<HTMLButtonElement>('[aria-label="Memory regions"]')!.click()
    flushSync()
    await tick()
    flushSync()
    await tick()
    const options = [...ui.target.querySelectorAll<HTMLElement>('[role="option"]')]
    const region = options.find(
        (row) => !row.querySelector('.data-label') && row.textContent?.includes('Arguments')
    )!
    expect(region.textContent).toContain('Arguments · argv')
    expect(region.textContent).toMatch(/0x7fffffd4\s*·\s*40 B/)
    expect(region.querySelector<HTMLElement>('.swatch')?.style.background).toBe(
        memoryRegionColor('arguments')
    )
    const parts = options
        .filter((row) => row.querySelector('.data-label'))
        .map((row) => row.querySelector('.data-label > span')?.textContent)
    expect(parts).toEqual(['buffer', 'argv', 'argv[0] "./main"', 'argv[1] "hello"'])
    const filter = ui.target.querySelector<HTMLInputElement>(
        '[aria-label="Filter memory regions"]'
    )!
    filter.value = 'hello'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    const filtered = [...ui.target.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(filtered.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Arguments'),
        expect.stringContaining('argv[1] "hello"')
    ])
    filtered[1].click()
    flushSync()
    expect(ui.change).toHaveBeenLastCalledWith(0x7fffffe8n)
})

it('lists a demangled label by its name, with the raw one in its tooltip and its filter', async () => {
    const ui = render(true, true, {
        regions: [],
        labels: [
            {
                name: '_ZSt4cout@GLIBCXX_3.4',
                displayName: 'std::cout@GLIBCXX_3.4',
                section: '.data',
                address: 0x1018n,
                fromLibrary: false
            }
        ]
    })
    ui.target.querySelector<HTMLButtonElement>('[aria-label="Memory regions"]')!.click()
    flushSync()
    await tick()
    flushSync()
    await tick()
    const labelRows = () =>
        [...ui.target.querySelectorAll<HTMLElement>('[role="option"] .data-label')].map((row) => ({
            text: row.querySelector('span')?.textContent,
            title: row.getAttribute('title')
        }))
    expect(labelRows()).toEqual([
        { text: 'buffer', title: null },
        { text: 'std::cout@GLIBCXX_3.4', title: 'std::cout@GLIBCXX_3.4\n_ZSt4cout@GLIBCXX_3.4' }
    ])
    const filter = ui.target.querySelector<HTMLInputElement>(
        '[aria-label="Filter memory regions"]'
    )!
    for (const text of ['_ZSt4cout', 'std::cout']) {
        filter.value = text
        filter.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        expect(labelRows().map((row) => row.text)).toEqual(['std::cout@GLIBCXX_3.4'])
    }
})
