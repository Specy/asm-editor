/**
 * A search box's Search modifiers in jsdom ([the design record](../../../../../docs/design/documentation-search.md),
 * Search modifiers): the query drawn again under the field with its modifiers marked, the field's
 * own text left to that drawing, the words a screen reader hears, the Tooltip a mark shows under
 * the pointer, and the field drawing its own text whenever the two cannot agree. jsdom lays nothing
 * out, so every width is 0 unless a test gives one, and has no popover API, so showing a card marks
 * it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { TOOLTIP_DELAY } from '#cmp/shared/floating/tooltip.svelte.ts'
import { SITE_SCOPE, languageScope, type SearchScope } from '#lib/search/scope.ts'
import SearchField from './SearchField.svelte'

// the index and the model are in: nothing loads, and pointing at the box starts no worker
vi.mock('#lib/search/searchClient.svelte.ts', () => ({
    searchClient: { indexStatus: () => 'ready', model: 'ready', warm() {} }
}))

beforeEach(() => {
    vi.useFakeTimers()
    HTMLElement.prototype.showPopover = function () {
        this.toggleAttribute('data-shown', true)
    }
    HTMLElement.prototype.hidePopover = function () {
        this.toggleAttribute('data-shown', false)
    }
})

let dispose = () => {}
afterEach(() => {
    dispose()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.replaceChildren()
})

function open(value: string, scope?: SearchScope) {
    const target = document.createElement('div')
    document.body.append(target)
    const props = $state({ value, scope })
    const app = mount(SearchField, { target, props })
    dispose = () => void unmount(app)
    flushSync()
    const input = target.querySelector('input')!
    return { target, props, input }
}

const drawnText = (target: Element) => target.querySelector('.query-marks')?.textContent ?? null
const marks = (target: Element) =>
    [...target.querySelectorAll('.query-marks .mark')].map((mark) => mark.textContent)
/** The second live region, after the loading status, which says what the modifiers did. */
const heard = (target: Element) =>
    [...target.querySelectorAll('[role="status"]')].at(1)?.textContent ?? null
const drawsOwnText = (input: HTMLInputElement) => !input.hasAttribute('data-drawn-under')

function pointer(element: Element, type: string, x: number, pointerType = 'mouse') {
    const event = new MouseEvent(type, { bubbles: true, clientX: x })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    element.dispatchEvent(event)
    flushSync()
}

function wait(ms: number) {
    vi.advanceTimersByTime(ms)
    flushSync()
}

/** The cards showing, by their words. */
const cards = () =>
    [...document.querySelectorAll('[role="tooltip"][data-shown]')].map((card) =>
        card.textContent?.trim()
    )

function rect(left: number, right: number): DOMRect {
    return {
        left,
        right,
        x: left,
        width: right - left,
        top: 0,
        bottom: 20,
        y: 0,
        height: 20
    } as DOMRect
}

describe("a search box's Search modifiers", () => {
    it('draws the query again with a language name marked, and says what it did', () => {
        const { target, input } = open('m68k multiply numbers', SITE_SCOPE)
        expect(drawnText(target)).toBe('m68k multiply numbers')
        expect(marks(target)).toEqual(['m68k'])
        expect(drawsOwnText(input)).toBe(false)
        expect(heard(target)).toBe('M68K results first.')
        //the drawing is out of the accessibility tree: the field itself has the text
        expect(target.querySelector('.query-marks')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('marks each modifier in place and says each once', () => {
        const { target } = open('mips directive for strings, or a MARS directive', SITE_SCOPE)
        expect(marks(target)).toEqual(['mips', 'directive', 'MARS', 'directive'])
        expect(drawnText(target)).toBe('mips directive for strings, or a MARS directive')
        expect(heard(target)).toBe('MIPS results first. Directives first.')
    })

    it("marks no language in a language's own scope, where its name is an ordinary word", () => {
        const { target } = open('mips directive', languageScope('mips'))
        expect(marks(target)).toEqual(['directive'])
        expect(heard(target)).toBe('Directives first.')
    })

    it('leaves a query with no modifier to the field, and follows the query as it changes', () => {
        const { target, props, input } = open('multiply numbers', SITE_SCOPE)
        expect(drawnText(target)).toBeNull()
        expect(drawsOwnText(input)).toBe(true)
        expect(heard(target)).toBe('')

        props.value = 'multiply numbers in x86'
        flushSync()
        expect(marks(target)).toEqual(['x86'])
        expect(drawsOwnText(input)).toBe(false)
        expect(heard(target)).toBe('x86-64 results first.')

        props.value = ''
        flushSync()
        expect(drawnText(target)).toBeNull()
        expect(drawsOwnText(input)).toBe(true)
        expect(heard(target)).toBe('')
    })

    it("has no marks and no words of its own without a scope (the Project's filters)", () => {
        const { target, input } = open('m68k directive')
        expect(drawnText(target)).toBeNull()
        expect(drawsOwnText(input)).toBe(true)
        expect(target.querySelectorAll('[role="status"]')).toHaveLength(0)
    })

    it("shows a mark's Tooltip while the pointer rests on it, not for a touch", () => {
        const { target, input } = open('m68k multiply numbers', SITE_SCOPE)
        const mark = target.querySelector<HTMLElement>('.mark')!
        mark.getBoundingClientRect = () => rect(10, 40)
        target.querySelector<HTMLElement>('.query-marks .view')!.getBoundingClientRect = () =>
            rect(0, 300)

        pointer(input, 'pointermove', 20, 'touch')
        wait(TOOLTIP_DELAY)
        expect(cards()).toEqual([])

        pointer(input, 'pointermove', 20)
        wait(TOOLTIP_DELAY - 1)
        expect(cards()).toEqual([])
        wait(1)
        expect(cards()).toEqual(['M68K results first'])

        //off the mark but still on the field
        pointer(input, 'pointermove', 120)
        wait(200)
        expect(cards()).toEqual([])

        //back on it, then a press: the reader is using the field
        pointer(input, 'pointermove', 30)
        wait(TOOLTIP_DELAY)
        expect(cards()).toEqual(['M68K results first'])
        pointer(input, 'pointerdown', 30)
        wait(200)
        expect(cards()).toEqual([])
        pointer(input, 'pointermove', 32)
        wait(TOOLTIP_DELAY)
        expect(cards()).toEqual([])

        //leaving the field and coming back shows it again
        pointer(input, 'pointerleave', 400)
        pointer(input, 'pointermove', 20)
        wait(TOOLTIP_DELAY)
        expect(cards()).toEqual(['M68K results first'])
        pointer(input, 'pointerleave', 400)
        wait(200)
        expect(cards()).toEqual([])
    })

    it('draws nothing when the field and the drawing measure differently', () => {
        const { target, input } = open('m68k multiply numbers', SITE_SCOPE)
        expect(drawsOwnText(input)).toBe(false)
        //the field's text overflows it and is 300 pixels wide; the drawing's is 280
        Object.defineProperty(input, 'clientWidth', { value: 200, configurable: true })
        Object.defineProperty(input, 'scrollWidth', { value: 300, configurable: true })
        target.querySelector<HTMLElement>('.query-marks .line')!.getBoundingClientRect = () =>
            rect(0, 280)
        input.dispatchEvent(new Event('scroll'))
        flushSync()
        expect(drawsOwnText(input)).toBe(true)
        expect(target.querySelector('.query-marks')?.classList.contains('hidden')).toBe(true)
        //what the modifiers did still counts, and is still said
        expect(heard(target)).toBe('M68K results first.')

        //as wide again, scrolled to the end: drawn, moved as far as the field's text
        target.querySelector<HTMLElement>('.query-marks .line')!.getBoundingClientRect = () =>
            rect(0, 300)
        Object.defineProperty(input, 'scrollLeft', { value: 100, configurable: true })
        input.dispatchEvent(new Event('scroll'))
        flushSync()
        expect(drawsOwnText(input)).toBe(false)
        expect(target.querySelector<HTMLElement>('.query-marks .line')!.style.translate).toBe(
            '-100px'
        )
    })

    it('leaves a selection and an input method to the field', () => {
        const { target, input } = open('m68k multiply numbers', SITE_SCOPE)
        input.focus()
        input.setSelectionRange(0, 8)
        input.dispatchEvent(new Event('select'))
        flushSync()
        expect(drawnText(target)).toBeNull()
        expect(drawsOwnText(input)).toBe(true)

        input.setSelectionRange(8, 8)
        input.dispatchEvent(new Event('keyup'))
        flushSync()
        expect(marks(target)).toEqual(['m68k'])

        input.dispatchEvent(new Event('compositionstart'))
        flushSync()
        expect(drawnText(target)).toBeNull()
        expect(drawsOwnText(input)).toBe(true)
        input.dispatchEvent(new Event('compositionend'))
        flushSync()
        expect(marks(target)).toEqual(['m68k'])
    })
})
