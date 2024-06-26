
export type AvailableLanguages = 'M68K' | 'MIPS'
export interface ProjectData {
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
    language: AvailableLanguages
    testcases: Testcase[]
}

export type MemoryValue = {
    type: 'number',
    address: number,
    bytes: number,
    expected: number
} | {
    type: 'string-chunk',
    address: number,
    expected: string
} | {
    type: 'number-chunk'
    address: number,
    expected: number[]
}

export type Testcase = {
    input: string[]
    expectedOutput: string
    startingRegisters: Record<string, number>
    expectedRegisters: Record<string, number>
    startingMemory: MemoryValue[]
    expectedMemory: MemoryValue[]
}

export type TestcaseValidationError = {
    type: "wrong-register",
    register: string,
    expected: number,
    got: number
} | {
    type: "wrong-memory-number",
    address: number,
    bytes: number,
    expected: number,
    got: number
} | {
    type: "wrong-memory-string",
    address: number,
    expected: string,
    got: string
} | {
    type: "wrong-memory-chunk",
    address: number,
    expected: number[],
    got: number[]
} | {
    type: "wrong-output",
    expected: string,
    got: string
}

export type TestcaseResult = {
    errors: TestcaseValidationError[]
    passed: boolean
    testcase: Testcase
}


const CODE_SEPARATOR = "---METADATA---"

export const BASE_M68K_CODE =
    `
ORG $1000
START:
    * Write here your code

END: * Jump here to end the program
`.trim()


type ProjectMetadata = {
    version: number
    name: string
    language: AvailableLanguages
    description: string
    createdAt: number
    updatedAt: number
    id: string
    testcases: Testcase[]
}

const metaVersion = 1
export class Project {
    code = ""
    createdAt = 0
    updatedAt = 0
    name = ""
    language: AvailableLanguages = "M68K"
    description = ""
    id = ""
    testcases: Testcase[] = []
    constructor(data?: Partial<ProjectData>) {
        this.code = data?.code ?? this.language === 'M68K' ? BASE_M68K_CODE : ""
        this.createdAt = data?.createdAt ?? new Date().getTime()
        this.updatedAt = data?.updatedAt ?? new Date().getTime()
        this.name = data?.name ?? "Untitled"
        this.language = data?.language ?? "M68K"
        this.description = data?.description ?? ""
        this.id = data?.id ?? ""
        this.testcases = data?.testcases ?? []
    }
    toObject(): ProjectData {
        return {
            code: this.code,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            name: this.name,
            language: this.language,
            description: this.description,
            testcases: this.testcases,
            id: this.id
        }
    }
    static from(data: Partial<ProjectData>): Project {
        const project = new Project()
        Object.assign(project, data)
        return project
    }
    toExternal() {
        const meta: ProjectMetadata = {
            version: metaVersion,
            description: this.description,
            name: this.name,
            language: this.language,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            testcases: this.testcases,
            id: this.id
        }
        const metaJson = JSON.stringify(meta, null, 4)
        const commentedJson = metaJson.split("\n").map(e => `* ${e}`).join("\n")
        const separator = `* ${CODE_SEPARATOR} do not write below here`
        return `${this.code}\n\n\n${separator}\n${commentedJson}`
    }
    static fromExternal(codeAndMeta: string) {
        const lines = codeAndMeta.split("\n")
        const regex = new RegExp(`^\\*.*${CODE_SEPARATOR}`)
        const threshold = lines.findIndex(line => line.match(regex))
        const code = lines.slice(0, threshold).join("\n").trimEnd()
        const metaLines = lines.slice(threshold + 1)
        let metaJson: ProjectMetadata = {
            name: "", 
            description: "", 
            language: "M68K", 
            version: metaVersion, 
            createdAt: new Date().getTime(), 
            updatedAt: new Date().getTime(),
            testcases: [],
            id: ""
        }
        try {
            const noComments = metaLines.map(l => removeUntil("*", l)).join("\n")
            const temp = JSON.parse(noComments.trim())
            if (typeof temp === "object" && temp.version === metaVersion) {
                metaJson = temp
            }
        } catch (e) {
            console.error(e)
        }
        const project = new Project(metaJson)
        project.code = code
        return project
    }
}



function removeUntil(char: string, value: string) {
    const split = value.split(char)
    split.shift()
    return split.join(char)
}