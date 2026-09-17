import { FileSystem } from './languages/peripherals/FileSystem'
import {
    cleanFiles,
    fileText,
    isValidFilePath,
    ProjectFormatError,
    type ProjectFiles
} from './projectFiles'
export { FILE_ENCODINGS, isValidFilePath, ProjectFormatError } from './projectFiles'
export type { ProjectFiles, ProjectFile, FileEncoding } from './projectFiles'
import { BASE_CODE, COMMENT_CHARACTER, LANGUAGE_EXTENSIONS } from './Config'
import {
    DEFAULT_PROJECT_DISPLAY as MARS_DEFAULT_DISPLAY,
    type ProjectDisplay
} from './languages/mars/marsDisplay'
import { serializer } from '$lib/json'
import { detectAssemblyLanguage } from './languages/languageDetector'
import { cleanProjectSettings, type ProjectSettingsDecisions } from './projectSettings'

export type AvailableLanguages = 'M68K' | 'MIPS' | 'X86' | 'RISC-V' | 'RISC-V-64' | 'Z80'

export const AVAILABLE_LANGUAGES: readonly AvailableLanguages[] = [
    'M68K',
    'MIPS',
    'X86',
    'RISC-V',
    'RISC-V-64',
    'Z80'
]

export type AvailableProgrammingLanguages = 'c'

/**
 * A Project as stored and shared: a record of typed parts, of which only `files` is visible to the
 * assembler and the program ([ADR 0013](../../docs/adr/0013-project-is-a-record.md)). `entry` is a
 * canonical path and may deliberately name a missing File; `settings` holds only what was decided
 * for this Project
 * ([ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)).
 */
export interface ProjectData {
    files: ProjectFiles
    entry: string
    settings: ProjectSettingsDecisions
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
 * Anything a Project may come back as: the current shape, the version 1 shape whose whole program
 * was one `code` string, or a partial of either, straight out of JSON. `normalizeProjectData` is the
 * one place that turns it into a `ProjectData`, so a project stored, exported or shared before the
 * files map existed loads through the same path as a current one.
 */
export type StoredProject = Partial<
    Omit<ProjectData, 'files' | 'entry' | 'settings' | 'language' | 'testcases' | 'display'>
> & {
    /** The version 1 program, and the convenience for creating a project from a template. */
    code?: string
    language?: string
    files?: unknown
    entry?: unknown
    settings?: unknown
    testcases?: Testcase[]
    display?: Partial<ProjectDisplay>
}

/**
 * The MIPS and RISC-V bitmap display configuration lives with the two adapters that read it, since
 * the parameters, their choice lists and their defaults are MARS's and RARS's own; it is re-exported
 * here because it is project data, saved and shared with the rest of a project.
 */
export { DEFAULT_PROJECT_DISPLAY, type ProjectDisplay } from './languages/mars/marsDisplay'

export function isAvailableLanguage(value: unknown): value is AvailableLanguages {
    return typeof value === 'string' && (AVAILABLE_LANGUAGES as string[]).includes(value)
}

/** The one File a new Project starts with, which is also its Entry file. */
export function defaultEntryPath(language: AvailableLanguages): string {
    return `main.${LANGUAGE_EXTENSIONS[language]}`
}

function pickEntry(entry: unknown, files: ProjectFiles, language: AvailableLanguages): string {
    if (typeof entry === 'string') {
        if (!isValidFilePath(entry)) throw new ProjectFormatError(`Invalid entry path: ${entry}`)
        return entry
    }
    const preferred = defaultEntryPath(language)
    if (preferred in files) return preferred
    return Object.keys(files)[0] ?? preferred
}

/**
 * Every stored, exported or shared shape into the current one. A version 1 `code` becomes the
 * default Entry file; a project without any program gets the language's empty one; a missing Entry
 * remains missing so the editor and assembler can report it. Throws a `ProjectFormatError` for
 * files this version cannot read, which is the one thing a project is not silently repaired from.
 */
export function normalizeProjectData(raw: StoredProject | undefined): ProjectData {
    const language = isAvailableLanguage(raw?.language) ? raw.language : 'M68K'
    let files = raw?.files !== undefined ? cleanFiles(raw.files) : {}
    if (raw?.files === undefined) {
        const content = typeof raw?.code === 'string' ? raw.code : BASE_CODE[language]
        files = { [defaultEntryPath(language)]: { encoding: 'plain', content } }
    }
    const now = Date.now()
    return {
        id: raw?.id ?? '',
        files: cleanFiles(files),
        entry: pickEntry(raw?.entry, files, language),
        settings: cleanProjectSettings(raw?.settings),
        createdAt: raw?.createdAt ?? now,
        updatedAt: raw?.updatedAt ?? now,
        name: raw?.name ?? 'Untitled',
        language,
        description: raw?.description ?? '',
        testcases: cleanTestcases(Array.isArray(raw?.testcases) ? raw.testcases : []),
        exam: raw?.exam,
        display: raw?.display ? cleanDisplay(raw.display) : undefined
    }
}

/**
 * Whether two projects hold the same content, which is what "unsaved changes" means: every part
 * that is the user's, and none of the bookkeeping (id and timestamps).
 */
export function projectContentEquals(a: ProjectData, b: ProjectData): boolean {
    return contentKey(a) === contentKey(b)
}

/** The Entry file's text, which is what a Build assembles and what an exported file's body is. */
export function entryFileContent(project: ProjectData): string {
    const file = project.files[project.entry]
    return file ? fileText(file) : ''
}

function contentKey(project: ProjectData): string {
    return serializer.stringify({
        name: project.name,
        description: project.description,
        language: project.language,
        files: project.files,
        entry: project.entry,
        settings: project.settings,
        testcases: project.testcases,
        display: project.display,
        exam: project.exam
    })
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

/**
 * The metadata block of an exported file, version 2: the Entry file's text is the file's body and
 * everything else is here, other Files included. Complete multi-file export uses an archive;
 * this representation remains for compatible legacy linked source files.
 * Version 1 had `code` as the body and no `entry`, `settings` or `files`.
 */
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
    entry: string
    settings: ProjectSettingsDecisions
    files: ProjectFiles
}

const metaVersion = 2

export type ExternalImport = {
    project: Project
    /** Set when less than the whole file could be used, for the importer to show. */
    notice?: string
}

const NEWER_VERSION_NOTICE =
    'This file was saved by a newer version of the editor, so only its code was imported.'
const UNREADABLE_METADATA_NOTICE =
    'The metadata of this file could not be read, so only its code was imported.'

/**
 * A project from an exported file, or from a bare source file, which has no metadata block and
 * whose language is detected from the code. A version 1 block (one `code`, no files) and the
 * current one both load; a newer one, and one that cannot be parsed, give a project with the code
 * only and a notice saying so, instead of dropping the metadata in silence.
 */
export function makeProjectFromExternal(codeAndMeta: string): ExternalImport {
    const lines = codeAndMeta.split('\n')
    const threshold = lines.findIndex((line) => line.includes(CODE_SEPARATOR))
    if (threshold === -1) {
        const code = codeAndMeta.trimEnd()
        return { project: makeProject({ language: detectAssemblyLanguage(code), code }) }
    }
    const code = lines.slice(0, threshold).join('\n').trimEnd()
    const metaLines = lines.slice(threshold + 1)
    const commentCharacters = Object.values(COMMENT_CHARACTER)
    const separator = lines[threshold].split('').find((c) => commentCharacters.includes(c)) ?? '*'
    let meta: Partial<ProjectMetadata> & { version?: unknown }
    try {
        const noComments = metaLines.map((l) => removeUntil(separator, l)).join('\n')
        const parsed = serializer.parse<unknown>(noComments.trim())
        if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
        meta = parsed as Partial<ProjectMetadata>
    } catch (e) {
        console.error(e)
        return {
            project: makeProject({ language: detectAssemblyLanguage(code), code }),
            notice: UNREADABLE_METADATA_NOTICE
        }
    }
    const version = Number(meta.version)
    if (version === 1) {
        return { project: makeProject({ ...meta, files: undefined, entry: undefined, code }) }
    }
    if (version === metaVersion) {
        const language = isAvailableLanguage(meta.language) ? meta.language : 'M68K'
        const entry =
            typeof meta.entry === 'string' && isValidFilePath(meta.entry)
                ? meta.entry
                : defaultEntryPath(language)
        const others =
            typeof meta.files === 'object' && meta.files !== null
                ? (meta.files as Record<string, unknown>)
                : {}
        const files = { ...others, [entry]: { encoding: 'plain', content: code } }
        return { project: makeProject({ ...meta, language, files, entry }) }
    }
    const language = isAvailableLanguage(meta.language)
        ? meta.language
        : detectAssemblyLanguage(code)
    return {
        project: makeProject({ language, name: meta.name, code }),
        notice: NEWER_VERSION_NOTICE
    }
}

export function makeProject(data?: StoredProject) {
    const state = $state(normalizeProjectData(data))
    const fileSystem = new FileSystem(state.files, {
        read: () => state.files,
        write: (files) => {
            state.files = files
        }
    })

    function toObject(): ProjectData {
        return $state.snapshot({
            files: state.files,
            entry: state.entry,
            settings: state.settings,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            name: state.name,
            language: state.language,
            description: state.description,
            testcases: state.testcases,
            id: state.id,
            exam: state.exam,
            display: state.display
        }) as ProjectData
    }

    function toExternal() {
        const snapshot = toObject()
        const files = Object.fromEntries(
            Object.entries(snapshot.files).filter(([path]) => path !== snapshot.entry)
        )
        const meta: ProjectMetadata = {
            version: metaVersion,
            description: snapshot.description,
            name: snapshot.name,
            language: snapshot.language,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
            testcases: snapshot.testcases,
            id: snapshot.id,
            exam: snapshot.exam,
            display: snapshot.display,
            entry: snapshot.entry,
            settings: snapshot.settings,
            files
        }
        const metaJson = serializer.stringify(meta, null, 4)
        const commentCharacter = COMMENT_CHARACTER[snapshot.language]
        const commentedJson = metaJson
            .split('\n')
            .map((e) => `${commentCharacter} ${e}`)
            .join('\n')
        const separator = `${commentCharacter} ${CODE_SEPARATOR} do not write below here`
        return `${getCode()}\n\n\n${separator}\n${commentedJson}`
    }

    function getCode(): string {
        const file = state.files[state.entry]
        //Compatibility for the remaining single-code bindings. Multi-file consumers use `files`
        //directly; a missing or binary Entry has no editable text value and must still render so
        //the sidebar can expose it without decoding storage bytes into the editor.
        return file?.encoding === 'plain' ? file.content : ''
    }

    function setCode(code: string) {
        fileSystem.writeText(state.entry, code)
    }

    /**
     * Merges any stored shape into this project. A `code` given without `files` is the version 1
     * shape (a legacy share link, say), so the files are rebuilt from it for the merged language
     * rather than kept from before.
     */
    function set(data: Partial<StoredProject>) {
        //Only a merge that actually touches Files or the Entry path is a host file edit. Taking the
        //lock for every merge meant saving a shared Project after a Build threw instead of saving,
        //because a Debug session stays open through termination until Stop.
        if (data.files !== undefined || data.code !== undefined || data.entry !== undefined) {
            fileSystem.assertEditable()
        }
        const legacyCode = typeof data.code === 'string' && data.files === undefined
        const merged = normalizeProjectData({
            ...toObject(),
            ...data,
            ...(legacyCode ? { files: undefined, entry: undefined } : {})
        })
        Object.assign(state, merged)
    }

    return {
        fileSystem,
        get id() {
            return state.id
        },
        /** The Entry file's content. */
        get code() {
            return getCode()
        },
        get files() {
            return state.files
        },
        get entry() {
            return state.entry
        },
        get settings() {
            return state.settings
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
            setCode(v)
        },
        set files(v: ProjectFiles) {
            fileSystem.replace(v)
        },
        set entry(v: string) {
            fileSystem.assertEditable()
            if (!isValidFilePath(v)) throw new ProjectFormatError(`Invalid entry path: ${v}`)
            state.entry = v
        },
        set settings(v: ProjectSettingsDecisions) {
            state.settings = cleanProjectSettings(v)
        },
        set name(v: string) {
            state.name = v
        },
        set language(v: AvailableLanguages) {
            fileSystem.assertEditable()
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
