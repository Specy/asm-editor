/**
 * The home page's way into the editor: the projects page while there may be projects, and
 * creating one only once the browser has said there are none. It counts the stored Projects
 * without reading them: reading the list reads and checks every Project, seconds for large ones.
 */
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { db } from '#lib/storage/db.ts'
import { makeProject } from '#lib/Project.svelte.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import HomePage from './+page.svelte'

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(async () => {
    vi.restoreAllMocks()
    await db.projects.clear()
    document.body.replaceChildren()
})

/** Where the home page's button into the editor leads, and what it says, once it has counted. */
async function editorLink() {
    const count = vi.spyOn(db.projects, 'count')
    const app = mount(HomePage, { target: document.body })
    flushSync()
    await vi.waitFor(() => expect(count).toHaveBeenCalled())
    await Promise.resolve(count.mock.results[0].value).catch(() => undefined)
    await tick()
    flushSync()
    //the link its Tooltip describes as opening the editor
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[aria-describedby]')].find(
        (a) =>
            document.getElementById(a.getAttribute('aria-describedby')!)?.textContent ===
            'Open the editor'
    )!
    const found = { href: link.getAttribute('href'), text: link.textContent?.trim() }
    void unmount(app)
    return found
}

it('offers to create a first project once the browser says there are none', async () => {
    expect(await editorLink()).toEqual({ href: '/projects/create', text: 'Create first project' })
})

it('leads to the projects page when there are some, without reading them', async () => {
    await db.addProject(makeProject({ name: 'stored' }))
    const read = vi.spyOn(db, 'getProjects')
    const get = vi.spyOn(db.projects, 'toArray')
    expect(await editorLink()).toEqual({ href: '/projects', text: 'Go to your projects' })
    expect(read).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(ProjectStore.inited).toBe(false)
})

it('leads to the projects page when the stored projects could not be counted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db.projects, 'count').mockRejectedValue(new Error('SecurityError'))
    expect(await editorLink()).toEqual({ href: '/projects', text: 'Go to your projects' })
})
