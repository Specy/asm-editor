import { BASE_CODE, COMMENT_CHARACTER } from './Config'
import {
    DEFAULT_PROJECT_DISPLAY as MARS_DEFAULT_DISPLAY,
    type ProjectDisplay
} from './languages/mars/marsDisplay'
import { serializer } from '$lib/json'
import { detectAssemblyLanguage } from './languages/languageDetector'

export type AvailableLanguages = 'M68K' | 'MIPS' | 'X86' | 'RISC-V' | 'RISC-V-64' | 'Z80'

export type AvailableProgrammingLanguages = 'c'

export interface ProjectData {
    code: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
    language: AvailableLanguages
    testcases: Testcase[]
    exam?: Exam
    display?: ProjectDisplay
}

/**
 * The MIPS and RISC-V bitmap display configuration lives with the two adapters that read it, since
 * the parameters, their choice lists and their defaults are MARS's and RARS's own; it is re-exported
 * here because it is project data, saved and shared with the rest of a project.
 */
export { DEFAULT_PROJECT_DISPLAY, type ProjectDisplay } from './languages/mars/marsDisplay'

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

export type Exam = {
    track: string
    passwordHash: string
    accessPasswordHash?: string
    timeLimit: number
    submission?: {
        name: string
        submissionTimestamp: number
        hash: string
        startedAt: number
    }
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
    exam?: Exam
    display?: ProjectDisplay
}

const metaVersion = 1

export function makeProjectFromExternal(codeAndMeta: string) {
    const lines = codeAndMeta.split('\n')
    const threshold = lines.findIndex((line) => line.includes(CODE_SEPARATOR))
    if (threshold === -1) {
        // No metadata separator found — this is a raw assembly file.
        // Detect the language from the code and create a new project.
        const code = codeAndMeta.trimEnd()
        const language = detectAssemblyLanguage(code)
        const project = makeProject({
            language,
            name: '',
            description: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            testcases: [],
            id: ''
        })
        project.code = code
        return project
    }
    const code = lines.slice(0, threshold).join('\n').trimEnd()
    const metaLines = lines.slice(threshold + 1)
    const commentCharacters = Object.values(COMMENT_CHARACTER)
    const separator = lines[threshold].split('').find((c) => commentCharacters.includes(c)) ?? '*'
    let metaJson: ProjectMetadata = {
        name: '',
        description: '',
        language: 'M68K',
        version: metaVersion,
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
    const state = $state({
        id: data?.id ?? '',
        code: data?.code ?? BASE_CODE[lang],
        createdAt: data?.createdAt ?? Date.now(),
        updatedAt: data?.updatedAt ?? Date.now(),
        name: data?.name ?? 'Untitled',
        language: lang,
        description: data?.description ?? '',
        testcases: (data?.testcases ?? []) as Testcase[],
        exam: data?.exam,
        display: data?.display ? cleanDisplay(data.display) : undefined
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
            id: state.id,
            exam: state.exam,
            display: state.display
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
            id: state.id,
            exam: state.exam,
            display: state.display
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
        if (data.display) {
            state.display = cleanDisplay(data.display)
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
        get exam() {
            return state.exam
        },
        get display() {
            return state.display
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
        set exam(v: Exam | undefined) {
            state.exam = v
        },
        set display(v: ProjectDisplay | undefined) {
            state.display = v ? cleanDisplay(v) : undefined
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
                        expected: BigInt(memory.expected)
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
                        expected: BigInt(memory.expected)
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

/**
 * A display read back from storage or from a shared file, which is JSON and can be missing fields or
 * carry strings where numbers belong, exactly like the testcases above. Anything unusable falls back
 * to MARS's default rather than failing the load: a project must always open.
 */
export function cleanDisplay(display: Partial<ProjectDisplay> | undefined): ProjectDisplay {
    const fallback = MARS_DEFAULT_DISPLAY
    return {
        unitWidth: cleanDisplayNumber(display?.unitWidth, fallback.unitWidth),
        unitHeight: cleanDisplayNumber(display?.unitHeight, fallback.unitHeight),
        width: cleanDisplayNumber(display?.width, fallback.width),
        height: cleanDisplayNumber(display?.height, fallback.height),
        baseAddress: cleanDisplayNumber(display?.baseAddress, fallback.baseAddress)
    }
}

function cleanDisplayNumber(value: unknown, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}
