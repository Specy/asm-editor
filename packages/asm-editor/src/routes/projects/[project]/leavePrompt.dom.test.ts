/**
 * The project page asks before the browser leaves it only while leaving would lose changes
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision
 * 17): a shared Project, nobody's until saved, or changes that autosave is not keeping.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { makeProject } from '#lib/Project.svelte.ts'
import { createSharePayload } from '#lib/utils.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

const page = vi.hoisted(() => ({
    params: { project: '' },
    url: new URL('https://asm-editor.specy.app/projects/')
}))
vi.mock('$app/state', () => ({ page }))
vi.mock('$app/navigation', () => ({ goto: vi.fn() }))
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
})
afterEach(async () => {
    preferencesStore.values.autoSave.value = true
    for (const project of [...ProjectStore.projects]) await ProjectStore.deleteProject(project)
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

/** The project page over a Project, once the Workbench is in place of its loading screen. */
async function open(id: string, search = '') {
    page.params.project = id
    page.url = new URL(`https://asm-editor.specy.app/projects/${id}${search}`)
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, { target })
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
        dispose: () => unmount(component)
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
