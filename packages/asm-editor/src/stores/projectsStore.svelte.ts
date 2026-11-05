import { db, type ProjectJournals } from '#lib/storage/db.ts'
import { requestPersistentStorage } from '#lib/storage/persist.ts'
import { makeProject, type Project, type ProjectData } from '#lib/Project.svelte.ts'
import { SHARE_ID } from '#lib/shareId.ts'

import { isLegacyLinkedFileCompatible, projectToArchive } from '#lib/projectArchive.ts'

/** The list's order: the Project edited last first. */
const byUpdated = (a: Project, b: Project) => b.updatedAt - a.updatedAt

/**
 * The Projects the browser keeps. Reading the list reads and checks every stored Project, which for
 * a few large ones takes seconds and holds them all in memory, so only the Projects page reads it
 * (`load`, then `unload` as it goes); every other page reads the one Project it needs, or asks
 * how many there are (`storedProjectCount`). A save replaces its Project's entry in a list that is
 * loaded, rather than reading the list again
 * ([ADR 0076](../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)).
 */
function createProjectStore() {
    let inited = $state(false)
    /**
     * Whether the last read of the stored projects failed, as it does when the browser blocks the
     * site's storage or cannot open it: the list is then unknown rather than empty.
     */
    let loadFailed = $state(false)
    let projects = $state<Project[]>([])
    /** Counts `unload`s, so that a read of the list that ends after one leaves it unloaded. */
    let loads = 0
    type LinkedFile = { handle: FileSystemFileHandle; format: 'legacy' | 'archive' }
    type SaveResult = {
        linked: 'none' | 'saved' | 'needs-archive' | 'failed'
        /** Whether the browser's own copy was written. A failure here is unsaved work. */
        local: 'saved' | 'failed'
        error?: unknown
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative async/event workflows use this registry; it has no tracked consumer.
    const writableFiles = new Map<string, LinkedFile>()
    /** Each Project's newest write to the browser's copy, which a read waits for. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal write tracking, never read reactively.
    const localWrites = new Map<string, Promise<unknown>>()

    /**
     * Waits for the saves in flight, of the Project with the id `id` or of every Project, so that
     * what is read next is what they stored: a Workbench that closes starts its last save as it
     * goes, and the page that opens next reads what it saved.
     */
    async function settled(id?: string) {
        const pending = id === undefined ? [...localWrites.values()] : [localWrites.get(id)]
        await Promise.all(pending)
    }

    /** Reads the stored projects again; a read that fails keeps the list and sets `loadFailed`. */
    async function load() {
        const generation = loads
        await settled()
        let read: Project[] | undefined
        let failed = false
        try {
            read = await db.getProjects()
            read.sort(byUpdated)
        } catch (error) {
            console.error(error)
            failed = true
        }
        if (generation !== loads) return projects
        if (read) projects = read
        loadFailed = failed
        inited = true
        return projects
    }

    /**
     * Forgets the list, which the Projects page calls as it goes: the list holds every stored
     * Project, which the pages without one have no use for.
     */
    function unload() {
        loads += 1
        projects = []
        inited = false
        loadFailed = false
    }

    /**
     * Puts the Project as `data` holds it in a loaded list, in place of its entry: what was saved
     * is what the list would read again, so it is not read again.
     */
    function listed(data: ProjectData) {
        if (!inited) return
        const entry = makeProject(data)
        projects = [...projects.filter((project) => project.id !== entry.id), entry].sort(byUpdated)
    }

    async function addProject(project: Project): Promise<Project> {
        project.updatedAt = new Date().getTime()
        const result = await db.addProject(project)
        void requestPersistentStorage()
        listed(result.toObject())
        return result
    }

    /**
     * Writes a save's snapshot to the browser's copy, with the journals it took. It starts its
     * write before it returns, queued behind nothing: IndexedDB runs one Project's writes in the
     * order they start, so a newer snapshot always lands after an older one, and a save started as
     * the page closes is on its way before the page is gone. Never rejects.
     */
    function writeLocal(
        snapshot: ProjectData,
        taken: ReturnType<ProjectJournals['take']> | undefined
    ): Promise<Pick<SaveResult, 'local' | 'error'>> {
        let writing: Promise<void>
        try {
            writing = db.updateProject(snapshot, taken?.writes)
        } catch (error) {
            writing = Promise.reject(error)
        }
        return writing.then(
            () => ({ local: 'saved' as const }),
            (error: unknown) => {
                taken?.putBack()
                //A quota or a blocked database means the work is not stored anywhere. Reported
                //rather than rejected, so autosave's caller can tell the user instead of producing
                //an unhandled rejection that leaves them believing the project is saved.
                console.error(error)
                return { local: 'failed' as const, error }
            }
        )
    }

    /** What writing a Project's linked file came to. */
    type LinkedResult = Pick<SaveResult, 'linked' | 'error'>

    /**
     * Writes a snapshot to the Project's linked file, if it has one. Never rejects: what failed is
     * in the result.
     */
    async function writeLinkedFile(snapshot: ProjectData): Promise<LinkedResult> {
        const linked = writableFiles.get(snapshot.id)
        if (!linked) return { linked: 'none' }
        if (linked.format === 'legacy' && !isLegacyLinkedFileCompatible(snapshot))
            return { linked: 'needs-archive' }
        try {
            //zipped in Workers: a large Project's archive takes seconds to compress
            const contents =
                linked.format === 'archive'
                    ? await projectToArchive(snapshot)
                    : makeProject(snapshot).toExternal()
            const writer = await linked.handle.createWritable()
            await writer.write(
                typeof contents === 'string' ? contents : new Uint8Array(contents).buffer
            )
            await writer.close()
            return { linked: 'saved' }
        } catch (error) {
            console.error(error)
            return { linked: 'failed', error }
        }
    }

    /**
     * Each Project's linked-file writes: the one being written, and the newest snapshot waiting
     * for it to finish, which a newer save replaces, so that a slow disk write never lands after a
     * newer one and the saves while it is written cost one more write, not one each.
     */
    type LinkedQueue = {
        running: boolean
        waiting?: { snapshot: ProjectData; settle: ((result: LinkedResult) => void)[] }
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal write queues, never read reactively.
    const linkedQueues = new Map<string, LinkedQueue>()

    function writeLinked(snapshot: ProjectData): Promise<LinkedResult> {
        if (!writableFiles.has(snapshot.id)) return Promise.resolve({ linked: 'none' })
        let queue = linkedQueues.get(snapshot.id)
        if (!queue) linkedQueues.set(snapshot.id, (queue = { running: false }))
        const result = new Promise<LinkedResult>((settle) => {
            if (queue.waiting) {
                queue.waiting.snapshot = snapshot
                queue.waiting.settle.push(settle)
            } else queue.waiting = { snapshot, settle: [settle] }
        })
        if (!queue.running) void drainLinked(snapshot.id, queue)
        return result
    }

    async function drainLinked(id: string, queue: LinkedQueue) {
        queue.running = true
        while (queue.waiting) {
            const { snapshot, settle } = queue.waiting
            queue.waiting = undefined
            const result = await writeLinkedFile(snapshot)
            for (const each of settle) each(result)
        }
        queue.running = false
        if (linkedQueues.get(id) === queue) linkedQueues.delete(id)
    }

    /**
     * Whether a Project's linked file is being written, or waits to be: closing the page then
     * leaves the file on disk older than the Project, so the page asks first.
     */
    function linkedWritePending(id: string): boolean {
        return linkedQueues.has(id)
    }

    /**
     * Saves a Project, and with it the Edit journals of `journals` that changed, read as its
     * snapshot is taken so that each fits the File the snapshot holds (ADR 0063): the browser's
     * copy at once, then the linked file, if any, after the writes to it before this one.
     */
    async function save(project: Project, journals?: ProjectJournals): Promise<SaveResult> {
        if (project.id === SHARE_ID) throw new Error('Cannot save shared project')
        project.updatedAt = new Date().getTime()
        const snapshot = project.toObject()
        const taken = journals?.take()
        const local = writeLocal(snapshot, taken)
        localWrites.set(snapshot.id, local)
        const stored = await local
        if (localWrites.get(snapshot.id) === local) localWrites.delete(snapshot.id)
        if (stored.local === 'saved') listed(snapshot)
        //the disk file even when the browser refused its copy: then it is the only one
        const linked = await writeLinked(snapshot)
        return { local: stored.local, linked: linked.linked, error: stored.error ?? linked.error }
    }

    /**
     * Gives a stored Project the name or description in `details`, saving the rest of it as it is
     * stored now: a list's copy may be older than what a Workbench in another tab saved since.
     */
    async function saveDetails(
        id: string,
        details: Partial<{ name: string; description: string }>
    ): Promise<SaveResult> {
        let stored: Project | undefined
        try {
            await settled(id)
            stored = await db.getProject(id)
        } catch (error) {
            console.error(error)
            return { linked: 'none', local: 'failed', error }
        }
        if (!stored) return { linked: 'none', local: 'failed' }
        if (details.name !== undefined) stored.name = details.name
        if (details.description !== undefined) stored.description = details.description
        return save(stored)
    }

    async function deleteProject(project: Project): Promise<void> {
        await settled(project.id)
        await db.deleteProject(project)
        if (inited) projects = projects.filter((each) => each.id !== project.id)
    }

    function setFileHandle(
        id: string,
        handle: FileSystemFileHandle,
        format: 'legacy' | 'archive' = 'legacy'
    ) {
        writableFiles.set(id, { handle, format })
    }

    /**
     * The stored project with the id `id`, read alone, once the saves in flight are done: undefined
     * when there is none, or when it is one this version cannot read, as the list skips it;
     * rejects when the browser's storage cannot be read, which is no answer about this one.
     */
    async function getProject(id: string) {
        await settled(id)
        return db.getReadableProject(id)
    }

    /** `getProject`'s Project, rejecting for one this version cannot read; null for a shared one. */
    async function getProjectFromDb(id: string) {
        if (id === SHARE_ID) return null
        await settled(id)
        return db.getProject(id)
    }

    /**
     * Whether a Project with the id `id` is stored, once the saves in flight are done, asked
     * without reading it.
     */
    async function isStored(id: string): Promise<boolean> {
        if (id === SHARE_ID) return false
        await settled(id)
        return db.hasProject(id)
    }

    /**
     * Where a Project's Edit journals are kept, which `save` writes with it; a shared link's, never
     * saved, has none. A new store each time: one holds the journal reads of the Workbench that
     * made it, which must not reach a later one's saves (the page keeps its own).
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
        unload,
        addProject,
        save,
        saveDetails,
        deleteProject,
        setFileHandle,
        getProject,
        getProjectFromDb,
        isStored,
        linkedWritePending,
        journalStore
    }
}

export const ProjectStore = createProjectStore()
