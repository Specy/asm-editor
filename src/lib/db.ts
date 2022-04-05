import Dexie from 'dexie'
import type { Table } from 'dexie'
import { ProjectData, Project } from './Project'


export class Db extends Dexie{
    projects: Table<ProjectData>
    constructor(){
        super('db')
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
    async addProject(project: Project): Promise<any>{
        return this.projects.add(project.toObject())
    }
    async removeProject(project: Project): Promise<any>{
        //d
    }
    updateProject(project: Project): Promise<any>{
        return this.projects.put(project.toObject())
    }
}

export const db = new Db()