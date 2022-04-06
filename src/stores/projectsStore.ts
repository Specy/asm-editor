import { browser } from "$app/env"
import { db } from "$lib/db"
import type { Project } from "$lib/Project"
import { get, writable, Writable } from "svelte/store"



export class ProjectStoreClass{
    projects: Writable<Project[]>
    constructor(){
        this.projects = writable([])
        if(browser) this.load()
    }
    async load(){
        const projects = await db.getProjects()
        this.projects.set(projects)
    }
    async addProject(project: Project): Promise<Project>{
        const result = await db.addProject(project)
        await this.load()
        return result 
    }
    async save(project: Project): Promise<Project>{
        project.updatedAt = new Date().getTime()
        const result = await db.updateProject(project)
        await this.load()
        return result 
    }
    async delete(project:Project): Promise<void>{
        await db.deleteProject(project)
        await this.load()
    }
    getProject(id: string){
        return get(this.projects).find(project => project.id === id)
    }
}

export const ProjectStore = new ProjectStoreClass()