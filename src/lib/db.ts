import Dexie from 'dexie'
import type { Table } from 'dexie'
import { Project, type ProjectData } from './Project'

function id(length = 7) {
    let result = '';
    for(let i = 0; i < length; i++) {
        const random = Math.random();
        result += String.fromCharCode(Math.floor(random * 26) + (random < .5 ? 65 : 97));
    }
    return result;
}
export class Db extends Dexie{
    projects!: Table<ProjectData>
    constructor(){
        super('mips-m68k-db')
        this.version(1).stores({
            projects: '++id'
        })
    }

    async getProjects(): Promise<Project[]>{
        const projects = await this.projects.toArray()
        return projects.map(project => {
           return Project.from(project)
        })
    }
    async getProject(id: string): Promise<Project>{
        const project = await this.projects.get(id)
        return Project.from(project)
    }
    async addProject(project: Project): Promise<Project>{
        project.id = id()
        await this.projects.add(project.toObject())
        return project
    }
    async deleteProject(project: Project): Promise<void>{
        return this.projects.delete(project.id)
    }
    updateProject(project: Project): Promise<unknown>{
        return this.projects.put(project.toObject())
    }
}

export const db = new Db()