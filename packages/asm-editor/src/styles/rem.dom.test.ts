import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'

/**
 * The root's font size is read once and kept until a hidden element one rem wide says it changed,
 * so that a panel mounting dozens of cards that ask for it does not recalculate the styles once per
 * card; without a ResizeObserver it is read every time, as it always was.
 */

let observed: (() => void) | undefined

beforeEach(() => {
    vi.resetModules()
    observed = undefined
    document.documentElement.style.fontSize = '20px'
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.style.fontSize = ''
    document.body.replaceChildren()
})

/** A ResizeObserver whose one report the test makes itself. */
function fakeResizeObserver() {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(report: () => void) {
                observed = report
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
}

it('reads the size again only once the probe reports a change', async () => {
    fakeResizeObserver()
    const read = vi.spyOn(window, 'getComputedStyle')
    const { rootFontSize, remToPx } = await import('./rem')
    expect(rootFontSize()).toBe(20)
    expect(remToPx(0.5)).toBe(10)
    expect(rootFontSize()).toBe(20)
    expect(read).toHaveBeenCalledTimes(1)
    //the probe is in the page, hidden, one rem square
    const probe = document.body.lastElementChild as HTMLElement
    expect(probe.getAttribute('aria-hidden')).toBe('true')
    expect(probe.style.width).toBe('1rem')
    //the browser's text size changed
    document.documentElement.style.fontSize = '24px'
    observed!()
    expect(rootFontSize()).toBe(24)
    expect(read).toHaveBeenCalledTimes(2)
})

it('puts the probe back when something took it out of the page', async () => {
    fakeResizeObserver()
    const { rootFontSize } = await import('./rem')
    rootFontSize()
    document.body.replaceChildren()
    //a probe taken out shrinks to nothing, which its observer reports
    observed!()
    expect(rootFontSize()).toBe(20)
    expect(document.body.lastElementChild?.getAttribute('aria-hidden')).toBe('true')
})

it('reads it every time where nothing can watch it', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const read = vi.spyOn(window, 'getComputedStyle')
    const { rootFontSize } = await import('./rem')
    expect(rootFontSize()).toBe(20)
    document.documentElement.style.fontSize = '18px'
    expect(rootFontSize()).toBe(18)
    expect(read).toHaveBeenCalledTimes(2)
    expect(document.body.childElementCount).toBe(0)
})
