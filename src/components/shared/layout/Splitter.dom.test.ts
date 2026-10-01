import { describe, expect, it } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import Splitter from './Splitter.svelte'

function render(props: { direction?: 1 | -1; orientation?: 'vertical' | 'horizontal' } = {}) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const events = { resized: [] as number[], committed: [] as number[] }
    let size = 200
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
                events.resized.push(next)
            },
            onCommit: (next: number) => events.committed.push(next)
        }
    })
    const handle = target.querySelector<HTMLElement>('[role="separator"]')!
    return {
        handle,
        events,
        cleanup() {
            unmount(component)
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
