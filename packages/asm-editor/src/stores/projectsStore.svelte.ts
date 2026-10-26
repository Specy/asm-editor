import { browser } from '$app/env'
import { db, type ProjectJournals } from '#lib/storage/db.ts'
import { requestPersistentStorage } from '#lib/storage/persist.ts'
import {
    type ExternalImport,
    makeProject,
    makeProjectFromExternal,
    type Project,
    type ProjectData
} from '#lib/Project.svelte.ts'

import { isLegacyLinkedFileCompatible, projectToArchive } from '#lib/projectArchive.ts'

export const SHARE_ID = '__share__'

function createProjectStore() {
    let inited = $state(false)
    /**
     * Whether the last read of the stored projects failed, as it does when the browser blocks the
     * site's storage or cannot open it: the list is then unknown rather than empty.
     */
    let loadFailed = $state(false)
    let projects = $state<Project[]>([])
    type LinkedFile = { handle: FileSystemFileHandle; format: 'legacy' | 'archive' }
    type SaveResult = {
        linked: 'none' | 'saved' | 'needs-archive' | 'failed'
        /** Whether the browser's own copy was written. A failure here is unsaved work. */
        local: 'saved' | 'failed'
        error?: unknown
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative async/event workflows use this registry; it has no tracked consumer.
    const writableFiles = new Map<string, LinkedFile>()
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Promise serialization is internal and has no tracked consumer.
    const saveTails = new Map<string, Promise<SaveResult>>()
    if (browser) {
        load()
    }

    /** Reads the stored projects again; a read that fails keeps the list and sets `loadFailed`. */
    async function load() {
        try {
            const p = await db.getProjects()
            p.sort((a, b) => b.updatedAt - a.updatedAt)
            projects = p
            loadFailed = false
        } catch (error) {
            console.error(error)
            loadFailed = true
        }
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

    /**
     * Writes a save's snapshot to the browser's copy, with the journals it took, and then to the
     * Project's linked file, if it has one. Never rejects: what failed is in the result.
     */
    async function write(
        snapshot: ProjectData,
        taken: ReturnType<ProjectJournals['take']> | undefined
    ): Promise<SaveResult> {
        let result: SaveResult = { linked: 'none', local: 'saved' }
        //The browser's copy first: a save started as the page closes reaches IndexedDB before the
        //page is gone, where after a disk write it would never start.
        try {
            await db.updateProject(snapshot, taken?.writes)
        } catch (error) {
            taken?.putBack()
            //A quota or a blocked database means the work is not stored anywhere. Reported rather
            //than rejected, so autosave's caller can tell the user instead of producing an
            //unhandled rejection that leaves them believing the project is saved.
            console.error(error)
            result = { linked: 'none', local: 'failed', error }
        }
        try {
            const linked = writableFiles.get(snapshot.id)
            if (linked) {
                if (linked.format === 'legacy' && !isLegacyLinkedFileCompatible(snapshot)) {
                    result = { ...result, linked: 'needs-archive' }
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
                    result = { ...result, linked: 'saved' }
                }
            }
        } catch (error) {
            console.error(error)
            result = { ...result, linked: 'failed', error: result.error ?? error }
        }
        return result
    }

    /**
     * Saves a Project, and with it the Edit journals of `journals` that changed, read as its
     * snapshot is taken so that each fits the File the snapshot holds (ADR 0063).
     */
    async function save(project: Project, journals?: ProjectJournals): Promise<SaveResult> {
        if (project.id === SHARE_ID) throw new Error('Cannot save shared project')
        project.updatedAt = new Date().getTime()
        const snapshot = project.toObject()
        const taken = journals?.take()
        //The linked write and IndexedDB both use the same immutable save snapshot. Queuing the
        //whole operation prevents a slow old disk write from landing after a newer one.
        const saving = (saveTails.get(snapshot.id) ?? Promise.resolve())
            .catch(() => {})
            .then(() => write(snapshot, taken))
        saveTails.set(snapshot.id, saving)
        const result = await saving
        if (saveTails.get(snapshot.id) === saving) saveTails.delete(snapshot.id)
        await load()
        return result
    }

    /**
     * Gives a stored Project a new name and description, saving the rest of it as it is stored
     * now: a list's copy may be older than what a Workbench in another tab saved since.
     */
    async function saveDetails(
        id: string,
        details: { name: string; description: string }
    ): Promise<SaveResult> {
        let stored: Project | undefined
        try {
            stored = await db.getProject(id)
        } catch (error) {
            console.error(error)
            return { linked: 'none', local: 'failed', error }
        }
        if (!stored) return { linked: 'none', local: 'failed' }
        stored.name = details.name
        stored.description = details.description
        return save(stored)
    }

    async function deleteProject(project: Project): Promise<void> {
        await db.deleteProject(project)
        await load()
    }

    async function importFromExternal(code: string): Promise<ExternalImport> {
        const imported = await makeProjectFromExternal(code)
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

    /**
     * The stored project with the id `id`, or undefined when there is none; rejects when the
     * stored projects cannot be read, which is no answer about this one.
     */
    async function getProject(id: string) {
        if (!inited || loadFailed) await load()
        if (loadFailed) throw new Error('The stored projects could not be read')
        return projects.find((project) => project.id === id)
    }

    function getProjectFromDb(id: string) {
        if (id === SHARE_ID) return null
        return db.getProject(id)
    }

    /**
     * Where a Project's Edit journals are kept, which `save` writes with it; a shared link's, never
     * saved, has none.
     */
    function journalStore(id: string): ProjectJournals | undefined {
        return id === SHARE_ID ? undefined : db.journalStore(id)
    }

    return {
        get inited() {
            return inited
        },
        get loadFailed() {
            return loadFailed
        },
        get projects() {
            return projects
        },
        writableFiles,
        load,
        addProject,
        save,
        saveDetails,
        deleteProject,
        importFromExternal,
        setFileHandle,
        getProject,
        getProjectFromDb,
        journalStore
    }
}

export const ProjectStore = createProjectStore()
