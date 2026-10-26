/**
 * The home page's way into the editor: the projects page while there may be projects, and
 * creating one only once the browser has said there are none.
 */
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { db } from '#lib/storage/db.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import HomePage from './+page.svelte'

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(async () => {
    vi.restoreAllMocks()
    await ProjectStore.load()
    document.body.replaceChildren()
})

/** Where the home page's button into the editor leads, and what it says. */
function editorLink() {
    const app = mount(HomePage, { target: document.body })
    flushSync()
    const link = document.querySelector<HTMLAnchorElement>('a[title="Open the editor"]')!
    const found = { href: link.getAttribute('href'), text: link.textContent?.trim() }
    unmount(app)
    return found
}

it('offers to create a first project once the browser says there are none', async () => {
    await ProjectStore.load()
    expect(editorLink()).toEqual({ href: '/projects/create', text: 'Create first project' })
})

it('leads to the projects page when the stored projects could not be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db, 'getProjects').mockRejectedValue(new Error('SecurityError'))
    await ProjectStore.load()
    expect(editorLink()).toEqual({ href: '/projects', text: 'Go to your projects' })
})
