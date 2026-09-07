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
 * How a File's content string is read back. `plain` is the text itself. The set is open, `base64`
 * being the one the first binary File will add, and a reader that meets one it does not know fails
 * rather than reading the string as text ([ADR 0013](../../docs/adr/0013-project-is-a-record.md)).
 */
export type FileEncoding = 'plain'
export const FILE_ENCODINGS: readonly FileEncoding[] = ['plain']

export type ProjectFile = {
    encoding: FileEncoding
    content: string
}

/** Path to File. Paths are relative, `/` separated, with an extension; see `isValidFilePath`. */
export type ProjectFiles = Record<string, ProjectFile>

/**
 * A Project as stored and shared: a record of typed parts, of which only `files` is visible to the
 * assembler and the program ([ADR 0013](../../docs/adr/0013-project-is-a-record.md)). `entry` is
 * always a key of `files`; `settings` holds only what was decided for this Project
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

/** A stored or imported project whose files cannot be read as this version's format. */
export class ProjectFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectFormatError'
    }
}

export function isAvailableLanguage(value: unknown): value is AvailableLanguages {
    return typeof value === 'string' && (AVAILABLE_LANGUAGES as string[]).includes(value)
}

/** The one File a new Project starts with, which is also its Entry file. */
export function defaultEntryPath(language: AvailableLanguages): string {
    return `main.${LANGUAGE_EXTENSIONS[language]}`
}

/**
 * The path rules, which the drive peripheral will inherit: relative, `/` separated, no leading
 * slash, no empty, `.` or `..` segment, and a file name with an extension. Folders exist only
 * through the paths of the Files in them.
 */
export function isValidFilePath(path: string): boolean {
    if (typeof path !== 'string' || path.length === 0) return false
    if (path.includes('\\')) return false
    for (let i = 0; i < path.length; i++) if (path.charCodeAt(i) < 0x20) return false
    const segments = path.split('/')
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
        return false
    const name = segments[segments.length - 1] ?? ''
    const dot = name.lastIndexOf('.')
    return dot > 0 && dot < name.length - 1
}

function cleanFiles(raw: unknown): ProjectFiles {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new ProjectFormatError('The files of this project are not a map of path to file')
    }
    const files: ProjectFiles = {}
    for (const [path, file] of Object.entries(raw as Record<string, unknown>)) {
        if (!isValidFilePath(path)) {
            throw new ProjectFormatError(`"${path}" is not a valid file path`)
        }
        if (typeof file !== 'object' || file === null) {
            throw new ProjectFormatError(`The file "${path}" has no content`)
        }
        const { encoding, content } = file as Record<string, unknown>
        if (!(FILE_ENCODINGS as unknown[]).includes(encoding)) {
            throw new ProjectFormatError(
                `The file "${path}" uses the encoding "${String(encoding)}", which this version of the editor does not know`
            )
        }
        if (typeof content !== 'string') {
            throw new ProjectFormatError(`The content of the file "${path}" is not a string`)
        }
        files[path] = { encoding: encoding as FileEncoding, content }
    }
    return files
}

function pickEntry(entry: unknown, files: ProjectFiles, language: AvailableLanguages): string {
    if (typeof entry === 'string' && entry in files) return entry
    const preferred = defaultEntryPath(language)
    if (preferred in files) return preferred
    return Object.keys(files)[0] ?? preferred
}

/**
 * Every stored, exported or shared shape into the current one. A version 1 `code` becomes the
 * default Entry file; a project without any program gets the language's empty one; an entry that
 * names no File falls back to `main.<ext>` or the first File. Throws a `ProjectFormatError` for
 * files this version cannot read, which is the one thing a project is not silently repaired from.
 */
export function normalizeProjectData(raw: StoredProject | undefined): ProjectData {
    const language = isAvailableLanguage(raw?.language) ? raw.language : 'M68K'
    let files = raw?.files !== undefined ? cleanFiles(raw.files) : {}
    if (Object.keys(files).length === 0) {
        const content = typeof raw?.code === 'string' ? raw.code : BASE_CODE[language]
        files = { [defaultEntryPath(language)]: { encoding: 'plain', content } }
    }
    const now = Date.now()
    return {
        id: raw?.id ?? '',
        files,
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
    return project.files[project.entry]?.content ?? ''
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
 * everything else is here, other Files included (there are none until multi-file editing exists).
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
        return state.files[state.entry]?.content ?? ''
    }

    function setCode(code: string) {
        const file = state.files[state.entry]
        if (file) file.content = code
        else state.files[state.entry] = { encoding: 'plain', content: code }
    }

    /**
     * Merges any stored shape into this project. A `code` given without `files` is the version 1
     * shape (a legacy share link, say), so the files are rebuilt from it for the merged language
     * rather than kept from before.
     */
    function set(data: Partial<StoredProject>) {
        const legacyCode = typeof data.code === 'string' && data.files === undefined
        const merged = normalizeProjectData({
            ...toObject(),
            ...data,
            ...(legacyCode ? { files: undefined, entry: undefined } : {})
        })
        Object.assign(state, merged)
    }

    return {
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
            state.files = cleanFiles(v)
            state.entry = pickEntry(state.entry, state.files, state.language)
        },
        set entry(v: string) {
            if (!(v in state.files))
                throw new ProjectFormatError(`"${v}" is not a file of this project`)
            state.entry = v
        },
        set settings(v: ProjectSettingsDecisions) {
            state.settings = cleanProjectSettings(v)
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
