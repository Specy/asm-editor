import type { Attachment } from 'svelte/attachments'

/**
 * Tells whether an element held at the bottom of the window with `position: sticky; bottom: 0` is
 * stuck there, over content still scrolling under it, or sits in its own place at the end of what
 * holds it. A 1px marker at the bottom of its nearest positioned ancestor (a Card) is watched: while
 * that end is below the window the element is stuck. Out of the flow, so it moves nothing.
 */
export function stuckToBottom(onChange: (stuck: boolean) => void): Attachment<HTMLElement> {
    return (element) => {
        const holder = element.parentElement
        if (!holder || typeof IntersectionObserver === 'undefined') return
        const marker = document.createElement('div')
        marker.setAttribute('aria-hidden', 'true')
        marker.style.cssText =
            'position: absolute; bottom: 0; left: 0; width: 1px; height: 1px; pointer-events: none; visibility: hidden'
        holder.append(marker)
        const observer = new IntersectionObserver(([entry]) => {
            onChange(!entry.isIntersecting && entry.boundingClientRect.top > 0)
        })
        observer.observe(marker)
        return () => {
            observer.disconnect()
            marker.remove()
            onChange(false)
        }
    }
}
