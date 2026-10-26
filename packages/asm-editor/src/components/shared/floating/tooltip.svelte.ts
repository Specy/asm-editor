/**
 * The Tooltip: a card with an arrow that explains a control, given to an element in Svelte code,
 * `<button {@attach tooltip('Zoom out', { shortcut: 'Minus' })}>` (ADR 0064, the Tooltips design).
 * It is the element's description and never its name, so it stays in the accessibility tree while
 * the card is hidden and the element keeps its own text or `aria-label`.
 *
 * The pointer shows it after a delay, keyboard focus at once, a long press on a touch screen after
 * the same 500ms; Escape, the pointer leaving, blur and the page scrolling under it close it. Once
 * one has shown, the next trigger's shows at once until the pointer has been off every trigger for a
 * moment, which is the only state the Tooltips share.
 */
import { mount, unmount, untrack, type Snippet } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import type { Side } from './floating'
import TooltipCard from './TooltipCard.svelte'

/** Text, a snippet drawn in the card, or nothing for no Tooltip. */
export type TooltipContent = string | Snippet | null | undefined

export interface TooltipOptions {
    /** How long the pointer rests on the element before the card shows, in milliseconds. */
    delay?: number
    /** The side of the element the card is on unless that lacks the room; above by default. */
    placement?: Side
    /** A key in the shortcut store's form (`Mod+KeyZ`), drawn after the text as Ctrl+Z or ⌘Z. */
    shortcut?: string
    /** False for a control whose long press already does something: no Tooltip on touch. */
    touch?: boolean
}

export const TOOLTIP_DELAY = 500
/** How long after the last card closed the next shows without waiting. */
const WARM_FOR = 300
/** The time to cross from the element onto its card. */
const HIDE_AFTER = 100
const LONG_PRESS = 500
/** How far a finger may move during a long press before it counts as a scroll or a drag. */
const PRESS_SLOP = 10

let nextId = 0
let current: Tooltip | null = null
let warmUntil = 0
/** When a pointer last pressed anywhere, which the focus that follows a press comes from. */
let lastPress = -Infinity
/** How long after a press focus still counts as the press's own. */
const PRESS_FOCUS = 300

function notePress() {
    lastPress = performance.now()
}

const instances = new WeakMap<HTMLElement, Tooltip>()
/** One container for the cards of each theme subtree, so a card wears its trigger's colours. */
const layers = new WeakMap<Element, HTMLElement>()

function layerFor(trigger: HTMLElement): HTMLElement {
    //the nearest theme, not the app's, as Editor.svelte places Monaco's widgets
    const host = trigger.closest<HTMLElement>('.theme-scope, .theme-root') ?? document.body
    let layer = layers.get(host)
    if (!layer || !layer.isConnected) {
        layer = document.createElement('div')
        layer.className = 'tooltip-layer'
        layer.style.display = 'contents'
        host.appendChild(layer)
        layers.set(host, layer)
    }
    return layer
}

function warm() {
    return current?.open === true || performance.now() < warmUntil
}

/** The state of one element's Tooltip, which its card draws. */
export class Tooltip {
    readonly id = `tooltip-${++nextId}`
    content = $state<string | Snippet>('')
    shortcut = $state<string | undefined>()
    placement = $state<Side>('top')
    open = $state(false)
    /** Shown without the slide and closed without the fade, as when moving between triggers. */
    instant = $state(false)

    delay = TOOLTIP_DELAY
    touch = true
    readonly trigger: HTMLElement
    #card: ReturnType<typeof mount> | null = null
    #showTimer: ReturnType<typeof setTimeout> | undefined
    #hideTimer: ReturnType<typeof setTimeout> | undefined
    #pressTimer: ReturnType<typeof setTimeout> | undefined
    #pressStart: { x: number; y: number } | null = null
    /** Escape closed it: it stays closed until the pointer or focus leaves and comes back. */
    #dismissed = false
    /** A long press showed it, so the next touch anywhere closes it. */
    #byPress = false
    #disposeQueued = false
    #remove: () => void

    constructor(trigger: HTMLElement, content: string | Snippet, options: TooltipOptions) {
        this.trigger = trigger
        //once is enough: adding the same listener again does nothing
        addEventListener('pointerdown', notePress, true)
        this.update(content, options)
        this.#card = mount(TooltipCard, { target: layerFor(trigger), props: { tooltip: this } })
        const described = trigger.getAttribute('aria-describedby')
        trigger.setAttribute(
            'aria-describedby',
            described ? `${described} ${this.contentId}` : this.contentId
        )
        trigger.setAttribute('data-tooltip', '')

        const listeners: [string, (event: never) => void][] = [
            ['pointerenter', this.#onEnter],
            ['pointerleave', this.#onLeave],
            ['pointerdown', this.#onDown],
            ['focusin', this.#onFocus],
            ['focusout', this.#onBlur],
            ['contextmenu', this.#onContextMenu]
        ]
        for (const [type, listener] of listeners)
            trigger.addEventListener(type, listener as EventListener)
        //captured, so it runs before the control's own handler, which Svelte delegates to the root
        trigger.addEventListener('click', this.#onClick, true)
        this.#remove = () => {
            for (const [type, listener] of listeners) {
                trigger.removeEventListener(type, listener as EventListener)
            }
            trigger.removeEventListener('click', this.#onClick, true)
            removeEventListener('pointerup', this.#onPressLifted, true)
        }
    }

    get contentId() {
        return `${this.id}-content`
    }

    update(content: string | Snippet, options: TooltipOptions) {
        this.content = content
        this.shortcut = options.shortcut
        this.placement = options.placement ?? 'top'
        this.delay = options.delay ?? TOOLTIP_DELAY
        this.touch = options.touch ?? true
        this.trigger.toggleAttribute('data-tooltip-touch', this.touch)
    }

    /** Shows the card now, swapping out any other at once. */
    show() {
        clearTimeout(this.#showTimer)
        clearTimeout(this.#hideTimer)
        if (this.open || this.#dismissed || !this.trigger.isConnected) return
        const swap = warm()
        if (current && current !== this) current.hide(true)
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the one card open, by design
        current = this
        this.instant = swap
        this.open = true
        addEventListener('keydown', onKeydown)
        addEventListener('scroll', onScroll, true)
        addEventListener('resize', closeCurrent)
        addEventListener('blur', closeCurrent)
    }

    /** Closes the card, at once when `instant`, as when another takes its place. */
    hide(instant = false) {
        clearTimeout(this.#showTimer)
        clearTimeout(this.#hideTimer)
        this.#byPress = false
        removeEventListener('pointerdown', this.#onAnyPress, true)
        if (!this.open) return
        this.instant = instant
        this.open = false
        if (current === this) {
            current = null
            warmUntil = performance.now() + WARM_FOR
            removeEventListener('keydown', onKeydown)
            removeEventListener('scroll', onScroll, true)
            removeEventListener('resize', closeCurrent)
            removeEventListener('blur', closeCurrent)
        }
    }

    /** Escape: closed, and kept closed while the pointer and focus stay. */
    dismiss() {
        this.#dismissed = true
        this.hide()
    }

    /** The pointer reached the card, which keeps it open as resting on the element does. */
    keep() {
        clearTimeout(this.#hideTimer)
    }

    /** The pointer left the element or its card: closes it unless it comes back in time. */
    leave() {
        clearTimeout(this.#showTimer)
        clearTimeout(this.#hideTimer)
        if (this.open) this.#hideTimer = setTimeout(() => this.hide(), HIDE_AFTER)
    }

    #onEnter = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        this.#dismissed = false
        clearTimeout(this.#hideTimer)
        if (this.open) return
        clearTimeout(this.#showTimer)
        if (warm()) this.show()
        else this.#showTimer = setTimeout(() => this.show(), this.delay)
    }

    #onLeave = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        this.leave()
    }

    #onFocus = (event: FocusEvent) => {
        //the focus a click or a tap gives is not a request for an explanation. Chrome counts a click
        //into a text field as keyboard focus, so a press just before rules it out too. The target,
        //since a label with a Tooltip is focused through the input inside it
        if (!(event.target as Element).matches(':focus-visible')) return
        if (performance.now() - lastPress < PRESS_FOCUS) return
        this.#dismissed = false
        this.show()
    }

    #onBlur = (event: FocusEvent) => {
        if (this.trigger.contains(event.relatedTarget as Node | null)) return
        this.#dismissed = false
        this.hide()
    }

    #onDown = (event: PointerEvent) => {
        if (event.pointerType !== 'touch') {
            //a click on the element is the person using it; the explanation has done its work
            clearTimeout(this.#showTimer)
            if (this.open) this.hide()
            return
        }
        if (!this.touch) return
        this.#cancelPress()
        this.#pressStart = { x: event.clientX, y: event.clientY }
        this.#pressTimer = setTimeout(() => this.#pressed(), LONG_PRESS)
        addEventListener('pointermove', this.#onPressMove)
        addEventListener('pointerup', this.#onPressEnd)
        addEventListener('pointercancel', this.#onPressEnd)
    }

    #onPressMove = (event: PointerEvent) => {
        if (!this.#pressStart) return
        const moved = Math.hypot(
            event.clientX - this.#pressStart.x,
            event.clientY - this.#pressStart.y
        )
        if (moved > PRESS_SLOP) this.#cancelPress()
    }

    #onPressEnd = () => this.#cancelPress()

    #cancelPress() {
        clearTimeout(this.#pressTimer)
        this.#pressStart = null
        removeEventListener('pointermove', this.#onPressMove)
        removeEventListener('pointerup', this.#onPressEnd)
        removeEventListener('pointercancel', this.#onPressEnd)
    }

    #pressed() {
        this.#cancelPress()
        this.#dismissed = false
        this.show()
        if (!this.open) return
        this.#byPress = true
        //lifting the finger now is not a tap: the click it would make does not reach the control
        this.#swallowClick = true
        addEventListener('pointerup', this.#onPressLifted, { capture: true, once: true })
        //and the next touch anywhere closes it
        addEventListener('pointerdown', this.#onAnyPress, true)
    }

    #swallowClick = false

    //the click follows the lift at once, if the browser sends one after a long press at all
    #onPressLifted = () => setTimeout(() => (this.#swallowClick = false), 300)

    #onClick = (event: MouseEvent) => {
        if (!this.#swallowClick) return
        this.#swallowClick = false
        event.preventDefault()
        event.stopImmediatePropagation()
    }

    #onAnyPress = () => this.hide()

    #onContextMenu = (event: MouseEvent) => {
        //a long press's own menu (a link's, or text selection) would cover the card it opens
        if (this.#byPress || this.#pressStart) event.preventDefault()
    }

    /** The attachment went: kept for a moment, in case its element is attached again at once. */
    queueDispose() {
        this.#disposeQueued = true
        queueMicrotask(() => {
            if (this.#disposeQueued) this.dispose()
        })
    }

    /** Keeps it for a new attachment of the same element, as when its content changed. */
    reuse(content: string | Snippet, options: TooltipOptions) {
        this.#disposeQueued = false
        this.update(content, options)
    }

    dispose() {
        this.#disposeQueued = false
        this.hide(true)
        this.#cancelPress()
        this.#remove()
        if (this.#card) void unmount(this.#card)
        this.#card = null
        const described = (this.trigger.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .filter((id) => id && id !== this.contentId)
            .join(' ')
        if (described) this.trigger.setAttribute('aria-describedby', described)
        else this.trigger.removeAttribute('aria-describedby')
        this.trigger.removeAttribute('data-tooltip')
        this.trigger.removeAttribute('data-tooltip-touch')
        if (instances.get(this.trigger) === this) instances.delete(this.trigger)
    }
}

function closeCurrent() {
    current?.hide()
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') current?.dismiss()
}

/**
 * The page scrolling under the card closes it; it does not chase its element. Only a scroll that
 * moves the element counts: a Terminal scrolling its output beside it is no reason to close.
 */
function onScroll(event: Event) {
    const scrolled = event.target
    if (!current || !(scrolled instanceof Node)) return
    if (scrolled === document || scrolled.contains(current.trigger)) current.hide()
}

/**
 * Gives the element a Tooltip with `content`, or none when it is empty. Content or options that
 * change while the card is open change it in place.
 */
export function tooltip(
    content: TooltipContent,
    options: TooltipOptions = {}
): Attachment<HTMLElement> {
    return (element) =>
        untrack(() => {
            const existing = instances.get(element)
            if (!content) {
                existing?.dispose()
                return
            }
            let tip = existing
            if (tip) tip.reuse(content, options)
            else {
                tip = new Tooltip(element, content, options)
                instances.set(element, tip)
            }
            const owned = tip
            return () => owned.queueDispose()
        })
}
