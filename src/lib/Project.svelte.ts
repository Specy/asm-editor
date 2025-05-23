import { BASE_CODE, COMMENT_CHARACTER } from './Config'
import { serializer } from '$lib/json'

export type AvailableLanguages = 'M68K' | 'MIPS' | 'X86' | 'RISC-V'

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
          address: bigint
          bytes: number
          expected: bigint
      }
    | {
          type: 'string-chunk'
          address: bigint
          expected: string
      }
    | {
          type: 'number-chunk'
          address: bigint
          bytes: number
          expected: bigint[]
      }

export type Testcase = {
    input: string[]
    expectedOutput: string
    startingRegisters: Record<string, bigint>
    expectedRegisters: Record<string, bigint>
    startingMemory: MemoryValue[]
    expectedMemory: MemoryValue[]
}

export type TestcaseValidationError =
    | {
          type: 'wrong-register'
          register: string
          expected: bigint
          got: bigint
      }
    | {
          type: 'wrong-memory-number'
          address: bigint
          bytes: number
          expected: bigint
          got: bigint
      }
    | {
          type: 'wrong-memory-string'
          address: bigint
          expected: string
          got: string
      }
    | {
          type: 'wrong-memory-chunk'
          address: bigint
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
    const threshold = lines.findIndex((line) => line.includes(CODE_SEPARATOR))
    const code = lines.slice(0, threshold).join('\n').trimEnd()
    const metaLines = lines.slice(threshold + 1)
    const commentCharacters = Object.values(COMMENT_CHARACTER)
    const separator = lines[threshold].split('').find((c) => commentCharacters.includes(c)) ?? '*'
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
        const noComments = metaLines.map((l) => removeUntil(separator, l)).join('\n')
        const temp = serializer.parse<ProjectMetadata>(noComments.trim())
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
    const lang = data?.language ?? ('M68K' as AvailableLanguages)
    let state = $state({
        id: data?.id ?? '',
        code: data?.code ?? BASE_CODE[lang],
        createdAt: data?.createdAt ?? new Date().getTime(),
        updatedAt: data?.updatedAt ?? new Date().getTime(),
        name: data?.name ?? 'Untitled',
        language: lang,
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
        const metaJson = serializer.stringify($state.snapshot(meta), null, 4)
        const commentCharacter = COMMENT_CHARACTER[state.language]
        const commentedJson = metaJson
            .split('\n')
            .map((e) => `${commentCharacter} ${e}`)
            .join('\n')
        const separator = `${commentCharacter} ${CODE_SEPARATOR} do not write below here`
        return `${state.code}\n\n\n${separator}\n${commentedJson}`
    }

    function set(data: Partial<ProjectData & { id: string }>) {
        Object.assign(state, data)
        if (data.testcases) {
            state.testcases = cleanTestcases(data.testcases)
        }
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
        set,
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

export function cleanTestcases(testcases: Testcase[]) {
    return testcases.map((testcase) => {
        return {
            ...testcase,
            expectedMemory: testcase.expectedMemory.map((memory) => {
                if (memory.type === 'number-chunk') {
                    return {
                        ...memory,
                        expected: memory.expected.map((e) => BigInt(e)),
                        address: BigInt(memory.address)
                    }
                } else if (memory.type === 'string-chunk') {
                    return {
                        ...memory,
                        address: BigInt(memory.address)
                    }
                } else if (memory.type === 'number') {
                    return {
                        ...memory,
                        address: BigInt(memory.address),
                        expected: BigInt(memory.address)
                    }
                } else {
                    return memory
                }
            }),
            expectedRegisters: Object.fromEntries(
                Object.entries(testcase.expectedRegisters).map(([key, value]) => {
                    return [key, BigInt(value)]
                })
            ),
            startingMemory: testcase.startingMemory.map((memory) => {
                if (memory.type === 'number-chunk') {
                    return {
                        ...memory,
                        expected: memory.expected.map((e) => BigInt(e)),
                        address: BigInt(memory.address)
                    }
                } else if (memory.type === 'string-chunk') {
                    return {
                        ...memory,
                        address: BigInt(memory.address)
                    }
                } else if (memory.type === 'number') {
                    return {
                        ...memory,
                        address: BigInt(memory.address),
                        expected: BigInt(memory.address)
                    }
                } else {
                    return memory
                }
            }),
            startingRegisters: Object.fromEntries(
                Object.entries(testcase.startingRegisters).map(([key, value]) => {
                    return [key, BigInt(value)]
                })
            )
        }
    })
}
