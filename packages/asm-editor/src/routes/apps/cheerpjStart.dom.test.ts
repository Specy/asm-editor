/**
 * The MARS and RARS pages, which run the original Java simulators through CheerpJ: one that cannot
 * start says so, where it left an empty page and an unhandled rejection.
 */
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { mount, unmount } from 'svelte'
import { toast } from '#stores/toastStore.ts'

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(() => {
    vi.restoreAllMocks()
    delete (window as { cheerpjInit?: unknown }).cheerpjInit
    document.body.replaceChildren()
})

it.each([
    ['MARS', () => import('./mars/+page.svelte')],
    ['RARS', () => import('./rars/+page.svelte')]
])('says when CheerpJ cannot start %s', async (name, page) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    //its loader already on the page, as after a visit to the other simulator, and the start failing
    //as it does offline
    Object.assign(window, { cheerpjInit: () => Promise.reject(new Error('Failed to fetch')) })
    const app = mount((await page()).default, { target: document.body })
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(`Could not start ${name}`))
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to fetch' }))
    void unmount(app)
})
