import Dexie from 'dexie'
import type { Table } from 'dexie'
import {
    makeProject,
    normalizeProjectData,
    type Project,
    type ProjectData,
    type StoredProject
} from '../Project.svelte'
import type { EditJournalStore, SavedJournal } from '../editJournal'
import { id } from '../id'

/** A row's fields that the files map and then the Programs replaced, which its rewrite drops. */
const REPLACED_FIELDS = ['code', 'entry', 'settings', 'testcases', 'display']
/** A File's Edit journal as the database keeps it, by its Project's id and its path. */
type JournalRow = SavedJournal & { project: string; path: string }
/** The journals a save writes with the Project, by path; undefined deletes one. */
export type JournalWrites = ReadonlyMap<string, SavedJournal | undefined>

/**
 * The Edit journals of one Project
 * ([ADR 0063](../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)),
 * as the Workbench's host keeps them: those that changed wait here to be read as the Project's
 * snapshot is taken and written in its save's transaction (`ProjectStore.save`), so that a journal
 * is never stored ahead of the File it fits, nor behind it.
 */
export class ProjectJournals implements EditJournalStore {
    private reads = new Map<string, () => SavedJournal | undefined>()

    constructor(
        private readonly db: Db,
        readonly project: string
    ) {}

    async load() {
        const rows = await this.db.editJournals.where('project').equals(this.project).toArray()
        return new Map(
            rows.map((row) => [
                row.path,
                { fingerprint: row.fingerprint, undo: row.undo, redo: row.redo }
            ])
        )
    }

    changed(path: string, read: () => SavedJournal | undefined) {
        this.reads.set(path, read)
    }

    /** The journals that changed since the last save, read now, with the Project's snapshot. */
    take(): { writes: JournalWrites; putBack: () => void } {
        const reads = this.reads
        this.reads = new Map()
        const writes = new Map([...reads].map(([path, read]) => [path, read()]))
        //a save that failed stored neither, and the next one writes them, unless changed since
        const putBack = () => {
            for (const [path, read] of reads) if (!this.reads.has(path)) this.reads.set(path, read)
        }
        return { writes, putBack }
    }
}

export class Db extends Dexie {
    projects!: Table<ProjectData>
    editJournals!: Table<JournalRow, [string, string]>
    constructor() {
        super('mips-m68k-db')
        this.version(1).stores({
            projects: '++id'
        })
        //version 2: the one `code` string became the files map with an Entry file and the Settings
        //decisions arrived (docs/design/project-format.md). Every row is rewritten once, through the
        //normalizer that reads every other stored shape, so an old row and a fresh one look alike.
        //Since a Project holds Programs (ADR 0054) the rewrite gives them in place of the top-level
        //Entry, Settings, Testcases and Display. A row already at version 2 keeps the earlier shape
        //until its next save, read meanwhile by the same normalizer, so that needed no version 3;
        //version 3 below only adds the Edit journals' table.
        this.version(2)
            .stores({
                projects: '++id'
            })
            .upgrade((transaction) =>
                transaction
                    .table('projects')
                    .toCollection()
                    .modify((row: StoredProject & Record<string, unknown>) => {
                        try {
                            const normalized = normalizeProjectData(row)
                            Object.assign(row, normalized)
                            for (const field of REPLACED_FIELDS) delete row[field]
                        } catch (e) {
                            //left as it was: a row this version cannot read is skipped by the reads
                            //below, and a later version may still know what to do with it
                            console.error(e)
                        }
                    })
            )
        //version 3: each File's Edit journal, beside its Project rather than in it (ADR 0063)
        this.version(3).stores({
            projects: '++id',
            editJournals: '[project+path], project'
        })
    }

    /**
     * Every project this version can read. A row it cannot (a File with an encoding it does not
     * know) is reported and skipped, never deleted and never repaired into something else: one bad
     * row must not hide every other project.
     */
    async getProjects(): Promise<Project[]> {
        const projects = await this.projects.toArray()
        const readable: Project[] = []
        for (const project of projects) {
            try {
                readable.push(makeProject(project))
            } catch (e) {
                console.error(`Skipping the stored project "${project.id}":`, e)
            }
        }
        return readable
    }
    /** The stored project with the id `id`, or undefined when there is none, deleted elsewhere. */
    async getProject(id: string): Promise<Project | undefined> {
        const project = await this.projects.get(id)
        return project && makeProject(project)
    }
    /**
     * `getProject`, but undefined for a row this version cannot read, which is reported, as
     * `getProjects` skips it. Rejects only when the browser's storage cannot be read.
     */
    async getReadableProject(id: string): Promise<Project | undefined> {
        const project = await this.projects.get(id)
        if (!project) return undefined
        try {
            return makeProject(project)
        } catch (e) {
            console.error(`Skipping the stored project "${id}":`, e)
            return undefined
        }
    }
    /** Whether a project with the id `id` is stored, asked of its key alone. */
    async hasProject(id: string): Promise<boolean> {
        return (await this.projects.where(':id').equals(id).count()) > 0
    }
    /**
     * Stores `project` as a new row, under a new id it takes only once the row is stored: an add
     * the browser refused leaves it the id it had, a shared link's among them.
     */
    async addProject(project: Project): Promise<Project> {
        const row = { ...project.toObject(), id: id() }
        await this.projects.add(row)
        project.id = row.id
        return project
    }
    async deleteProject(project: Project): Promise<void> {
        await this.transaction('rw', this.projects, this.editJournals, async () => {
            await this.projects.delete(project.id)
            await this.editJournals.where('project').equals(project.id).delete()
        })
    }
    /** Where the Workbench keeps the Edit journals of the Project with the id `project`. */
    journalStore(project: string): ProjectJournals {
        return new ProjectJournals(this, project)
    }
    /**
     * Saves a Project's row, and with it in one transaction the Edit journals that changed. The
     * writes are made on IndexedDB's own transaction, which is committed as soon as they are made:
     * a save the page starts as it closes or is hidden then reaches the database, where one that
     * waited to commit until the page next yielded, as Dexie's do, was lost about one time in five
     * in a tab closed right after typing.
     */
    async updateProject(row: ProjectData, journals?: JournalWrites): Promise<void> {
        if (!this.isOpen()) await this.open()
        const stores = journals?.size ? ['projects', 'editJournals'] : ['projects']
        const transaction = this.backendDB().transaction(stores, 'readwrite')
        const done = new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve()
            transaction.onabort = () =>
                reject(transaction.error ?? new DOMException('The save was aborted', 'AbortError'))
        })
        try {
            transaction.objectStore('projects').put(row)
            const journalStore = journals?.size
                ? transaction.objectStore('editJournals')
                : undefined
            for (const [path, journal] of journals ?? []) {
                if (journal) journalStore!.put({ ...journal, project: row.id, path })
                else journalStore!.delete([row.id, path])
            }
        } catch (error) {
            transaction.abort()
            //the abort's own rejection is this one
            done.catch(() => {})
            throw error
        }
        //an older browser commits it once the page yields, as before
        transaction.commit?.()
        return done
    }
}

export const db = new Db()
