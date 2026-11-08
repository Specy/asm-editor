/**
 * An element's border-box size as it changes, for a Popover's outline drawn round a card that
 * shows and hides by CSS alone, such as a hover card over a value. Many such cards are mounted at
 * once (one per memory cell, one per register), so they share one ResizeObserver; where there is
 * none (jsdom), nothing is reported and the outline stays undrawn.
 */
type Report = (width: number, height: number) => void

let observer: ResizeObserver | undefined
const reports = new WeakMap<Element, Report>()

function shared(): ResizeObserver | undefined {
    if (observer || typeof ResizeObserver === 'undefined') return observer
    observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const element = entry.target as HTMLElement
            reports.get(element)?.(element.offsetWidth, element.offsetHeight)
        }
    })
    return observer
}

/** `use:elementSize={(width, height) => …}`: called with the size now and after every change. */
export function elementSize(node: HTMLElement, report: Report) {
    reports.set(node, report)
    shared()?.observe(node)
    return {
        update(next: Report) {
            reports.set(node, next)
        },
        destroy() {
            observer?.unobserve(node)
            reports.delete(node)
        }
    }
}
