/**
 * The Tooltip in jsdom ([tooltips.md](../../../../../../docs/design/tooltips.md), decisions 2 to 4
 * and 7): the description it gives its element whether or not it shows, the delay and the warm
 * swap, keyboard focus, Escape, a long press on a touch screen, and content changed in place. jsdom
 * has no popover API, so showing a card marks it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { TOOLTIP_DELAY, tooltip } from './tooltip.svelte.ts'

beforeEach(() => {
    vi.useFakeTimers()
    HTMLElement.prototype.showPopover = function () {
        this.toggleAttribute('data-shown', true)
    }
    HTMLElement.prototype.hidePopover = function () {
        this.toggleAttribute('data-shown', false)
    }
})
const cleanups: (() => void)[] = []
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.replaceChildren()
})

function trigger(label = 'Zoom out') {
    const button = document.createElement('button')
    button.setAttribute('aria-label', label)
    document.body.appendChild(button)
    return button
}

function attach(element: HTMLElement, ...args: Parameters<typeof tooltip>) {
    const cleanup = tooltip(...args)(element)
    flushSync()
    if (cleanup) cleanups.push(cleanup)
    return cleanup
}

function card(element: HTMLElement) {
    const id = element.getAttribute('aria-describedby')?.split(' ').at(-1)
    return document.getElementById(id!)?.closest<HTMLElement>('[role="tooltip"]') ?? null
}

const shown = (element: HTMLElement) => card(element)?.hasAttribute('data-shown') ?? false

function pointer(element: Element, type: string, pointerType = 'mouse', at = { x: 0, y: 0 }) {
    const event = new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    element.dispatchEvent(event)
    flushSync()
}

function wait(ms: number) {
    vi.advanceTimersByTime(ms)
    flushSync()
}

describe('the Tooltip', () => {
    it("describes its element whether or not it shows, and leaves the element's name alone", () => {
        const button = trigger()
        button.setAttribute('aria-describedby', 'help')
        attach(button, 'Zoom out', { shortcut: 'Mod+KeyZ' })
        const [help, own] = button.getAttribute('aria-describedby')!.split(' ')
        expect(help).toBe('help')
        expect(document.getElementById(own)?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
            'Zoom out, Ctrl+Z'
        )
        expect(button.getAttribute('aria-label')).toBe('Zoom out')
        expect(shown(button)).toBe(false)
    })

    it('shows after the delay the pointer rests, and goes when it leaves', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        pointer(button, 'pointerenter')
        wait(TOOLTIP_DELAY - 1)
        expect(shown(button)).toBe(false)
        wait(1)
        expect(shown(button)).toBe(true)
        pointer(button, 'pointerleave')
        wait(100)
        expect(shown(button)).toBe(false)
    })

    it('stays while the pointer crosses onto the card', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        pointer(button, 'pointerenter')
        wait(TOOLTIP_DELAY)
        pointer(button, 'pointerleave')
        pointer(card(button)!, 'pointerenter')
        wait(500)
        expect(shown(button)).toBe(true)
    })

    it('takes a delay of its own', () => {
        const button = trigger()
        attach(button, 'Zoom out', { delay: 100 })
        pointer(button, 'pointerenter')
        wait(100)
        expect(shown(button)).toBe(true)
    })

    it('shows the next one at once while warm, and waits again once cold', () => {
        const [first, second, third] = [trigger('a'), trigger('b'), trigger('c')]
        attach(first, 'A')
        attach(second, 'B')
        attach(third, 'C')
        pointer(first, 'pointerenter')
        wait(TOOLTIP_DELAY)
        pointer(first, 'pointerleave')
        pointer(second, 'pointerenter')
        expect(shown(first)).toBe(false)
        expect(shown(second)).toBe(true)
        pointer(second, 'pointerleave')
        wait(100 + 300)
        pointer(third, 'pointerenter')
        expect(shown(third)).toBe(false)
    })

    it('shows at once for keyboard focus, and Escape closes it without moving focus', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        vi.spyOn(button, 'matches').mockImplementation((selector) => selector === ':focus-visible')
        button.focus()
        flushSync()
        expect(shown(button)).toBe(true)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        flushSync()
        wait(100)
        expect(shown(button)).toBe(false)
        expect(document.activeElement).toBe(button)
    })

    it('does not show for the focus a click gives', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        button.focus()
        flushSync()
        expect(shown(button)).toBe(false)
    })

    it('does not show for focus right after a press, which a text field counts as visible', () => {
        const field = document.createElement('input')
        document.body.appendChild(field)
        attach(field, 'An address or a label')
        vi.spyOn(field, 'matches').mockImplementation((selector) => selector === ':focus-visible')
        pointer(field, 'pointerdown')
        field.focus()
        flushSync()
        expect(shown(field)).toBe(false)
        field.blur()
        wait(300)
        field.focus()
        flushSync()
        expect(shown(field)).toBe(true)
    })

    it('closes when a scroll moves its element, and stays for a scroll beside it', () => {
        const panel = document.createElement('div')
        const beside = document.createElement('div')
        document.body.append(panel, beside)
        const button = trigger()
        panel.appendChild(button)
        attach(button, 'Zoom out')
        pointer(button, 'pointerenter')
        wait(TOOLTIP_DELAY)
        beside.dispatchEvent(new Event('scroll'))
        wait(100)
        expect(shown(button)).toBe(true)
        panel.dispatchEvent(new Event('scroll'))
        wait(100)
        expect(shown(button)).toBe(false)
    })

    it('closes when the element is pressed', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        pointer(button, 'pointerenter')
        wait(TOOLTIP_DELAY)
        pointer(button, 'pointerdown')
        wait(100)
        expect(shown(button)).toBe(false)
    })

    it('shows on a long press, and the lift that follows does not click the control', () => {
        const button = trigger()
        const clicked = vi.fn()
        button.addEventListener('click', clicked)
        attach(button, 'Zoom out')
        pointer(button, 'pointerdown', 'touch')
        wait(499)
        expect(shown(button)).toBe(false)
        wait(1)
        expect(shown(button)).toBe(true)
        pointer(button, 'pointerup', 'touch')
        button.click()
        expect(clicked).not.toHaveBeenCalled()
        //the next touch anywhere closes it, and a tap clicks as before
        pointer(document.body, 'pointerdown', 'touch')
        wait(400)
        expect(shown(button)).toBe(false)
        button.click()
        expect(clicked).toHaveBeenCalledOnce()
    })

    it('leaves a tap alone, and a press that moves', () => {
        const button = trigger()
        attach(button, 'Zoom out')
        pointer(button, 'pointerdown', 'touch')
        pointer(button, 'pointerup', 'touch')
        wait(600)
        expect(shown(button)).toBe(false)
        pointer(button, 'pointerdown', 'touch', { x: 0, y: 0 })
        pointer(window as unknown as Element, 'pointermove', 'touch', { x: 0, y: 30 })
        wait(600)
        expect(shown(button)).toBe(false)
    })

    it('gives nothing on touch when asked not to', () => {
        const button = trigger()
        attach(button, 'Recolour', { touch: false })
        pointer(button, 'pointerdown', 'touch')
        wait(600)
        expect(shown(button)).toBe(false)
        expect(button.hasAttribute('data-tooltip-touch')).toBe(false)
    })

    it('changes its content in place when attached again with new content', () => {
        const button = trigger()
        const cleanup = attach(button, 'Build')
        pointer(button, 'pointerenter')
        wait(TOOLTIP_DELAY)
        const id = button.getAttribute('aria-describedby')
        cleanup?.()
        attach(button, 'Building…')
        expect(button.getAttribute('aria-describedby')).toBe(id)
        expect(shown(button)).toBe(true)
        expect(document.getElementById(id!)?.textContent?.trim()).toBe('Building…')
    })

    it('is no Tooltip at all for empty content, and goes with its element', async () => {
        const empty = trigger()
        attach(empty, undefined)
        expect(empty.hasAttribute('aria-describedby')).toBe(false)
        const button = trigger()
        const cleanup = tooltip('Zoom out')(button)
        flushSync()
        expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
        cleanup?.()
        await Promise.resolve()
        flushSync()
        expect(button.hasAttribute('aria-describedby')).toBe(false)
        expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(0)
    })
})
