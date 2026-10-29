/**
 * The MARS and RARS pages, which run the original Java simulators through CheerpJ: one that cannot
 * load or start says so in place of the simulator, where it left an empty page and an unhandled
 * rejection or nothing at all.
 */
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(() => {
    vi.restoreAllMocks()
    delete (window as { cheerpjInit?: unknown }).cheerpjInit
    document.body.replaceChildren()
    for (const script of document.head.querySelectorAll('script')) script.remove()
})

/** What the page says in place of the simulator: its title and the error. */
function failure() {
    const alert = document.querySelector('[role="alert"]')
    return {
        title: alert?.querySelector('[role="heading"]')?.textContent,
        error: alert?.querySelector('.error-message')?.textContent
    }
}

const pages = [
    ['MARS', () => import('./mars/+page.svelte')],
    ['RARS', () => import('./rars/+page.svelte')]
] as const

it.each(pages)('says when CheerpJ cannot start %s', async (name, page) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    //its loader already on the page, as after a visit to the other simulator, and the start failing
    //as it does offline
    Object.assign(window, { cheerpjInit: () => Promise.reject(new Error('Failed to fetch')) })
    const app = mount((await page()).default, { target: document.body })
    await vi.waitFor(() =>
        expect(failure()).toEqual({ title: `${name} didn't start`, error: 'Failed to fetch' })
    )
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to fetch' }))
    void unmount(app)
})

it.each(pages)('says when the CheerpJ loader for %s cannot load', async (name, page) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = mount((await page()).default, { target: document.body })
    //the first visit adds the loader, whose download fails offline
    const script = await vi.waitFor(() => {
        const found = document.head.querySelector('script')
        if (!found) throw new Error('No loader yet')
        return found
    })
    expect(script.src).toContain('leaningtech.com')
    script.dispatchEvent(new Event('error'))
    flushSync()
    expect(failure()).toEqual({
        title: `${name} didn't start`,
        error: `Could not load ${script.src}`
    })
    expect(logged).toHaveBeenCalledWith(
        expect.objectContaining({ message: `Could not load ${script.src}` })
    )
    void unmount(app)
})
