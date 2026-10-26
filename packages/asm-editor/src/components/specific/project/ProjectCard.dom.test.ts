/**
 * A Project's card on the projects page, whose name and description are edited in place and saved
 * when they lose the focus.
 */
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ProjectCard from './ProjectCard.svelte'
import { makeProject, type Project } from '#lib/Project.svelte.ts'
import { db } from '#lib/storage/db.ts'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

afterEach(async () => {
    vi.restoreAllMocks()
    for (const project of [...ProjectStore.projects]) await ProjectStore.deleteProject(project)
    document.body.replaceChildren()
})

/** A stored Project, and the copy of it the projects page's list holds. */
async function stored(name: string, content = 'moveq #1, d0') {
    const project = await ProjectStore.addProject(
        makeProject({
            name,
            description: 'as it was',
            language: 'M68K',
            entry: 'main.m68k',
            files: { 'main.m68k': { encoding: 'plain', content } }
        })
    )
    return ProjectStore.projects.find((listed) => listed.id === project.id)!
}

function card(project: Project) {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(ProjectCard, { target, props: { project } })
    flushSync()
    const field = (label: string) => target.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
    return {
        name: field('Project name'),
        description: field('Project description'),
        deleteButton: field('Delete this project'),
        dispose: () => unmount(component)
    }
}

/** Typing `text` over a field's text, as a person does, then leaving it. */
function type(field: HTMLElement, text: string) {
    field.textContent = text
    field.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    field.dispatchEvent(new FocusEvent('blur'))
}

it('saves nothing when the name and description lose the focus unchanged', async () => {
    const project = await stored('kept')
    const write = vi.spyOn(db, 'updateProject')
    const { name, description, dispose } = card(project)
    try {
        name.dispatchEvent(new FocusEvent('blur'))
        description.dispatchEvent(new FocusEvent('blur'))
        await new Promise((resolve) => setTimeout(resolve))
        expect(write).not.toHaveBeenCalled()
        expect(ProjectStore.projects[0].updatedAt).toBe(project.updatedAt)
    } finally {
        await dispose()
    }
})

it('renames the Project as it is stored, keeping what another tab saved since', async () => {
    const project = await stored('old')
    //a Workbench in another tab saves new Files, which the list's copy has not read
    const elsewhere = (await db.getProject(project.id))!
    await db.updateProject({
        ...elsewhere.toObject(),
        files: { 'main.m68k': { encoding: 'plain', content: 'moveq #2, d0' } }
    })
    const { name, description, dispose } = card(project)
    try {
        type(name, 'new')
        await vi.waitFor(async () => expect((await db.getProject(project.id))?.name).toBe('new'))
        type(description, 'described')
        await vi.waitFor(async () =>
            expect((await db.getProject(project.id))?.description).toBe('described')
        )
        const saved = (await db.getProject(project.id))!
        expect(saved.files['main.m68k']).toEqual({ encoding: 'plain', content: 'moveq #2, d0' })
    } finally {
        await dispose()
    }
})

it('saves only the field that changed, keeping a name another tab gave since', async () => {
    const project = await stored('old')
    //a Workbench in another tab renames the Project, which the list's copy has not read
    const elsewhere = (await db.getProject(project.id))!
    await db.updateProject({ ...elsewhere.toObject(), name: 'renamed elsewhere' })
    const { description, dispose } = card(project)
    try {
        type(description, 'described')
        await vi.waitFor(async () =>
            expect((await db.getProject(project.id))?.description).toBe('described')
        )
        expect((await db.getProject(project.id))?.name).toBe('renamed elsewhere')
    } finally {
        await dispose()
    }
})

it('says when the browser did not store a rename or a delete', async () => {
    const project = await stored('refused')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db, 'updateProject').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
    vi.spyOn(db, 'deleteProject').mockRejectedValue(new DOMException('Full', 'UnknownError'))
    vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    const { name, deleteButton, dispose } = card(project)
    try {
        type(name, 'renamed')
        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith('Could not save "renamed" in the browser')
        )
        deleteButton.click()
        await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Could not delete "refused"'))
        expect(ProjectStore.projects.map((listed) => listed.name)).toEqual(['refused'])
    } finally {
        await dispose()
    }
})
