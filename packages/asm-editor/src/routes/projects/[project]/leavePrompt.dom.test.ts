/**
 * The project page asks before the browser leaves it only while leaving would lose changes
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision
 * 17): a shared Project, nobody's until saved, or changes that autosave is not keeping, as when
 * the browser refused to store them.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { makeProject } from '#lib/Project.svelte.ts'
import { createSharePayload } from '#lib/utils.ts'
import lzstring from 'lz-string'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { db } from '#lib/storage/db.ts'
import { goto } from '$app/navigation'

const page = vi.hoisted(() => ({
    params: { project: '' },
    url: new URL('https://asm-editor.specy.app/projects/')
}))
/** The page's `beforeNavigate` callbacks, which a navigation within the site calls first. */
const navigationGuards = vi.hoisted(() => [] as ((navigation: object) => void)[])
vi.mock('$app/state', () => ({ page }))
vi.mock('$app/navigation', () => ({
    goto: vi.fn(),
    beforeNavigate: (guard: (navigation: object) => void) => navigationGuards.push(guard)
}))
//Monaco does not run in jsdom, and the Workbench is not what these are about
vi.mock('#lib/monaco/Monaco.ts', () => ({ Monaco: { load: () => {}, dispose: () => {} } }))
vi.mock('#cmp/specific/workbench/Workbench.svelte', async () => ({
    default: (await import('#cmp/specific/workbench/__fixtures__/WorkbenchHostStub.svelte')).default
}))

// jsdom has no Web Animations API, which the page's transition uses.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

beforeEach(() => {
    preferencesStore.values.autoSave.value = true
    vi.spyOn(toast, 'logPill').mockImplementation(() => undefined)
    vi.mocked(goto).mockClear()
})
afterEach(async () => {
    navigationGuards.length = 0
    preferencesStore.values.autoSave.value = true
    for (const project of [...ProjectStore.projects]) await ProjectStore.deleteProject(project)
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

/** The project page at `/projects/<id><search>`, as it is first drawn. */
async function mountPage(id: string, search = '') {
    page.params.project = id
    page.url = new URL(`https://asm-editor.specy.app/projects/${id}${search}`)
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, { target })
    return { target, dispose: () => unmount(component) }
}

/** The project page over a Project, once the Workbench is in place of its loading screen. */
async function open(id: string, search = '') {
    const { target, dispose } = await mountPage(id, search)
    const button = (label: string) =>
        [...target.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === label
        )!
    await vi.waitFor(() => expect(button('Change')).toBeDefined())
    return {
        button,
        /** Whether leaving now would be asked about, as a browser asks for a cancelled unload. */
        asks() {
            const event = new Event('beforeunload', { cancelable: true })
            window.dispatchEvent(event)
            return event.defaultPrevented
        },
        /** Whether a navigation within the site went ahead, `type` as SvelteKit names it. */
        navigates(type: 'link' | 'popstate' | 'goto', willUnload = false) {
            let cancelled = false
            const navigation = { type, willUnload, cancel: () => (cancelled = true) }
            for (const guard of navigationGuards) guard(navigation)
            return !cancelled
        },
        dispose
    }
}

/** The page's error screen in place of the Workbench, once a load failed. */
async function failedToOpen(id: string, search = '') {
    const { target, dispose } = await mountPage(id, search)
    try {
        await vi.waitFor(() =>
            expect(target.querySelector('h1.error')?.textContent).toBe('Error loading project!')
        )
        expect(target.querySelector('button')).toBeNull()
    } finally {
        await dispose()
    }
}

it('lets a saved Project go without asking, and asks while changes wait for Save', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'leaving' }))
    const project = await open(stored.id)
    try {
        expect(project.asks()).toBe(false)
        //autosave keeps every change
        project.button('Change').click()
        flushSync()
        expect(project.asks()).toBe(false)
        preferencesStore.values.autoSave.value = false
        project.button('Change').click()
        flushSync()
        expect(project.asks()).toBe(true)
        project.button('Save').click()
        await vi.waitFor(() => expect(project.asks()).toBe(false))
    } finally {
        project.dispose()
    }
})

it('asks before leaving a shared Project, which is nobody’s until saved', async () => {
    const shared = createSharePayload(makeProject({ name: 'shared' }))
    const project = await open('share', `?project=${shared}`)
    try {
        expect(project.asks()).toBe(true)
    } finally {
        project.dispose()
    }
})

it('asks before going to another page of the site while changes wait for Save', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'back' }))
    const project = await open(stored.id)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
        //saved: the browser's Back, which Alt+← is outside a Listing, goes without a word
        expect(project.navigates('popstate')).toBe(true)
        expect(confirm).not.toHaveBeenCalled()
        preferencesStore.values.autoSave.value = false
        project.button('Change').click()
        flushSync()
        expect(project.navigates('popstate')).toBe(false)
        expect(project.navigates('link')).toBe(false)
        expect(confirm).toHaveBeenCalledTimes(2)
        confirm.mockReturnValue(true)
        expect(project.navigates('popstate')).toBe(true)
        //the page's own navigations have asked already, and an unload is the browser's to ask about
        confirm.mockClear()
        expect(project.navigates('goto')).toBe(true)
        expect(project.navigates('link', true)).toBe(true)
        expect(confirm).not.toHaveBeenCalled()
    } finally {
        project.dispose()
    }
})

/** The browser refusing every write of a Project, as a full quota or a blocked database does. */
function refuseWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db, 'updateProject').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
    return vi.spyOn(toast, 'error').mockImplementation(() => undefined)
}

it('keeps changes the browser did not store unsaved, and says no save happened', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'full' }))
    const project = await open(stored.id)
    const error = refuseWrites()
    try {
        project.button('Change').click()
        project.button('Autosave').click()
        await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
        expect(project.asks()).toBe(true)
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        expect(project.navigates('popstate')).toBe(false)
        expect(confirm).toHaveBeenCalledOnce()
        project.button('Save').click()
        await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2))
        expect(toast.logPill).not.toHaveBeenCalledWith('Project saved')
        expect(project.asks()).toBe(true)
    } finally {
        project.dispose()
    }
})

it('stays on the page when the save its Back asked for was not stored', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'stay' }))
    const project = await open(stored.id)
    preferencesStore.values.autoSave.value = false
    const error = refuseWrites()
    const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    try {
        project.button('Change').click()
        flushSync()
        project.button('Go back to your projects').click()
        await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
        expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Do you want to save them?')
        expect(toast.logPill).not.toHaveBeenCalledWith('Project saved')
        expect(goto).not.toHaveBeenCalled()
        expect(project.asks()).toBe(true)
    } finally {
        project.dispose()
    }
})

it('shows the error screen for a share link that does not read as a Project', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mangled = lzstring.compressToEncodedURIComponent('{"files":{"main.s"')
    await failedToOpen('share', `?project=${mangled}`)
    expect(error).toHaveBeenCalledWith('Invalid shared project link', 10000)
})

it('shows the error screen when the browser does not let it read the stored projects', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'blocked' }))
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const read = vi.spyOn(db, 'getProjects').mockRejectedValue(new Error('SecurityError'))
    await ProjectStore.load()
    try {
        await failedToOpen(stored.id)
        expect(error).toHaveBeenCalledWith('Could not load this project', 10000)
    } finally {
        read.mockRestore()
        await ProjectStore.load()
    }
})

it('puts a saved shared Project in place of its link in the history', async () => {
    vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    const shared = createSharePayload(makeProject({ name: 'kept' }))
    const project = await open('share', `?project=${shared}`)
    try {
        project.button('Save').click()
        await vi.waitFor(() => expect(goto).toHaveBeenCalledOnce())
        const saved = ProjectStore.projects.find((project) => project.name === 'kept')!
        expect(goto).toHaveBeenCalledWith(`/projects/${saved.id}`, { replace: true })
    } finally {
        project.dispose()
    }
})

it('keeps a shared Project unsaved when the browser does not store it', async () => {
    vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(db.projects, 'add').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
    const shared = createSharePayload(makeProject({ name: 'refused' }))
    const project = await open('share', `?project=${shared}`)
    try {
        project.button('Save').click()
        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith(
                'Could not save this project in the browser — your changes are not stored.',
                10000
            )
        )
        expect(goto).not.toHaveBeenCalled()
        expect(toast.logPill).not.toHaveBeenCalledWith('Project saved')
        expect(project.asks()).toBe(true)
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        expect(project.navigates('popstate')).toBe(false)
    } finally {
        project.dispose()
    }
})
