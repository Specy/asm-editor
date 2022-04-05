

export interface ProjectData{
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
}


export class Project{
    code = ""
    createdAt = 0
    updatedAt = 0
    name = ""
    description = ""
    constructor(data?: Partial<ProjectData>){
        Object.assign(this, data || {})
    }
    toObject(){
        return {
            code: this.code,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            name: this.name,
            description: this.description
        }
    }
    static from(data: Partial<ProjectData>){
        const project = new Project()
        Object.assign(project, data)
        return project
    }
}
