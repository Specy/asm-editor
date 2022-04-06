

export interface ProjectData{
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
}

const baseM68k = 
`
ORG    $1000
START:

END:
`.trim()

export class Project{
    code = ""
    createdAt = 0
    updatedAt = 0
    name = ""
    language = "m68k"
    description = ""
    id = ""
    constructor(data?: Partial<ProjectData>){
        this.code = this.language === 'm68k' ? baseM68k : ''
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
    static from(data: Partial<ProjectData>): Project{
        const project = new Project()
        Object.assign(project, data)
        return project
    }
}
