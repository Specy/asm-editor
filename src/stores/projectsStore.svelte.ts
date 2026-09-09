import { browser } from '$app/environment'
import { db } from '$lib/storage/db'
import { requestPersistentStorage } from '$lib/storage/persist'
import {
    type ExternalImport,
    makeProject,
    makeProjectFromExternal,
    type Project
} from '$lib/Project.svelte'
import { isLegacyLinkedFileCompatible, projectToArchive } from '$lib/projectArchive'

export const SHARE_ID = '__share__'

function createProjectStore() {
    let inited = $state(false)
    let projects = $state<Project[]>([])
    type LinkedFile = { handle: FileSystemFileHandle; format: 'legacy' | 'archive' }
    type SaveResult = { linked: 'none' | 'saved' | 'needs-archive' | 'failed'; error?: unknown }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative async/event workflows use this registry; it has no tracked consumer.
    const writableFiles = new Map<string, LinkedFile>()
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Promise serialization is internal and has no tracked consumer.
    const saveTails = new Map<string, Promise<void>>()
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

    async function save(project: Project): Promise<SaveResult> {
        if (project.id === SHARE_ID) throw new Error('Cannot save shared project')
        project.updatedAt = new Date().getTime()
        const snapshot = project.toObject()
        const previous = saveTails.get(project.id) ?? Promise.resolve()
        let finish!: () => void
        const tail = new Promise<void>((resolve) => {
            finish = resolve
        })
        const queued = previous.catch(() => {}).then(() => tail)
        saveTails.set(project.id, queued)
        await previous.catch(() => {})
        let result: SaveResult = { linked: 'none' }
        try {
            const linked = writableFiles.get(snapshot.id)
            if (linked) {
                if (linked.format === 'legacy' && !isLegacyLinkedFileCompatible(snapshot)) {
                    result = { linked: 'needs-archive' }
                } else {
                    const contents =
                        linked.format === 'archive'
                            ? projectToArchive(snapshot)
                            : makeProject(snapshot).toExternal()
                    const writer = await linked.handle.createWritable()
                    await writer.write(
                        typeof contents === 'string' ? contents : new Uint8Array(contents).buffer
                    )
                    await writer.close()
                    result = { linked: 'saved' }
                }
            }
        } catch (error) {
            console.error(error)
            result = { linked: 'failed', error }
        }
        try {
            //The linked write and IndexedDB both use the same immutable save snapshot. Queuing the
            //whole operation prevents a slow old disk write from landing after a newer one.
            await db.updateProject(makeProject(snapshot))
        } finally {
            finish()
            if (saveTails.get(snapshot.id) === queued) saveTails.delete(snapshot.id)
        }
        await load()
        return result
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

    function setFileHandle(
        id: string,
        handle: FileSystemFileHandle,
        format: 'legacy' | 'archive' = 'legacy'
    ) {
        writableFiles.set(id, { handle, format })
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
