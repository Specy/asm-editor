import { browser } from "$app/environment"
import { db } from "$lib/db"
import { Project } from "$lib/Project"
import { get, writable } from "svelte/store"
import type { Writable } from "svelte/store"




export class ProjectStoreClass{
    projects: Writable<Project[]>
    writableFiles: Map<string, FileSystemFileHandle> = new Map()
    constructor(){
        this.projects = writable([])
        if(browser) this.load()
    }
    async load(){
        const projects = await db.getProjects()
        projects.sort((a, b) => b.updatedAt - a.updatedAt)
        this.projects.set(projects)
    }
    async addProject(project: Project): Promise<Project>{
        const result = await db.addProject(project)
        await this.load()
        return result 
    }
    async save(project: Project): Promise<void>{
        project.updatedAt = new Date().getTime()
        const file = this.writableFiles.get(project.id)
        try{
            if(file){
                const writer = await file.createWritable()
                await writer.write(project.toExternal())
                await writer.close()
            }
        }catch(e){
            console.error(e)
        }
        await db.updateProject(project)
        await this.load()
    }
    async delete(project:Project): Promise<void>{
        await db.deleteProject(project)
        await this.load()
    }
    async importFromExternal(code: string){
        const project = Project.fromExternal(code)
        this.addProject(project)
    }
    setFileHandle(id: string, handle: FileSystemFileHandle){
        this.writableFiles.set(id, handle)
    }
    getProject(id: string){
        return get(this.projects).find(project => project.id === id)
    }
    getProjectFromDb(id: string){
        return db.getProject(id)
    }
}

export const ProjectStore = new ProjectStoreClass()