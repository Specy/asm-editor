import { browser } from '$app/environment'
import { db } from '$lib/storage/db'
import { requestPersistentStorage } from '$lib/storage/persist'
import { type ExternalImport, makeProjectFromExternal, type Project } from '$lib/Project.svelte'

export const SHARE_ID = '__share__'

function createProjectStore() {
    let inited = $state(false)
    let projects = $state<Project[]>([])
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative async/event workflows use this registry; it has no tracked consumer.
    const writableFiles = new Map<string, FileSystemFileHandle>()
    if (browser) {
        load()
    }

    async function load() {
        const p = await db.getProjects()
        p.sort((a, b) => b.updatedAt - a.updatedAt)
        projects = p
        inited = true
        return projects
    }

    async function addProject(project: Project): Promise<Project> {
        project.updatedAt = new Date().getTime()
        const result = await db.addProject(project)
        void requestPersistentStorage()
        await load()
        return result
    }

    async function save(project: Project): Promise<void> {
        if (project.id === SHARE_ID) throw new Error('Cannot save shared project')
        project.updatedAt = new Date().getTime()
        const file = writableFiles.get(project.id)
        try {
            if (file) {
                const writer = await file.createWritable()
                await writer.write(project.toExternal())
                await writer.close()
            }
        } catch (e) {
            console.error(e)
        }
        await db.updateProject(project)
        await load()
    }

    async function deleteProject(project: Project): Promise<void> {
        await db.deleteProject(project)
        await load()
    }

    async function importFromExternal(code: string): Promise<ExternalImport> {
        const imported = makeProjectFromExternal(code)
        await addProject(imported.project)
        return imported
    }

    function setFileHandle(id: string, handle: FileSystemFileHandle) {
        writableFiles.set(id, handle)
    }

    async function getProject(id: string) {
        if (!inited) await load()
        return projects.find((project) => project.id === id)
    }

    function getProjectFromDb(id: string) {
        if (id === SHARE_ID) return null
        return db.getProject(id)
    }

    return {
        get inited() {
            return inited
        },
        get projects() {
            return projects
        },
        writableFiles,
        load,
        addProject,
        save,
        deleteProject,
        importFromExternal,
        setFileHandle,
        getProject,
        getProjectFromDb
    }
}

export const ProjectStore = createProjectStore()
