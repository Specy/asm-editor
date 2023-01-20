
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
const CODE_SEPARATOR = "---METADATA---"

const baseM68k = 
`
ORG $1000
START:
    * Write here your code

END: * Jump here to end the program
`.trim()


type ProjectMetadata = {
    version: number
    name:string
    language: AvailableLanguages
    description:string
}

const metaVersion = 1
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
        this.code = this.language === 'M68K' ? baseM68k : ""
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
    toExternal(){
        const meta:ProjectMetadata = {
            version: metaVersion,
            description: this.description,
            name: this.name, 
            language: this.language
        }
        const metaJson = JSON.stringify(meta, null, 4)
        const commentedJson = metaJson.split("\n").map(e => `* ${e}`).join("\n")
        const separator = `* ${CODE_SEPARATOR} do not write below here`
        return `${this.code}\n\n\n${separator}\n${commentedJson}`
    }
    static fromExternal(codeAndMeta:string){
        const lines = codeAndMeta.split("\n")
        const regex = new RegExp(`^\\*.*${CODE_SEPARATOR}`)
        const threshold = lines.findIndex(line => line.match(regex))
        const code = lines.slice(0, threshold).join("\n").trimEnd()
        const metaLines = lines.slice(threshold + 1)
        let metaJson:ProjectMetadata = {
            name: "", description: "", language: "M68K", version: metaVersion
        }
        try{
            const noComments = metaLines.map(l => removeUntill("*", l)).join("\n")
            const temp = JSON.parse(noComments.trim())
            if(typeof temp === "object" && temp.version === metaVersion){
                metaJson = temp
            }
        }catch(e){
            console.error(e)
        }
        const project = new Project({
            ...metaJson, 
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime()
        })
        project.code = code
        return project
    }
}



function removeUntill(char: string, value:string){
    const split = value.split(char)
    split.shift()
    return split.join(char)
}