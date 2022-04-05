import { db } from "$lib/db"
import { Project } from "$lib/Project"
import { writable, Writable } from "svelte/store"



export class ProjectStoreClass{
    projects: Writable<Project[]>
    constructor(){
        this.projects = writable([])
    }
    async load(){
        const projects = await db.getProjects()
        this.projects.set(projects)
    }
    createProject(){
        const project = new Project()
        this.projects.update(projects => [...projects, project])
    }
}

export const ProjectStore = new ProjectStoreClass()