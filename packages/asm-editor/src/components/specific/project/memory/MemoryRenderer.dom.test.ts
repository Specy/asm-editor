import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import MemoryRenderer from './MemoryRenderer.svelte'
import type { MemoryCell } from './memoryTabUtils'
import { type DiffedMemory, RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { memoryRegionColor } from '#lib/languages/memoryRegions.ts'

//the panel reaches `#lib/utils.ts`, which reaches the projects store, which opens its IndexedDB
//because this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's rejection
//would fail the run, so the database is stubbed away: nothing the memory grid does goes near it
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

//jsdom has no popovers, which the pointer menu opens as
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})

/**
 * Poking memory from the selection popup ([the design record](../../../../../../../docs/design/pokes.md)):
 * the popup that reads a selected run becomes the input that rewrites it, one byte in the reading
 * its cell shows and a longer run as one number in the panel's endianness, and a whole selection is
 * one Poke. The parsing itself is `parseMemoryPoke`; what is tested here is the input around it.
 */

const BYTES = [0x11, 0x01, 0x02, 0x33, 0x44, 0x55, 0x66, 0x77]
const ADDRESS = 0x1000n

function render(
    options: {
        memoryRegions?: import('#lib/languages/commonLanguageFeatures.svelte.ts').MemoryRegion[]
        dataLabels?: import('#lib/languages/commonLanguageFeatures.svelte.ts').DataLabel[]
        sp?: bigint
        bytesPerRow?: number
        pokeable?: boolean
        endianess?: 'big' | 'little'
        unreadable?: number[]
        readOnlyMemory?: import('#lib/languages/commonLanguageFeatures.svelte.ts').ReadOnlyMemory[]
        /** A pointer menu, whose calls are recorded with the cell they were given. */
        withMenu?: boolean
        markedAddress?: bigint
    } = {}
) {
    const pokes: { address: bigint; bytes: number[] }[] = []
    const menus: MemoryCell[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    const memory: DiffedMemory = {
        current: Uint8Array.from(BYTES),
        prevState: Uint8Array.from(BYTES),
        unreadable: options.unreadable
            ? {
                  address: ADDRESS,
                  mask: Uint8Array.from(options.unreadable),
                  reason: 'address out of range'
              }
            : null
    }
    const app = mount(MemoryRenderer, {
        target,
        props: {
            memory,
            currentAddress: ADDRESS,
            sp: options.sp ?? 0n,
            memoryRegions: options.memoryRegions,
            dataLabels: options.dataLabels,
            readOnlyMemory: options.readOnlyMemory,
            pageSize: 8,
            bytesPerRow: options.bytesPerRow ?? 8,
            defaultMemoryValue: 0xff,
            endianess: options.endianess ?? 'big',
            systemSize: RegisterSize.Long,
            pokeable: options.pokeable ?? true,
            onPoke: (address: bigint, bytes: Uint8Array) =>
                pokes.push({ address, bytes: [...bytes] }),
            cellMenu: options.withMenu
                ? (cell: MemoryCell) => {
                      menus.push(cell)
                      return [{ label: 'Follow pointer', onSelect: () => {} }]
                  }
                : undefined,
            markedAddress: options.markedAddress
        }
    })
    flushSync()
    const cells = () => [...target.querySelectorAll<HTMLElement>('.memory-numbers .tooltip-base')]
    return {
        pokes,
        menus,
        target,
        cells,
        input: () => target.querySelector<HTMLInputElement>('.selection-input'),
        popup: () => target.querySelector<HTMLElement>('.selection-value'),
        /** A click on a byte, which is the one-byte selection the panel has always made. */
        select: (from: number, to = from) => {
            cells()[from].dispatchEvent(new Event('pointerdown', { bubbles: true }))
            flushSync()
            if (to !== from) {
                cells()[to].dispatchEvent(new Event('pointermove', { bubbles: true }))
                flushSync()
            }
        },
        /** A right click on a byte; whether something took it from the browser. */
        rightClick: (index: number) => {
            const cell = cells()[index]
            //the press first, as a mouse sends it, then the menu's own event
            cell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }))
            flushSync()
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: 30,
                clientY: 40
            })
            cell.dispatchEvent(event)
            flushSync()
            return event.defaultPrevented
        },
        menu: () => document.querySelector<HTMLElement>('[role="menu"]'),
        showAsCharacters: () => {
            target.querySelector<HTMLElement>('button[aria-label="Show as character"]')!.click()
            flushSync()
        },
        close: () => {
            unmount(app)
            target.remove()
        }
    }
}

function type(input: HTMLInputElement, text: string) {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
}

function press(input: HTMLInputElement, key: string) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    flushSync()
}

describe('poking memory from the selection popup', () => {
    it('pokes one byte, read as the hex digits its cell shows', () => {
        const panel = render()
        panel.select(3)
        const input = panel.input()!
        //the input opens holding what the cell holds, so a commit of it changes nothing
        expect(input.value).toBe('33')
        type(input, 'ab')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([{ address: ADDRESS + 3n, bytes: [0xab] }])
        panel.close()
    })

    it('pokes the character typed into a byte while the panel reads characters', () => {
        const panel = render()
        panel.showAsCharacters()
        panel.select(0)
        const input = panel.input()!
        type(input, 'A')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([{ address: ADDRESS, bytes: [0x41] }])
        panel.close()
    })

    it('pokes a selected run as one number, in the panel endianness', () => {
        const big = render({ endianess: 'big' })
        big.select(1, 2)
        //two bytes, read as the number the popup has always shown for the run
        expect(big.input()!.value).toBe('258')
        type(big.input()!, '0x1234')
        press(big.input()!, 'Enter')
        expect(big.pokes).toEqual([{ address: ADDRESS + 1n, bytes: [0x12, 0x34] }])
        big.close()

        const little = render({ endianess: 'little' })
        little.select(1, 2)
        expect(little.input()!.value).toBe('513')
        type(little.input()!, '0x1234')
        press(little.input()!, 'Enter')
        expect(little.pokes).toEqual([{ address: ADDRESS + 1n, bytes: [0x34, 0x12] }])
        little.close()
    })

    it('keeps a value too wide for the selection open and says why, rather than truncating it', () => {
        const panel = render()
        panel.select(3)
        const input = panel.input()!
        type(input, '1ff')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([])
        const open = panel.input()!
        expect(open.value).toBe('1ff')
        expect(open.classList.contains('refused')).toBe(true)
        expect(open.title).toContain('8 bits wide')
        panel.close()
    })

    it('cancels on Escape, keeping the selection and writing nothing', () => {
        const panel = render()
        panel.select(3)
        const input = panel.input()!
        type(input, 'ff')
        press(input, 'Escape')
        expect(panel.pokes).toEqual([])
        //the input stays, showing the bytes again: Escape cancelled the value, not the selection
        expect(panel.input()!.value).toBe('33')
        panel.close()
    })

    it('commits by blurring the input, which is a click anywhere else on the page', () => {
        const panel = render()
        panel.select(3)
        type(panel.input()!, 'ab')
        panel.input()!.dispatchEvent(new FocusEvent('blur'))
        flushSync()
        expect(panel.pokes).toEqual([{ address: ADDRESS + 3n, bytes: [0xab] }])
        panel.close()
    })

    it('commits to the byte it was typed into when another byte is clicked', async () => {
        const panel = render()
        panel.select(3)
        type(panel.input()!, 'ab')
        //a click on another byte moves the selection first and blurs the input after it, both
        //inside the one event, so a commit that read the selection rather than the run it was
        //typed into would land at the byte that was clicked. The browser drains microtasks when the
        //pointerdown listener returns, which is where Svelte flushes its effects, and only then
        //runs the default action that blurs the input: the await is that turn, without which this
        //passes on a component that loses the value in every real browser
        const input = panel.input()!
        panel.cells()[5].dispatchEvent(new Event('pointerdown', { bubbles: true }))
        await Promise.resolve()
        flushSync()
        input.dispatchEvent(new FocusEvent('blur'))
        flushSync()
        expect(panel.pokes).toEqual([{ address: ADDRESS + 3n, bytes: [0xab] }])
        //the click moved the selection, and the popup over the new byte reads that byte
        expect(panel.input()!.value).toBe('55')
        panel.close()
    })

    it('commits to the run it was typed into when a drag moves the selection', async () => {
        const panel = render()
        panel.select(3)
        type(panel.input()!, 'ab')
        const input = panel.input()!
        panel.cells()[4].dispatchEvent(new Event('pointermove', { bubbles: true }))
        await Promise.resolve()
        flushSync()
        input.dispatchEvent(new FocusEvent('blur'))
        flushSync()
        expect(panel.pokes).toEqual([{ address: ADDRESS + 3n, bytes: [0xab] }])
        panel.close()
    })

    it('records nothing when the commit leaves the bytes as they were', () => {
        const panel = render()
        panel.select(3)
        const input = panel.input()!
        type(input, '0x33')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([])
        expect(panel.input()!.value).toBe('33')
        panel.close()
    })

    it('draws the popup it always drew when the panel takes no Pokes', () => {
        const panel = render({ pokeable: false })
        panel.select(3)
        expect(panel.input()).toBe(null)
        expect(panel.popup()?.textContent).toContain('51')
        panel.close()
    })
})

describe('memory that takes no Pokes', () => {
    const readOnlyMemory = [
        { start: ADDRESS + 4n, end: ADDRESS + 8n, reason: 'holds instructions' }
    ]

    it('reads a selection inside it, saying why, and offers no input', () => {
        const panel = render({ readOnlyMemory })
        panel.select(5)
        expect(panel.input()).toBeNull()
        expect(panel.popup()?.textContent).toContain(String(0x55))
        expect(panel.popup()?.querySelector('[title="holds instructions"]')).not.toBeNull()
        panel.close()
    })

    it('refuses a selection that only reaches into it, and pokes the bytes before it', () => {
        const panel = render({ readOnlyMemory })
        panel.select(3, 4)
        expect(panel.input()).toBeNull()
        panel.select(2, 3)
        type(panel.input()!, '1')
        press(panel.input()!, 'Enter')
        expect(panel.pokes).toEqual([{ address: ADDRESS + 2n, bytes: [0x00, 0x01] }])
        panel.close()
    })
})

describe('bytes the Core could not read', () => {
    it('draws them without a value and says why under the page', () => {
        const panel = render({ unreadable: [0, 0, 0, 0, 0, 0, 1, 1] })
        //an unreadable byte keeps its cell, so the grid does not move, and reads as `??`
        const text = panel.cells().map((cell) => cell.textContent?.trim())
        expect(text).toHaveLength(8)
        expect(text.slice(0, 6)).not.toContain('??')
        expect(text.slice(6)).toEqual(['??', '??'])
        //its hover says why
        const reasons = [...panel.target.querySelectorAll<HTMLElement>('.byte-error')]
        expect(reasons.map((reason) => reason.textContent?.trim())).toEqual([
            'address out of range',
            'address out of range'
        ])
        const notice = panel.target.querySelector<HTMLElement>('.memory-unreadable')!
        expect(notice.textContent).toContain("2 of 8 bytes can't be read: address out of range")
        panel.close()
    })

    it('says the whole page when none of it can be read', () => {
        const panel = render({ unreadable: [1, 1, 1, 1, 1, 1, 1, 1] })
        const notice = panel.target.querySelector<HTMLElement>('.memory-unreadable')!
        expect(notice.textContent).toContain('Nothing on this page can be read')
        panel.close()
    })

    it('shows no notice for a page that was read whole', () => {
        const panel = render()
        expect(panel.target.querySelector('.memory-unreadable')).toBeNull()
        panel.close()
    })

    it('reads a selection across them as nothing and takes no Poke', () => {
        //bytes 3 and 4 cannot be read, so the third and fourth cells reach into the gap
        const panel = render({ unreadable: [0, 0, 0, 1, 1, 0, 0, 0] })
        panel.select(2, 3)
        expect(panel.popup()!.textContent?.trim()).toBe('??')
        expect(panel.input()).toBeNull()
        panel.close()
    })
})

it('tints device overlaps, preserves SP and selection highlights, and hovers both owners', () => {
    const region = {
        id: 'data',
        name: '.data',
        section: '.data',
        kind: 'data' as const,
        start: ADDRESS,
        end: ADDRESS + 8n
    }
    const ui = render({
        memoryRegions: [
            region,
            {
                id: 'bitmap',
                name: 'Bitmap display',
                kind: 'device',
                start: ADDRESS,
                end: ADDRESS + 8n
            }
        ],
        sp: ADDRESS + 1n,
        dataLabels: [
            {
                name: '_ZN4Game5scoreE',
                displayName: 'Game::score',
                section: '.data',
                address: ADDRESS,
                fromLibrary: true
            }
        ]
    })
    //the region is outlined around the byte's cell, so the cell's own highlights stay its own
    const outline = (index: number) =>
        ui.cells()[index].closest('.memory-number')!.getAttribute('style')
    const deviceOutline = `--region-color: ${memoryRegionColor('device')};`
    try {
        expect(outline(0)).toContain(deviceOutline)
        expect(outline(1)).toContain(deviceOutline)
        expect(ui.cells()[1].getAttribute('style')).toContain('background-color: var(--accent2)')
        expect(ui.target.querySelector('.region-hover')?.textContent).toBe(
            'Bitmap display · .data · Game::score (_ZN4Game5scoreE) (library)'
        )
        ui.select(0)
        expect(ui.cells()[0].getAttribute('style')).toContain('background-color: var(--green)')
        expect(outline(0)).toContain(deviceOutline)
    } finally {
        ui.close()
    }
})

it('cuts a data region into chunks at its labels, each line drawn once in the region colour', () => {
    const region = {
        id: 'data',
        name: '.data',
        section: '.data',
        kind: 'data' as const,
        start: ADDRESS,
        end: ADDRESS + 8n
    }
    const label = (name: string, offset: bigint) => ({
        name,
        section: '.data',
        address: ADDRESS + offset,
        fromLibrary: false
    })
    const ui = render({
        memoryRegions: [region],
        dataLabels: [label('one', 2n), label('two', 6n)],
        bytesPerRow: 4
    })
    //the page is two rows of four: bytes 0-1 before any label, 2-5 under one, 6-7 under two
    const edges = (index: number) =>
        /--region-edges: ([^;]*);/.exec(
            ui.cells()[index].closest('.memory-number')!.getAttribute('style')!
        )![1]
    try {
        //each chunk draws its own top and left edges, and only the region draws the right and
        //bottom ones, so the line between two chunks is a single line, not two side by side
        expect([0, 1, 2, 3, 4, 5, 6, 7].map(edges)).toEqual([
            '1px 0 0 1px',
            '1px 0 0 0',
            '1px 0 0 1px',
            '1px 1px 0 0',
            '1px 0 1px 1px',
            '1px 0 1px 0',
            '1px 0 1px 1px',
            '1px 1px 1px 0'
        ])
        expect(ui.cells()[2].closest('.memory-number')!.getAttribute('style')).toContain(
            `--region-color: ${memoryRegionColor('data')};`
        )
    } finally {
        ui.close()
    }
})

it('outlines the Arguments in their colour, chunked and named by their parts', () => {
    const label = (name: string, offset: bigint) => ({
        name,
        section: 'Arguments',
        address: ADDRESS + offset,
        fromLibrary: false
    })
    const ui = render({
        memoryRegions: [
            {
                id: 'arguments',
                name: 'Arguments',
                section: 'Arguments',
                kind: 'arguments',
                start: ADDRESS,
                end: ADDRESS + 8n
            }
        ],
        //an array of two pointers, then a string
        dataLabels: [label('argv', 0n), label('argv[0]', 4n)],
        bytesPerRow: 8,
        sp: ADDRESS + 8n
    })
    const style = (index: number) =>
        ui.cells()[index].closest('.memory-number')!.getAttribute('style')!
    const edges = (index: number) => /--region-edges: ([^;]*);/.exec(style(index))![1]
    try {
        expect(style(0)).toContain(`--region-color: ${memoryRegionColor('arguments')};`)
        expect([0, 3, 4, 7].map(edges)).toEqual([
            '1px 0 1px 1px',
            '1px 0 1px 0',
            '1px 0 1px 1px',
            '1px 1px 1px 0'
        ])
        const hover = (index: number) =>
            ui.cells()[index].closest('.memory-number')!.querySelector('.region-hover')?.textContent
        expect(hover(1)).toBe('Arguments · argv+1')
        expect(hover(5)).toBe('Arguments · argv[0]+1')
    } finally {
        ui.close()
    }
})

describe("a memory cell's pointer menu", () => {
    it('opens on a right click with the byte, leaving the selection alone', async () => {
        const panel = render({ withMenu: true })
        expect(panel.rightClick(3)).toBe(true)
        await tick()
        expect(panel.menus).toEqual([{ address: ADDRESS + 3n, value: 0x33n, bytes: 1 }])
        expect(panel.menu()?.getAttribute('aria-label')).toBe('Memory')
        //a right click is no press that selects, so no Poke input opened under the menu
        expect(panel.popup()).toBe(null)
        panel.close()
    })

    it('reads a selection the click lands in as its number, in the panel endianness', async () => {
        const panel = render({ withMenu: true, endianess: 'little' })
        panel.select(1, 4)
        expect(panel.rightClick(2)).toBe(true)
        await tick()
        //at the selection's start, where Follow pointer reads the pointer the number is
        expect(panel.menus).toEqual([{ address: ADDRESS + 1n, value: 0x44330201n, bytes: 4 }])
        //the selection is still there to poke
        expect(panel.input()?.value).toBe(String(0x44330201))
        panel.close()
    })

    it('gives no value for a byte the Core could not read', async () => {
        const panel = render({ withMenu: true, unreadable: [0, 0, 1, 0, 0, 0, 0, 0] })
        panel.rightClick(2)
        await tick()
        expect(panel.menus).toEqual([{ address: ADDRESS + 2n, value: undefined, bytes: 1 }])
        panel.close()
    })

    it('leaves a click selecting and poking, and a panel without a menu as it was', () => {
        const panel = render({ withMenu: true })
        panel.select(3)
        expect(panel.input()?.value).toBe('33')
        expect(panel.menus).toEqual([])
        panel.close()
        const plain = render()
        expect(plain.rightClick(3)).toBe(false)
        expect(plain.menu()).toBe(null)
        //the browser's menu, over a press that selects the byte as any press always has
        expect(plain.input()?.value).toBe('33')
        plain.close()
    })

    it('marks the byte a pointer menu moved the view to', () => {
        const panel = render({ markedAddress: ADDRESS + 5n })
        const marked = [...panel.target.querySelectorAll('.memory-number.marked')]
        expect(marked).toEqual([panel.cells()[5].closest('.memory-number')])
        panel.close()
        //a mark on another page marks nothing on this one
        const elsewhere = render({ markedAddress: ADDRESS + 0x100n })
        expect(elsewhere.target.querySelectorAll('.memory-number.marked')).toHaveLength(0)
        elsewhere.close()
    })
})
