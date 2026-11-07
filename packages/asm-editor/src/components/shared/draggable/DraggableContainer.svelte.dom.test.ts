/**
 * The floating window's corners: a window that asks to be resizable is resized by dragging either
 * bottom corner, kept inside the viewport and no smaller than its minimum or the caller's own rule,
 * and every other window has no corner at all. jsdom lays nothing out, so the body is given the box
 * it would have at its position.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import DraggableContainer from './DraggableContainer.svelte'

let target: HTMLElement
let component: ReturnType<typeof mount> | undefined

beforeEach(() => {
    //jsdom has no pointer capture and no layout
    HTMLElement.prototype.setPointerCapture ??= function () {}
    HTMLElement.prototype.releasePointerCapture ??= function () {}
    HTMLElement.prototype.hasPointerCapture ??= () => false
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 700)
    target = document.createElement('div')
    document.body.append(target)
})

afterEach(() => {
    if (component) void unmount(component)
    component = undefined
    target.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

function pointer(type: string, x: number, y: number) {
    return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
}

function drag(corner: Element, from: [number, number], to: [number, number]) {
    corner.dispatchEvent(pointer('pointerdown', ...from))
    corner.dispatchEvent(pointer('pointermove', ...to))
    corner.dispatchEvent(pointer('pointerup', ...to))
    flushSync()
}

it('has no corner unless it is asked to be resizable', () => {
    component = mount(DraggableContainer, { target, props: { title: 'Call stack', hidden: false } })
    flushSync()
    expect(target.querySelector('.resize-corner')).toBeNull()
})

it('resizes its body by the corner, inside the viewport and no smaller than its minimum', () => {
    const size = $state({ width: 400, height: 300 })
    component = mount(DraggableContainer, {
        target,
        props: {
            title: 'Screen',
            onClose: () => {},
            resizable: true,
            minWidth: 200,
            minHeight: 100,
            get width() {
                return size.width
            },
            set width(value) {
                size.width = value
            },
            get height() {
                return size.height
            },
            set height(value) {
                size.height = value
            }
        }
    })
    flushSync()
    const corner = target.querySelector('.resize-corner.end')!
    const body = target.querySelector<HTMLElement>('.draggable-container-content')!
    expect(body.style.width).toBe('400px')

    drag(corner, [400, 300], [550, 350])
    expect(size).toEqual({ width: 550, height: 350 })
    expect(body.style.width).toBe('550px')
    expect(body.style.height).toBe('350px')

    //past the viewport's edges, less the gap a drag keeps too
    drag(corner, [550, 350], [5000, 5000])
    expect(size).toEqual({ width: 1000 - 6, height: 700 - 6 })

    drag(corner, [994, 694], [0, 0])
    expect(size).toEqual({ width: 200, height: 100 })
})

it('moves its left edge by the left corner, and says which corner was let go', () => {
    const state = $state({ left: 300, width: 400, height: 200 })
    const released: string[] = []
    component = mount(DraggableContainer, {
        target,
        props: {
            title: 'Screen',
            onClose: () => {},
            resizable: true,
            onResizeEnd: (corner: 'start' | 'end') => released.push(corner),
            get left() {
                return state.left
            },
            set left(value) {
                state.left = value
            },
            get width() {
                return state.width
            },
            set width(value) {
                state.width = value
            },
            get height() {
                return state.height
            },
            set height(value) {
                state.height = value
            }
        }
    })
    flushSync()
    const body = target.querySelector<HTMLElement>('.draggable-container-content')!
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(state.left, 40, state.width, state.height)
    )
    const corner = target.querySelector('.resize-corner.start')!
    drag(corner, [300, 240], [200, 270])
    //100 pixels further left, and 30 lower, with the right edge where it was
    expect(state).toEqual({ left: 200, width: 500, height: 230 })
    expect(released).toEqual(['start'])

    //no further left than the viewport's edge, less the gap a drag keeps
    drag(corner, [200, 270], [-500, 270])
    expect(state.left).toBe(6)
    expect(state.left + state.width).toBe(700)
})

/** A body whose content is its own scroller, as the Call stack's and the History's are. */
const scrollingList = createRawSnippet(() => ({ render: () => '<div class="list"></div>' }))

it('offers the bottom edge only while the content scrolls', () => {
    component = mount(DraggableContainer, {
        target,
        props: {
            title: 'History',
            hidden: false,
            resizableMaxHeight: true,
            children: scrollingList
        }
    })
    flushSync()
    //jsdom lays nothing out, so the content is exactly as tall as what it shows
    expect(target.querySelector('.resize-edge')).toBeNull()
})

it('sets the most its body shows by the bottom edge, from the height it has, no lower than its minimum', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
    const state = $state({ maxHeight: 0 })
    component = mount(DraggableContainer, {
        target,
        props: {
            title: 'History',
            hidden: false,
            resizableMaxHeight: true,
            children: scrollingList,
            minMaxHeight: 160,
            get maxHeight() {
                return state.maxHeight
            },
            set maxHeight(value) {
                state.maxHeight = value
            }
        }
    })
    flushSync()
    expect(target.querySelector('.resize-corner')).toBeNull()
    const body = target.querySelector<HTMLElement>('.draggable-container-content')!
    //left to the content's own default until dragged
    expect(body.style.getPropertyValue('--floating-body-max-height')).toBe('')
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 40, 200, 250))
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 250 })
    const edge = target.querySelector('.resize-edge')!

    //up from the height the body has now
    drag(edge, [400, 290], [400, 240])
    expect(state.maxHeight).toBe(200)
    expect(body.style.getPropertyValue('--floating-body-max-height')).toBe('200px')

    drag(edge, [400, 240], [400, 0])
    expect(state.maxHeight).toBe(160)

    //down to the viewport's edge, less the gap a drag keeps
    drag(edge, [400, 200], [400, 5000])
    expect(state.maxHeight).toBe(700 - 40 - 6)
})
