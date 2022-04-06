

export interface ProjectData{
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
}


export class Project{
    code = ""
    createdAt = 0
    updatedAt = 0
    name = ""
    language = "m68k"
    description = ""
    id = ""
    constructor(data?: Partial<ProjectData>){
        Object.assign(this, data || {})
    }
    toObject(): ProjectData{
        return {
            code: this.code,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            name: this.name,
            description: this.description,
            id: this.id
        }
    }
    static from(data: Partial<ProjectData>){
        const project = new Project()
        Object.assign(project, data)
        return project
    }
}
