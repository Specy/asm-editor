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
import { projectToArchive } from '#lib/projectArchive.ts'
import * as utilities from '#lib/utils.ts'

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
vi.mock('#lib/monaco/Monaco.ts', () => ({
    Monaco: { load: () => Promise.resolve(), dispose: () => {} }
}))
vi.mock('#cmp/specific/workbench/Workbench.svelte', async () => ({
    default: (await import('#cmp/specific/workbench/__fixtures__/WorkbenchHostStub.svelte')).default
}))

// jsdom has no Web Animations API, which the page's transition uses.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

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
        copyLink(label = 'Copy link') {
            button('Share').click()
            flushSync()
            button(label).click()
        },
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

/** The page's error screen in place of the Workbench, once a load failed: its title and error. */
async function failedToOpen(id: string, search = '') {
    const { target, dispose } = await mountPage(id, search)
    try {
        const alert = await vi.waitFor(() => {
            const shown = target.querySelector('[role="alert"]')
            expect(shown).not.toBeNull()
            return shown!
        })
        expect(target.querySelector('.workbench-host')).toBeNull()
        expect(alert.querySelector('a[href="/projects"]')?.textContent?.trim()).toBe(
            'Back to projects'
        )
        return {
            title: alert.querySelector('[role="heading"]')?.textContent,
            error: alert.querySelector('.error-message')?.textContent
        }
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
        await project.dispose()
    }
})

it('asks before leaving a shared Project, which is nobody’s until saved', async () => {
    const shared = createSharePayload(makeProject({ name: 'shared' }))
    const project = await open('share', `?project=${shared}`)
    try {
        expect(project.asks()).toBe(true)
    } finally {
        await project.dispose()
    }
})

function serveExample() {
    const bytes = projectToArchive(makeProject({ name: 'Bouncing ball', language: 'MIPS' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (input === '/examples/index.json')
            return new Response(
                JSON.stringify({
                    version: 1,
                    examples: {
                        'bouncing-ball': {
                            name: 'Bouncing ball',
                            description: '',
                            ports: [{ target: 'MIPS', archive: 'mips/bouncing-ball.asmproj' }]
                        }
                    }
                })
            )
        return new Response(new Uint8Array(bytes))
    })
}

it('opens examples without storing them, asks after an edit, and saves a personal copy on request', async () => {
    serveExample()
    const project = await open('share', '?example=mips-bouncing-ball')
    try {
        expect(ProjectStore.projects).toHaveLength(0)
        expect(project.asks()).toBe(false)
        project.button('Change').click()
        flushSync()
        expect(project.asks()).toBe(true)
        project.button('Autosave').click()
        await Promise.resolve()
        expect(ProjectStore.projects).toHaveLength(0)
        vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        project.button('Save').click()
        await vi.waitFor(() => expect(ProjectStore.projects).toHaveLength(1))
        expect(ProjectStore.projects[0].name).toBe('Bouncing ball')
    } finally {
        await project.dispose()
    }
})

it('shares an unchanged example by id and includes edits in a project share link', async () => {
    serveExample()
    const copy = vi.spyOn(utilities, 'copyText').mockResolvedValue(true)
    const project = await open('share', '?example=mips-bouncing-ball')
    try {
        project.copyLink()
        await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce())
        expect(copy.mock.calls[0][0]).toContain('/projects/share?example=mips-bouncing-ball')
        project.button('Change').click()
        flushSync()
        project.copyLink()
        await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(2))
        expect(copy.mock.calls[1][0]).toContain('/projects/share?project=')
        vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        project.button('Save').click()
        await vi.waitFor(() => expect(ProjectStore.projects).toHaveLength(1))
        project.copyLink()
        await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(3))
        expect(copy.mock.calls[2][0]).toContain('/projects/share?project=')
    } finally {
        await project.dispose()
    }
})

it('lets an example be looked around and left without asking, and still shares it by id', async () => {
    serveExample()
    const copy = vi.spyOn(utilities, 'copyText').mockResolvedValue(true)
    const confirm = vi.spyOn(Prompt, 'confirm')
    const project = await open('share', '?example=mips-bouncing-ball')
    try {
        //how it is viewed changes, as opening a tab or a Hex editor does, and its work does not
        project.button('View').click()
        flushSync()
        expect(project.asks()).toBe(false)
        expect(project.navigates('link')).toBe(true)
        project.copyLink()
        await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce())
        expect(copy.mock.calls[0][0]).toContain('/projects/share?example=mips-bouncing-ball')
        project.button('Go back to your projects').click()
        await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/projects'))
        expect(confirm).not.toHaveBeenCalled()
    } finally {
        await project.dispose()
    }
})

it('asks the Examples page to open the site when it shows the example in its frame', async () => {
    serveExample()
    const parent = { location: { origin: window.location.origin }, postMessage: vi.fn() }
    const own = Object.getOwnPropertyDescriptor(window, 'parent')!
    Object.defineProperty(window, 'parent', { configurable: true, get: () => parent })
    const project = await open('share', '?example=mips-bouncing-ball')
    try {
        project.button('Donate').click()
        await vi.waitFor(() =>
            expect(parent.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'asm-editor:example-leave',
                    example: 'mips-bouncing-ball',
                    destination: { to: 'donate' }
                }),
                window.location.origin
            )
        )
        expect(goto).not.toHaveBeenCalled()
    } finally {
        await project.dispose()
        Object.defineProperty(window, 'parent', own)
    }
})

it('reports an unknown example instead of falling back to a project payload', async () => {
    serveExample()
    expect((await failedToOpen('share', '?example=unknown&project=ignored')).title).toBe(
        'This example is not available'
    )
})

it.each([
    ['Copy link to build on open', 'build'],
    ['Copy link to build and run on open', 'buildAndRun']
])('copies example links with the startup option %s', async (label, flag) => {
    serveExample()
    const copy = vi.spyOn(utilities, 'copyText').mockResolvedValue(true)
    const project = await open('share', '?example=mips-bouncing-ball')
    try {
        project.copyLink(label)
        await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce())
        const url = new URL(copy.mock.calls[0][0])
        expect(url.searchParams.get('example')).toBe('mips-bouncing-ball')
        expect(url.searchParams.get(flag)).toBe('true')
        project.button('Change').click()
        flushSync()
        project.copyLink(label)
        await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(2))
        const edited = new URL(copy.mock.calls[1][0])
        expect(edited.searchParams.get('project')).toBeTruthy()
        expect(edited.searchParams.get(flag)).toBe('true')
    } finally {
        await project.dispose()
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
        await project.dispose()
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
        await project.dispose()
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
        await project.dispose()
    }
})

it('shows the error screen for a share link that does not read as a Project', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mangled = lzstring.compressToEncodedURIComponent('{"files":{"main.s"')
    //a link broken on its way here is no failure of the site's, so it has no error to report
    expect(await failedToOpen('share', `?project=${mangled}`)).toEqual({
        title: 'This shared link is broken',
        error: undefined
    })
})

it('shows the error screen when the browser does not let it read the stored projects', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'blocked' }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const read = vi.spyOn(db, 'getProjects').mockRejectedValue(new Error('SecurityError'))
    await ProjectStore.load()
    try {
        expect(await failedToOpen(stored.id)).toEqual({
            title: "This project didn't open",
            error: 'The stored projects could not be read'
        })
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
        await project.dispose()
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
        await project.dispose()
    }
})

it('offers to save again, on Back, a Project deleted in another tab', async () => {
    const stored = await ProjectStore.addProject(makeProject({ name: 'deleted' }))
    const project = await open(stored.id)
    const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    try {
        await db.deleteProject(stored)
        project.button('Go back to your projects').click()
        await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/projects'))
        expect(confirm).toHaveBeenCalledWith(
            'This project is not in your projects. Would you like to save it there?'
        )
        expect(ProjectStore.projects.map((saved) => saved.name)).toEqual(['deleted'])
    } finally {
        await project.dispose()
    }
})
