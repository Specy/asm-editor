
export type AvailableLanguages = 'M68K' | 'MIPS'
export interface ProjectData{
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
    language: AvailableLanguages
}

const baseM68k = 
`
ORG    $1000
START:

END
`.trim()
const baseMIPS = 
`
START:

`.trim()
export class Project{
    code = ""
    createdAt = 0
    updatedAt = 0
    name = ""
    language:AvailableLanguages = "M68K"
    description = ""
    id = ""
    constructor(data?: Partial<ProjectData>){
        Object.assign(this, data || {})
        this.code = this.language === 'M68K' ? baseM68k : baseMIPS
    }
    toObject(): ProjectData{
        return {
            code: this.code,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            name: this.name,
            language: this.language,
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
