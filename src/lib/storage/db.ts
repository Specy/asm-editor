import Dexie from 'dexie'
import type { Table } from 'dexie'
import {
    makeProject,
    normalizeProjectData,
    type Project,
    type ProjectData,
    type StoredProject
} from '../Project.svelte'

export function id(length = 7) {
    let result = ''
    for (let i = 0; i < length; i++) {
        const random = Math.random()
        result += String.fromCharCode(Math.floor(random * 26) + (random < 0.5 ? 65 : 97))
    }
    return result
}
export class Db extends Dexie {
    projects!: Table<ProjectData>
    constructor() {
        super('mips-m68k-db')
        this.version(1).stores({
            projects: '++id'
        })
        //version 2: the one `code` string became the files map with an Entry file and the Settings
        //decisions arrived (docs/design/project-format.md). Every row is rewritten once, through the
        //normalizer that reads every other stored shape, so an old row and a fresh one look alike.
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
                            delete row.code
                            Object.assign(row, normalized)
                        } catch (e) {
                            //left as it was: a row this version cannot read is skipped by the reads
                            //below, and a later version may still know what to do with it
                            console.error(e)
                        }
                    })
            )
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
    async getProject(id: string): Promise<Project> {
        const project = await this.projects.get(id)
        return makeProject(project)
    }
    async addProject(project: Project): Promise<Project> {
        project.id = id()
        await this.projects.add(project.toObject())
        return project
    }
    async deleteProject(project: Project): Promise<void> {
        return this.projects.delete(project.id)
    }
    updateProject(project: Project): Promise<unknown> {
        return this.projects.put(project.toObject())
    }
}

export const db = new Db()
