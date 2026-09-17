import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import MemoryRenderer from './MemoryRenderer.svelte'
import { type DiffedMemory, RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

//the panel reaches `$lib/utils`, which reaches the projects store, which opens its IndexedDB
//because this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's rejection
//would fail the run, so the database is stubbed away: nothing the memory grid does goes near it
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * Poking memory from the selection popup ([the design record](../../../../../docs/design/pokes.md)):
 * the popup that reads a selected run becomes the input that rewrites it, one byte in the reading
 * its cell shows and a longer run as one number in the panel's endianness, and a whole selection is
 * one Poke. The parsing itself is `parseMemoryPoke`; what is tested here is the input around it.
 */

const BYTES = [0x11, 0x01, 0x02, 0x33, 0x44, 0x55, 0x66, 0x77]
const ADDRESS = 0x1000n

function render(options: { pokeable?: boolean; endianess?: 'big' | 'little' } = {}) {
    const pokes: { address: bigint; bytes: number[] }[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    const memory: DiffedMemory = {
        current: Uint8Array.from(BYTES),
        prevState: Uint8Array.from(BYTES)
    }
    const app = mount(MemoryRenderer, {
        target,
        props: {
            memory,
            currentAddress: ADDRESS,
            sp: 0n,
            pageSize: 8,
            bytesPerRow: 8,
            defaultMemoryValue: 0xff,
            endianess: options.endianess ?? 'big',
            systemSize: RegisterSize.Long,
            pokeable: options.pokeable ?? true,
            onPoke: (address: bigint, bytes: Uint8Array) =>
                pokes.push({ address, bytes: [...bytes] })
        }
    })
    flushSync()
    const cells = () => [...target.querySelectorAll<HTMLElement>('.memory-numbers .tooltip-base')]
    return {
        pokes,
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
        showAsCharacters: () => {
            target.querySelector<HTMLElement>('button[title="Show as character"]')!.click()
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
