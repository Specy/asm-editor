import { describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import Splitter from './Splitter.svelte'

function render(
    props: {
        direction?: 1 | -1
        orientation?: 'vertical' | 'horizontal'
        /** Whether the pane can collapse to a strip, and whether it starts collapsed. */
        collapsible?: boolean
        collapsed?: boolean
        /** Whether the pane starts at its automatic size, which a resize gives a size of its own. */
        automatic?: boolean
    } = {}
) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const events = {
        resized: [] as number[],
        committed: [] as number[],
        collapses: [] as boolean[],
        resets: 0
    }
    let size = $state(200)
    let collapsed = $state(props.collapsed ?? false)
    let automatic = $state(props.automatic ?? false)
    const component = mount(Splitter, {
        target,
        props: {
            orientation: props.orientation ?? 'vertical',
            get size() {
                return size
            },
            min: 100,
            max: 300,
            direction: props.direction ?? 1,
            label: 'Resize the side panel',
            onResize: (next: number) => {
                size = next
                automatic = false
                events.resized.push(next)
            },
            onCommit: (next: number) => events.committed.push(next),
            get automatic() {
                return automatic
            },
            onReset: () => {
                size = 200
                automatic = true
                events.resets += 1
            },
            get collapsed() {
                return collapsed
            },
            onCollapse: props.collapsible
                ? (next: boolean) => {
                      collapsed = next
                      events.collapses.push(next)
                  }
                : undefined
        }
    })
    flushSync()
    const handle = target.querySelector<HTMLElement>('[role="separator"]')!
    return {
        handle,
        events,
        size: () => size,
        automatic: () => automatic,
        cleanup() {
            void unmount(component)
            target.remove()
        }
    }
}

function key(handle: HTMLElement, key: string) {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    flushSync()
}

//jsdom has no PointerEvent constructor, but a listener for `pointerdown` takes any event of that type
function pointer(handle: HTMLElement, type: string, clientX: number) {
    const event = new MouseEvent(type, { clientX, clientY: 0, button: 0, bubbles: true })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    handle.dispatchEvent(event)
    flushSync()
}

describe('Splitter', () => {
    it('describes itself as a separator with its bounds', () => {
        const { handle, cleanup } = render()
        expect(handle.getAttribute('aria-orientation')).toBe('vertical')
        expect(handle.getAttribute('aria-valuenow')).toBe('200')
        expect(handle.getAttribute('aria-valuemin')).toBe('100')
        expect(handle.getAttribute('aria-valuemax')).toBe('300')
        expect(handle.getAttribute('aria-label')).toBe('Resize the side panel')
        cleanup()
    })

    it('moves with the arrow keys and keeps each move', () => {
        const { handle, events, cleanup } = render()
        key(handle, 'ArrowRight')
        key(handle, 'ArrowLeft')
        key(handle, 'ArrowLeft')
        expect(events.resized).toEqual([216, 200, 184])
        expect(events.committed).toEqual([216, 200, 184])
        cleanup()
    })

    it('grows a pane after the handle when moved towards the start', () => {
        const { handle, events, cleanup } = render({ direction: -1 })
        key(handle, 'ArrowLeft')
        expect(events.resized).toEqual([216])
        cleanup()
    })

    it('jumps to its bounds with Home and End, and clamps a drag', () => {
        const { handle, events, cleanup } = render()
        key(handle, 'End')
        key(handle, 'Home')
        expect(events.committed).toEqual([300, 100])
        pointer(handle, 'pointerdown', 0)
        pointer(handle, 'pointermove', -500)
        pointer(handle, 'pointermove', 50)
        pointer(handle, 'pointerup', 50)
        expect(events.resized.slice(2)).toEqual([150])
        expect(events.committed[events.committed.length - 1]).toBe(150)
        cleanup()
    })

    it('answers the vertical arrows when it separates stacked panes', () => {
        const { handle, events, cleanup } = render({ orientation: 'horizontal' })
        key(handle, 'ArrowRight')
        key(handle, 'ArrowDown')
        expect(events.resized).toEqual([216])
        cleanup()
    })
})

describe('Splitter collapsing its pane to a strip', () => {
    it('collapses a pane dragged below half its minimum, back at the size the drag began with', () => {
        const splitter = render({ collapsible: true })
        pointer(splitter.handle, 'pointerdown', 0)
        //held at its minimum on the way down, as without collapsing
        pointer(splitter.handle, 'pointermove', -120)
        expect(splitter.size()).toBe(100)
        expect(splitter.events.collapses).toEqual([])
        pointer(splitter.handle, 'pointermove', -160)
        pointer(splitter.handle, 'pointerup', -160)
        expect(splitter.events.collapses).toEqual([true])
        //opening it again finds the width it had before the drag
        expect(splitter.size()).toBe(200)
        expect(splitter.handle.getAttribute('aria-valuenow')).toBe('0')
        expect(splitter.handle.getAttribute('aria-valuemin')).toBe('0')
        splitter.cleanup()
    })

    it('collapses a pane at its automatic size back at that size, not at its measure', () => {
        //the debug column, whose automatic width is no width of the person's to keep
        const splitter = render({ collapsible: true, automatic: true })
        pointer(splitter.handle, 'pointerdown', 0)
        pointer(splitter.handle, 'pointermove', -60)
        expect(splitter.automatic()).toBe(false)
        pointer(splitter.handle, 'pointermove', -160)
        pointer(splitter.handle, 'pointerup', -160)
        expect(splitter.events.collapses).toEqual([true])
        expect(splitter.events.resets).toBe(1)
        expect(splitter.automatic()).toBe(true)
        splitter.cleanup()
    })

    it('opens a collapsed pane dragged out past the threshold, at the pointer', () => {
        const splitter = render({ collapsible: true, collapsed: true, direction: -1 })
        pointer(splitter.handle, 'pointerdown', 500)
        pointer(splitter.handle, 'pointermove', 470)
        expect(splitter.events.collapses).toEqual([])
        pointer(splitter.handle, 'pointermove', 380)
        pointer(splitter.handle, 'pointerup', 380)
        expect(splitter.events.collapses).toEqual([false])
        expect(splitter.events.resized).toEqual([120])
        expect(splitter.handle.getAttribute('aria-valuenow')).toBe('120')
        splitter.cleanup()
    })

    it('collapses and opens with Enter, and collapsed only opens with the arrow that grows it', () => {
        const splitter = render({ collapsible: true, direction: -1 })
        key(splitter.handle, 'Enter')
        expect(splitter.events.collapses).toEqual([true])
        key(splitter.handle, 'ArrowRight')
        key(splitter.handle, 'Home')
        key(splitter.handle, 'End')
        expect(splitter.events.collapses).toEqual([true])
        expect(splitter.events.resized).toEqual([])
        key(splitter.handle, 'ArrowLeft')
        expect(splitter.events.collapses).toEqual([true, false])
        key(splitter.handle, 'Enter')
        key(splitter.handle, 'Enter')
        expect(splitter.events.collapses).toEqual([true, false, true, false])
        //opened, the arrows resize again
        key(splitter.handle, 'ArrowLeft')
        expect(splitter.events.resized).toEqual([216])
        splitter.cleanup()
    })

    it('leaves Enter alone on a pane that cannot collapse', () => {
        const splitter = render()
        const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
        splitter.handle.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        expect(splitter.handle.getAttribute('aria-valuemin')).toBe('100')
        splitter.cleanup()
    })
})
