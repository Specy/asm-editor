import { browser } from "$app/environment"
import { db } from "$lib/db"
import { Project } from "$lib/Project"
import { get, writable } from "svelte/store"
import type { Writable } from "svelte/store"


export const SHARE_ID = '__share__'

export class ProjectStoreClass{
    inited = false
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
        this.inited = true
        return projects
    }
    async addProject(project: Project): Promise<Project>{
        project.updatedAt = new Date().getTime()
        const result = await db.addProject(project)
        await this.load()
        return result 
    }
    async save(project: Project): Promise<void>{
        if(project.id === SHARE_ID) throw new Error("Cannot save shared project")
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
    async getProject(id: string){
        if(!this.inited) await this.load()
        return get(this.projects).find(project => project.id === id)
    }
    getProjectFromDb(id: string){
        if(id === SHARE_ID) return null
        return db.getProject(id)
    }
}

export const ProjectStore = new ProjectStoreClass()