import { get } from 'svelte/store'

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

export type MemoryValue =
    | {
          type: 'number'
          address: number
          bytes: number
          expected: number
      }
    | {
          type: 'string-chunk'
          address: number
          expected: string
      }
    | {
          type: 'number-chunk'
          address: number
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

export type TestcaseValidationError =
    | {
          type: 'wrong-register'
          register: string
          expected: number
          got: number
      }
    | {
          type: 'wrong-memory-number'
          address: number
          bytes: number
          expected: number
          got: number
      }
    | {
          type: 'wrong-memory-string'
          address: number
          expected: string
          got: string
      }
    | {
          type: 'wrong-memory-chunk'
          address: number
          expected: number[]
          got: number[]
      }
    | {
          type: 'wrong-output'
          expected: string
          got: string
      }

export type TestcaseResult = {
    errors: TestcaseValidationError[]
    passed: boolean
    testcase: Testcase
}

const CODE_SEPARATOR = '---METADATA---'

export const BASE_M68K_CODE = `
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

export function makeProjectFromExternal(codeAndMeta: string) {
    const lines = codeAndMeta.split('\n')
    const regex = new RegExp(`^\\*.*${CODE_SEPARATOR}`)
    const threshold = lines.findIndex((line) => line.match(regex))
    const code = lines.slice(0, threshold).join('\n').trimEnd()
    const metaLines = lines.slice(threshold + 1)
    let metaJson: ProjectMetadata = {
        name: '',
        description: '',
        language: 'M68K',
        version: metaVersion,
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
        testcases: [],
        id: ''
    }
    try {
        const noComments = metaLines.map((l) => removeUntil('*', l)).join('\n')
        const temp = JSON.parse(noComments.trim())
        if (typeof temp === 'object' && temp.version === metaVersion) {
            metaJson = temp
        }
    } catch (e) {
        console.error(e)
    }
    const project = makeProject(metaJson)
    project.code = code
    return project
}

export function makeProject(data?: Partial<ProjectData>) {
    let state = $state({
        id: data?.id ?? '',
        code: data?.code ?? (data?.language === 'M68K' ? BASE_M68K_CODE : ''),
        createdAt: data?.createdAt ?? new Date().getTime(),
        updatedAt: data?.updatedAt ?? new Date().getTime(),
        name: data?.name ?? 'Untitled',
        language: (data?.language ?? 'M68K') as AvailableLanguages,
        description: data?.description ?? '',
        testcases: (data?.testcases ?? []) as Testcase[]
    })

    function toObject(): ProjectData {
        return $state.snapshot({
            code: state.code,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            name: state.name,
            language: state.language,
            description: state.description,
            testcases: state.testcases,
            id: state.id
        })
    }

    function toExternal() {
        const meta: ProjectMetadata = {
            version: metaVersion,
            description: state.description,
            name: state.name,
            language: state.language,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            testcases: state.testcases,
            id: state.id
        }
        const metaJson = JSON.stringify(meta, null, 4)
        const commentedJson = metaJson
            .split('\n')
            .map((e) => `* ${e}`)
            .join('\n')
        const separator = `* ${CODE_SEPARATOR} do not write below here`
        return `${state.code}\n\n\n${separator}\n${commentedJson}`
    }

    return {
        get id() {
            return state.id
        },
        get code() {
            return state.code
        },
        get createdAt() {
            return state.createdAt
        },
        get updatedAt() {
            return state.updatedAt
        },
        get name() {
            return state.name
        },
        get language() {
            return state.language
        },
        get description() {
            return state.description
        },
        get testcases() {
            return state.testcases
        },

        set code(v: string) {
            state.code = v
        },
        set name(v: string) {
            state.name = v
        },
        set language(v: AvailableLanguages) {
            state.language = v
        },
        set description(v: string) {
            state.description = v
        },
        set testcases(v: Testcase[]) {
            state.testcases = v
        },
        set id(v: string) {
            state.id = v
        },
        set createdAt(v: number) {
            state.createdAt = v
        },
        set updatedAt(v: number) {
            state.updatedAt = v
        },

        toObject,
        toExternal
    }
}

export type Project = ReturnType<typeof makeProject>

function removeUntil(char: string, value: string) {
    const split = value.split(char)
    split.shift()
    return split.join(char)
}
