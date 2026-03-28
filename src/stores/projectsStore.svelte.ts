import { browser } from '$app/environment'
import { db } from '$lib/storage/db'
import { makeProjectFromExternal, type Project } from '$lib/Project.svelte'

export const SHARE_ID = '__share__'

function createProjectStore() {
    let inited = $state(false)
    let projects = $state<Project[]>([])
    let writableFiles = new Map<string, FileSystemFileHandle>()
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

    async function importFromExternal(code: string) {
        const project = makeProjectFromExternal(code)
        addProject(project)
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
