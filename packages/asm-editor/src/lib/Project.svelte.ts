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
import { serializer } from '#lib/json.ts'
import { isFileView, type FileView } from './fileViews'
import { detectAssemblyLanguage } from './languages/languageDetector'
import { cleanProjectSettings, type ProjectSettingsDecisions } from './projectSettings'
import {
    cleanCompilationRecords,
    compilationStatus,
    type CompilationRecord,
    type CompilationSourceMap
} from './sourceCompilation/records'
import { programsByLabel } from './commandLine'
import { cleanBuildRecords, untouchedBuildOutputs, type BuildRecord } from './buildOutput'

export type AvailableLanguages = 'M68K' | 'MIPS' | 'X86' | 'RISC-V' | 'RISC-V-64' | 'Z80'

export const AVAILABLE_LANGUAGES: readonly AvailableLanguages[] = [
    'M68K',
    'MIPS',
    'X86',
    'RISC-V',
    'RISC-V-64',
    'Z80'
]

export type AvailableProgrammingLanguages = 'c' | 'cpp'

/**
 * One runnable unit of a Project: an Entry file and what it runs with
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)).
 * It has no name of its own: its Entry path is the key it is stored under in
 * `ProjectData.programs`, not a part of it. `settings` holds only what was decided for this Program
 * ([ADR 0014](../../../../docs/adr/0014-settings-split-by-effect.md)).
 */
export type Program = {
    settings: ProjectSettingsDecisions
    testcases: Testcase[]
    display?: ProjectDisplay
}

/**
 * A Project as stored and shared: a record of typed parts, of which only `files` is visible to the
 * assembler and the program ([ADR 0013](../../../../docs/adr/0013-project-is-a-record.md)).
 */
export interface ProjectData {
    files: ProjectFiles
    /**
     * The Programs by Entry path, a canonical path that may deliberately name a missing File, so two
     * Programs over one Entry cannot be written down. A plain object, unlike the null-prototype
     * `files`: Svelte proxies only plain objects, and Testcases are edited in place.
     */
    programs: Record<string, Program>
    /** The Entry path of the Selected program, there exactly when the Project has a Program. */
    selectedProgram?: string
    createdAt: number
    updatedAt: number
    name: string
    description: string
    id: string
    language: AvailableLanguages
    exam?: Exam
    compilations?: CompilationRecord[]
    /**
     * What each Build output was built from, one for each File a Build saved its program in
     * ([ADR 0056](../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).
     */
    builds?: BuildRecord[]
    /** Open editor paths in tab order; an empty array deliberately leaves the editor empty. */
    openTabs?: string[]
    /** The last selected editor path, independent of any Entry file. */
    activeTab?: string
    /**
     * The view each File was last shown in, where it is not its default (Hex for an image, say),
     * restored with `openTabs` ([file-views.md](../../../../docs/design/file-views.md), decision 8).
     */
    fileViews?: Record<string, FileView>
    /**
     * The cell grid the Pixel editor draws over each picture that has one turned on, lines every
     * `width` × `height` pixels, restored with `fileViews`
     * ([pixel-editor.md](../../../../docs/design/pixel-editor.md), decision 8).
     */
    cellGrids?: Record<string, CellGrid>
}

/** A Pixel editor's cell grid: a line every `width` columns and every `height` rows. */
export type CellGrid = Readonly<{ width: number; height: number }>
/** The largest cell, a picture's own largest size. */
export const CELL_GRID_MAX = 1024

/**
 * Anything a Project may come back as: the current shape, the shape before Programs whose one
 * Program was the top-level `entry`, `settings`, `testcases` and `display`, the version 1 shape whose
 * whole program was one `code` string, or a partial of any, straight out of JSON.
 * `normalizeProjectData` is the one place that turns it into a `ProjectData`, so a project stored,
 * exported or shared before the files map or the Programs existed loads through the same path as a
 * current one.
 */
export type StoredProject = Partial<
    Omit<
        ProjectData,
        | 'files'
        | 'programs'
        | 'selectedProgram'
        | 'language'
        | 'openTabs'
        | 'activeTab'
        | 'fileViews'
        | 'cellGrids'
        | 'builds'
    >
> & {
    /** The version 1 program, and the convenience for creating a project from a template. */
    code?: string
    language?: string
    files?: unknown
    programs?: unknown
    selectedProgram?: unknown
    /**
     * The one Program before Programs existed, read only when `programs` is absent (ADR 0054), and
     * the convenience for creating a one-Program project.
     */
    entry?: unknown
    settings?: unknown
    testcases?: Testcase[]
    display?: Partial<ProjectDisplay>
    openTabs?: unknown
    activeTab?: unknown
    fileViews?: unknown
    cellGrids?: unknown
    builds?: unknown
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

/** The one File a new Project starts with, which is also the Entry file of its one Program. */
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

/** Unusable editor state never prevents a Project from opening. */
function cleanEditorTabs(
    raw:
        | { openTabs?: unknown; activeTab?: unknown; fileViews?: unknown; cellGrids?: unknown }
        | undefined,
    files: ProjectFiles
): Pick<ProjectData, 'openTabs' | 'activeTab' | 'fileViews' | 'cellGrids'> {
    const usable = (path: unknown): path is string =>
        typeof path === 'string' && isValidFilePath(path) && Object.hasOwn(files, path)
    const openTabs = Array.isArray(raw?.openTabs)
        ? [...new Set(raw.openTabs.filter(usable))]
        : undefined
    const activeTab =
        usable(raw?.activeTab) && (openTabs === undefined || openTabs.includes(raw.activeTab))
            ? raw.activeTab
            : undefined
    const fileViews = cleanFileViews(raw?.fileViews, usable)
    const cellGrids = cleanCellGrids(raw?.cellGrids, usable)
    return {
        ...(openTabs !== undefined ? { openTabs } : {}),
        ...(activeTab !== undefined ? { activeTab } : {}),
        ...(fileViews !== undefined ? { fileViews } : {}),
        ...(cellGrids !== undefined ? { cellGrids } : {})
    }
}

/** The cell grids of Files that still exist, each side a whole number from 1 to 1024. */
function cleanCellGrids(
    raw: unknown,
    usable: (path: unknown) => path is string
): Record<string, CellGrid> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const side = (value: unknown): value is number =>
        Number.isInteger(value) && (value as number) >= 1 && (value as number) <= CELL_GRID_MAX
    const grids = Object.entries(raw).flatMap(([path, grid]): [string, CellGrid][] => {
        if (!usable(path) || !grid || typeof grid !== 'object') return []
        const { width, height } = grid as Record<string, unknown>
        return side(width) && side(height) ? [[path, { width, height }]] : []
    })
    return grids.length ? Object.fromEntries(grids) : undefined
}

/** The saved views of Files that still exist, by the same rule as the tabs; none is no map. */
function cleanFileViews(
    raw: unknown,
    usable: (path: unknown) => path is string
): Record<string, FileView> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const views = Object.entries(raw).filter(([path, view]) => usable(path) && isFileView(view))
    return views.length ? Object.fromEntries(views) : undefined
}

/**
 * Saved Programs: an Entry path is checked as strictly as a File's path but may name a missing File,
 * which a running program's own removal or old saved data leave
 * ([programs.md](../../../../docs/design/programs.md), decision 7). The Selected program is kept
 * while it is one of them, else it is the first by label, as the picker lists them.
 */
function cleanPrograms(
    raw: unknown,
    selected: unknown,
    files: ProjectFiles,
    compilations: readonly CompilationRecord[] | undefined
): Pick<ProjectData, 'programs' | 'selectedProgram'> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ProjectFormatError('Programs must be an Entry-path-to-program map')
    const programs = Object.fromEntries(
        Object.entries(raw).map(([entry, program]) => {
            if (!isValidFilePath(entry))
                throw new ProjectFormatError(`Invalid entry path: ${entry}`)
            return [entry, cleanProgram(program)]
        })
    )
    const selectedProgram =
        typeof selected === 'string' && Object.hasOwn(programs, selected)
            ? selected
            : programsByLabel({ programs, files, compilations })[0]?.entry
    return { programs, ...(selectedProgram !== undefined ? { selectedProgram } : {}) }
}

/**
 * A Program's parts, as tolerantly as they were read when they were the Project's own: what cannot
 * be used is dropped, so a Program always loads. An earlier Project's top-level fields are these
 * same parts.
 */
function cleanProgram(raw: unknown): Program {
    const parts = (raw && typeof raw === 'object' ? raw : {}) as {
        settings?: unknown
        testcases?: unknown
        display?: Partial<ProjectDisplay>
    }
    return {
        settings: cleanProjectSettings(parts.settings),
        testcases: cleanTestcases(Array.isArray(parts.testcases) ? parts.testcases : []),
        ...(parts.display ? { display: cleanDisplay(parts.display) } : {})
    }
}

/**
 * Every stored, exported or shared shape into the current one. A version 1 `code` becomes the
 * default Entry file; a project without any program gets the language's empty one; a missing Entry
 * remains missing so the editor and assembler can report it. Data with `programs` is read by them
 * alone, and an empty map stays a Project without a Program; data without them, from before
 * Programs, becomes one Program from its top-level fields, which is selected
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)).
 * Throws a `ProjectFormatError` for files this version cannot read, which is the one thing a
 * project is not silently repaired from.
 */
export function normalizeProjectData(raw: StoredProject | undefined): ProjectData {
    const language = isAvailableLanguage(raw?.language) ? raw.language : 'M68K'
    const files = cleanFiles(
        raw?.files !== undefined
            ? raw.files
            : {
                  [defaultEntryPath(language)]: {
                      encoding: 'plain',
                      content: typeof raw?.code === 'string' ? raw.code : BASE_CODE[language]
                  }
              }
    )
    const now = Date.now()
    const compilations = cleanCompilationRecords(raw?.compilations)
    //a record is about a File the Project has, and goes with it
    const builds = cleanBuildRecords(raw?.builds)?.filter((record) =>
        Object.hasOwn(files, record.outputPath)
    )
    let programs: Pick<ProjectData, 'programs' | 'selectedProgram'>
    if (raw?.programs !== undefined) {
        programs = cleanPrograms(raw.programs, raw.selectedProgram, files, compilations)
    } else {
        const entry = pickEntry(raw?.entry, files, language)
        programs = { programs: { [entry]: cleanProgram(raw) }, selectedProgram: entry }
    }
    return {
        id: raw?.id ?? '',
        files,
        ...programs,
        createdAt: raw?.createdAt ?? now,
        updatedAt: raw?.updatedAt ?? now,
        name: raw?.name ?? 'Untitled',
        language,
        description: raw?.description ?? '',
        exam: raw?.exam,
        ...(compilations ? { compilations } : {}),
        ...(builds?.length ? { builds } : {}),
        ...cleanEditorTabs(raw, files)
    }
}

/**
 * The Project as it leaves the browser, in a share link, an archive, a downloaded or linked
 * source file: without the Build outputs nobody changed since their Build, which a Build makes
 * again ([ADR 0056](../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)),
 * their records, or the tabs and views that showed them.
 */
export function withoutBuildOutputs(data: ProjectData): ProjectData {
    const derived = untouchedBuildOutputs(data.files, data.builds)
    if (!derived.size) return data
    const files: Record<string, ProjectData['files'][string]> = Object.create(null)
    for (const [path, file] of Object.entries(data.files))
        if (!derived.has(path)) files[path] = file
    const { openTabs, activeTab, fileViews, cellGrids, builds, ...rest } = data
    const kept = builds?.filter((record) => !derived.has(record.outputPath))
    return {
        ...rest,
        files: Object.freeze(files),
        ...(kept?.length ? { builds: kept } : {}),
        ...cleanEditorTabs({ openTabs, activeTab, fileViews, cellGrids }, files)
    }
}

/** The Program at an Entry path, read as an own key so that no path names an inherited one. */
export function programAt(
    project: Pick<ProjectData, 'programs'>,
    entry: string | undefined
): Program | undefined {
    return entry !== undefined && Object.hasOwn(project.programs, entry)
        ? project.programs[entry]
        : undefined
}

/**
 * A Project in the shape written before Programs existed, its one Program's parts at the top level,
 * which editors older than Programs still read; undefined unless it has exactly one Program, since
 * that shape cannot say none or several. Archives, the exported file and share links are written in
 * it whenever it holds the Project
 * ([programs-plan.md](../../../../docs/design/programs-plan.md), decisions 3 and 4).
 */
export function legacyProjectShape(snapshot: ProjectData): LegacyProjectData | undefined {
    const entries = Object.entries(snapshot.programs)
    if (entries.length !== 1) return undefined
    const [[entry, program]] = entries
    const legacy: LegacyProjectData & Partial<Pick<ProjectData, 'programs' | 'selectedProgram'>> = {
        ...snapshot,
        entry,
        settings: program.settings,
        testcases: program.testcases
    }
    delete legacy.programs
    delete legacy.selectedProgram
    if (program.display) legacy.display = program.display
    return legacy
}

/** What `legacyProjectShape` gives: a `ProjectData` before Programs. */
export type LegacyProjectData = Omit<ProjectData, 'programs' | 'selectedProgram'> & {
    entry: string
} & Program

/**
 * Whether two projects hold the same content, which is what "unsaved changes" means: every part
 * that is the user's, and none of the bookkeeping (id and timestamps).
 */
export function projectContentEquals(a: ProjectData, b: ProjectData): boolean {
    return contentKey(a) === contentKey(b)
}

/**
 * A Program's Entry file text, the Selected program's unless another Entry is named, which is what
 * a Build assembles and what an exported file's body is; empty with no such File.
 */
export function entryFileContent(
    project: ProjectData,
    entry: string | undefined = project.selectedProgram
): string {
    const file = entry === undefined ? undefined : project.files[entry]
    return file ? fileText(file) : ''
}

function contentKey(project: ProjectData): string {
    return serializer.stringify({
        name: project.name,
        description: project.description,
        language: project.language,
        files: project.files,
        programs: project.programs,
        selectedProgram: project.selectedProgram,
        exam: project.exam,
        compilations: project.compilations,
        builds: project.builds,
        openTabs: project.openTabs,
        activeTab: project.activeTab,
        fileViews: project.fileViews,
        cellGrids: project.cellGrids
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
    /** What the Testcases panel calls it; without one it is named by its place in the list. */
    name?: string
    /**
     * x86 only: the program's Arguments for this Testcase, as typed on a Command line; without
     * them (or with an empty field) it runs with its Program's
     * ([binary-import.md](../../../../docs/design/binary-import.md), decision 12).
     */
    arguments?: string
    input: string[]
    expectedOutput: string
    startingRegisters: Record<string, bigint>
    expectedRegisters: Record<string, bigint>
    startingMemory: MemoryValue[]
    expectedMemory: MemoryValue[]
}

export type TestcaseValidationError =
    | { type: 'runtime-error'; message: string }
    | {
          type: 'wrong-register'
          register: string
          expected: bigint
          got: bigint
      }
    | {
          type: 'wrong-memory-number'
          /** The position of the failed expectation in the Testcase's `expectedMemory`. */
          index: number
          address: bigint
          bytes: number
          expected: bigint
          got: bigint
      }
    | {
          type: 'wrong-memory-string'
          index: number
          address: bigint
          expected: string
          got: string
      }
    | {
          type: 'wrong-memory-chunk'
          index: number
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
 * this representation remains for compatible legacy linked source files. It is the shape before
 * Programs, so only a Project with exactly one Program has an exported file (`legacyProjectShape`).
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
    compilations?: CompilationRecord[]
    builds?: BuildRecord[]
    openTabs?: string[]
    activeTab?: string
    fileViews?: Record<string, FileView>
    cellGrids?: Record<string, CellGrid>
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
export async function makeProjectFromExternal(codeAndMeta: string): Promise<ExternalImport> {
    const lines = codeAndMeta.split('\n')
    const threshold = lines.findIndex((line) => line.includes(CODE_SEPARATOR))
    if (threshold === -1) {
        const code = codeAndMeta.trimEnd()
        return { project: makeProject({ language: await detectAssemblyLanguage(code), code }) }
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
            project: makeProject({ language: await detectAssemblyLanguage(code), code }),
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
        : await detectAssemblyLanguage(code)
    return {
        project: makeProject({ language, name: meta.name, code }),
        notice: NEWER_VERSION_NOTICE
    }
}

export function makeProject(data?: StoredProject) {
    const state = $state(normalizeProjectData(data))
    let sourceMaps = $state.raw<Readonly<Record<string, CompilationSourceMap>>>({})
    const fileSystem = new FileSystem(state.files, {
        read: () => state.files,
        write: (files) => {
            state.files = files
        }
    })
    function reconcileSourceMaps() {
        if (!Object.keys(sourceMaps).length) return
        const next = Object.fromEntries(
            Object.entries(sourceMaps).filter(([path]) => {
                const record = state.compilations?.find((item) => item.outputPath === path)
                if (!record || !state.files[path]) return false
                const status = compilationStatus(record, state.files, state.language)
                return !status.stale && !status.edited
            })
        )
        if (Object.keys(next).length !== Object.keys(sourceMaps).length) sourceMaps = next
    }
    /** A Build output renamed or removed is no longer one: its record goes (ADR 0056). */
    function reconcileBuilds() {
        const builds = state.builds
        if (!builds?.some((record) => !Object.hasOwn(state.files, record.outputPath))) return
        const kept = builds.filter((record) => Object.hasOwn(state.files, record.outputPath))
        if (kept.length) state.builds = kept
        else delete state.builds
    }
    fileSystem.subscribe((changed) => {
        if (!changed) return
        reconcileSourceMaps()
        reconcileBuilds()
    })

    function toObject(): ProjectData {
        //the maps keyed by path are rebuilt from their own entries, each value snapshot on its own:
        //a snapshot of a plain map assigns every key into a new object, which a path named
        //`__proto__` would turn into the copy's prototype, losing that Program or view on save
        const programs = Object.fromEntries(
            Object.entries(state.programs).map(([entry, program]) => [
                entry,
                $state.snapshot(program) as Program
            ])
        )
        const fileViews = state.fileViews && Object.fromEntries(Object.entries(state.fileViews))
        const cellGrids =
            state.cellGrids &&
            Object.fromEntries(
                Object.entries(state.cellGrids).map(([path, grid]) => [path, { ...grid }])
            )
        //each snapshot is taken where it is returned: the server build of a `.svelte.ts` drops a
        //`$state.snapshot` that is a declaration's whole value, which would hand out the state
        return {
            files: $state.snapshot(state.files),
            programs,
            ...$state.snapshot({
                ...(state.selectedProgram !== undefined
                    ? { selectedProgram: state.selectedProgram }
                    : {}),
                createdAt: state.createdAt,
                updatedAt: state.updatedAt,
                name: state.name,
                language: state.language,
                description: state.description,
                id: state.id,
                exam: state.exam,
                ...(state.compilations ? { compilations: state.compilations } : {}),
                ...(state.builds ? { builds: state.builds } : {}),
                ...(state.openTabs !== undefined ? { openTabs: state.openTabs } : {}),
                ...(state.activeTab !== undefined ? { activeTab: state.activeTab } : {})
            }),
            ...(fileViews !== undefined ? { fileViews } : {}),
            ...(cellGrids !== undefined ? { cellGrids } : {})
        } as ProjectData
    }

    function toExternal() {
        const snapshot = legacyProjectShape(withoutBuildOutputs(toObject()))
        if (!snapshot)
            throw new Error('Only a Project with exactly one program can be exported as one file')
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
            files,
            ...(snapshot.compilations ? { compilations: snapshot.compilations } : {}),
            ...(snapshot.builds ? { builds: snapshot.builds } : {}),
            ...(snapshot.openTabs !== undefined ? { openTabs: snapshot.openTabs } : {}),
            ...(snapshot.activeTab !== undefined ? { activeTab: snapshot.activeTab } : {}),
            ...(snapshot.fileViews !== undefined ? { fileViews: snapshot.fileViews } : {}),
            ...(snapshot.cellGrids !== undefined ? { cellGrids: snapshot.cellGrids } : {})
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

    function selected(): Program | undefined {
        return programAt(state, state.selectedProgram)
    }

    function selectedEntry(): string {
        if (state.selectedProgram === undefined) throw new Error('This Project has no program')
        return state.selectedProgram
    }

    function existingProgram(entry: string): Program {
        const program = programAt(state, entry)
        if (!program) throw new Error(`${entry} is the Entry of no program`)
        return program
    }

    function getCode(): string {
        const entry = state.selectedProgram
        const file = entry === undefined ? undefined : state.files[entry]
        //Compatibility for the remaining single-code bindings. Multi-file consumers use `files`
        //directly; a missing or binary Entry has no editable text value and must still render so
        //the sidebar can expose it without decoding storage bytes into the editor.
        return file?.encoding === 'plain' ? file.content : ''
    }

    function setCode(code: string) {
        fileSystem.writeText(selectedEntry(), code)
    }

    /**
     * Merges any stored shape into this project. A `code` given without `files` is the version 1
     * shape (a legacy share link, say), so the files are rebuilt from it for the merged language
     * rather than kept from before. Likewise an Entry, Settings, Testcases or Display given
     * without `programs` is the shape before Programs, whose one Program replaces this project's
     * ([programs-plan.md](../../../../docs/design/programs-plan.md), decision 5).
     */
    function set(data: Partial<StoredProject>) {
        const legacyCode = typeof data.code === 'string' && data.files === undefined
        const legacyProgram =
            data.programs === undefined &&
            (legacyCode ||
                data.entry !== undefined ||
                data.settings !== undefined ||
                data.testcases !== undefined ||
                data.display !== undefined)
        //Only a merge that actually touches Files or the Programs is a host file edit. Taking the
        //lock for every merge meant saving a shared Project after a Build threw instead of saving,
        //because a Debug session stays open through termination until Stop.
        if (
            data.files !== undefined ||
            data.code !== undefined ||
            data.programs !== undefined ||
            data.selectedProgram !== undefined ||
            legacyProgram
        ) {
            fileSystem.assertEditable()
        }
        const merged = normalizeProjectData({
            ...toObject(),
            ...data,
            ...(legacyCode ? { files: undefined, entry: undefined } : {}),
            ...(legacyProgram ? { programs: undefined, selectedProgram: undefined } : {})
        })
        Object.assign(state, merged)
        state.selectedProgram = merged.selectedProgram
        state.openTabs = merged.openTabs
        state.activeTab = merged.activeTab
        state.fileViews = merged.fileViews
        state.cellGrids = merged.cellGrids
        state.builds = merged.builds
        reconcileSourceMaps()
    }

    //The Programs change as a whole map, never by assigning a key into it: a new map is seen by
    //everything that read the old one, and an Entry named `__proto__` stays a key. A Program's own
    //parts are assigned through it, so Testcases bound before stay the Program's.

    /**
     * Makes a Program with nothing decided and no Testcases, and selects it. A File is the Entry of
     * at most one Program, so one that already is an Entry is refused; it need not exist yet.
     */
    function createProgram(entry: string) {
        fileSystem.assertEditable()
        if (!isValidFilePath(entry)) throw new ProjectFormatError(`Invalid entry path: ${entry}`)
        if (Object.hasOwn(state.programs, entry))
            throw new Error(`${entry} is already the Entry of a program`)
        state.programs = Object.fromEntries([
            ...Object.entries(state.programs),
            [entry, { settings: {}, testcases: [] }]
        ])
        state.selectedProgram = entry
    }

    function selectProgram(entry: string) {
        fileSystem.assertEditable()
        existingProgram(entry)
        state.selectedProgram = entry
    }

    /**
     * Removes a Program and keeps its File. Removing the Selected program selects the first one
     * left by label ([programs.md](../../../../docs/design/programs.md), decision 7), and the last
     * leaves the Project without a Program. A path that is no Entry is left alone.
     */
    function removeProgram(entry: string) {
        if (!Object.hasOwn(state.programs, entry)) return
        fileSystem.assertEditable()
        const programs = Object.fromEntries(
            Object.entries(state.programs).filter(([path]) => path !== entry)
        )
        state.programs = programs
        if (state.selectedProgram === entry) {
            state.selectedProgram = programsByLabel({
                programs,
                files: state.files,
                compilations: state.compilations
            })[0]?.entry
        }
    }

    /**
     * Moves a Program, with its parts and its selection, to its Entry file's new path, as a host
     * rename of the File does; a running program's rename of its own Entry does not, so the Program
     * stays where instruction Undo brings the File back (decision 7). A path that is no Entry is
     * left alone, as `renameCompilationFile` leaves one no record names.
     */
    function renameProgram(from: string, to: string) {
        if (from === to || !Object.hasOwn(state.programs, from)) return
        fileSystem.assertEditable()
        if (!isValidFilePath(to)) throw new ProjectFormatError(`Invalid entry path: ${to}`)
        if (Object.hasOwn(state.programs, to))
            throw new Error(`${to} is already the Entry of a program`)
        state.programs = Object.fromEntries(
            Object.entries(state.programs).map(([path, program]) => [
                path === from ? to : path,
                program
            ])
        )
        if (state.selectedProgram === from) state.selectedProgram = to
    }

    //A Program's parts take no lock, as they took none when they were the Project's: Settings apply
    //at the next Build, and a Build reads the Display from a `@screen` comment during its session.

    function setProgramSettings(entry: string, settings: ProjectSettingsDecisions) {
        existingProgram(entry).settings = cleanProjectSettings(settings)
    }

    function setProgramTestcases(entry: string, testcases: Testcase[]) {
        existingProgram(entry).testcases = testcases
    }

    function setProgramDisplay(entry: string, display: ProjectDisplay | undefined) {
        const program = existingProgram(entry)
        if (display) program.display = cleanDisplay(display)
        else delete program.display
    }

    return {
        fileSystem,
        get id() {
            return state.id
        },
        /** The Selected program's Entry file content, empty without one. */
        get code() {
            return getCode()
        },
        get files() {
            return state.files
        },
        /** The Programs by Entry path, changed only through the methods below. */
        get programs(): Readonly<Record<string, Program>> {
            return state.programs
        },
        /** The Selected program's Entry path, undefined exactly while the Project has none. */
        get selectedProgram() {
            return state.selectedProgram
        },
        get selected() {
            return selected()
        },
        /** The Program whose Entry file is at `entry`, if there is one. */
        program(entry: string) {
            return programAt(state, entry)
        },
        createProgram,
        selectProgram,
        removeProgram,
        renameProgram,
        setProgramSettings,
        setProgramTestcases,
        setProgramDisplay,
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
        get exam() {
            return state.exam
        },
        get compilations() {
            return state.compilations ?? []
        },
        /** What each Build output was built from, see `BuildRecord`. */
        get builds(): readonly BuildRecord[] {
            return state.builds ?? []
        },
        /**
         * Keeps the record of a Build that saved its program at `record.outputPath`, in place of
         * any earlier one there; the File is written first, as Generated assembly is before its
         * Compilation record.
         */
        recordBuild(record: BuildRecord) {
            if (!Object.hasOwn(state.files, record.outputPath))
                throw new Error(`${record.outputPath} is no File of the Project`)
            state.builds = [
                ...(state.builds ?? []).filter((item) => item.outputPath !== record.outputPath),
                record
            ]
        },
        get openTabs() {
            return state.openTabs
        },
        get activeTab() {
            return state.activeTab
        },
        /** Remembers editor navigation without touching Files or taking their Debug lock. */
        setOpenTabs(openTabs: readonly string[], activeTab: string) {
            const clean = cleanEditorTabs({ openTabs, activeTab }, state.files)
            state.openTabs = clean.openTabs
            state.activeTab = clean.activeTab
        },
        get fileViews() {
            return state.fileViews
        },
        /**
         * Remembers the view a File was last shown in, or with none that it is shown in its
         * default; like the tabs, without touching Files or taking their Debug lock.
         */
        setFileView(path: string, view: FileView | undefined) {
            //entries rather than assignment, which a File named `__proto__` would turn into a prototype
            const next = Object.entries(state.fileViews ?? {}).filter(([key]) => key !== path)
            if (view) next.push([path, view])
            state.fileViews = cleanEditorTabs(
                { fileViews: Object.fromEntries(next) },
                state.files
            ).fileViews
        },
        get cellGrids() {
            return state.cellGrids
        },
        /** Remembers a picture's cell grid, or with none that it has none, as `setFileView` does. */
        setCellGrid(path: string, grid: CellGrid | undefined) {
            const next = Object.entries(state.cellGrids ?? {}).filter(([key]) => key !== path)
            if (grid) next.push([path, grid])
            state.cellGrids = cleanEditorTabs(
                { cellGrids: Object.fromEntries(next) },
                state.files
            ).cellGrids
        },
        get sourceMaps() {
            return sourceMaps
        },

        /** Commit provenance and the transient line map only after the output File is written. */
        recordCompilation(record: CompilationRecord, map: CompilationSourceMap) {
            const records = cleanCompilationRecords([
                ...(state.compilations ?? []).filter(
                    (item) => item.outputPath !== record.outputPath
                ),
                record
            ])
            state.compilations = records
            sourceMaps = { ...sourceMaps, [record.outputPath]: map }
        },
        renameCompilationFile(from: string, to: string) {
            state.compilations = state.compilations?.map((record) => {
                const input = Object.prototype.hasOwnProperty.call(record.inputs, from)
                return {
                    ...record,
                    sourcePath: record.sourcePath === from ? to : record.sourcePath,
                    outputPath: record.outputPath === from ? to : record.outputPath,
                    inputs: input
                        ? Object.fromEntries(
                              Object.entries(record.inputs).map(([path, hash]) => [
                                  path === from ? to : path,
                                  hash
                              ])
                          )
                        : record.inputs,
                    ...(input ? { renamedInput: true as const } : {})
                }
            })
            //only the maps of the records a renamed input makes stale go: a rename of a File no
            //record names leaves every Source map, and with them the C Breakpoints
            reconcileSourceMaps()
        },

        set code(v: string) {
            setCode(v)
        },
        set files(v: ProjectFiles) {
            fileSystem.replace(v)
        },
        set name(v: string) {
            state.name = v
        },
        set language(v: AvailableLanguages) {
            fileSystem.assertEditable()
            state.language = v
            sourceMaps = {}
        },
        set description(v: string) {
            state.description = v
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

/**
 * A memory value read back from JSON, its address and expected numbers BigInts again; one of a
 * type this version does not know is kept as it is.
 */
function cleanMemoryValue(memory: MemoryValue): MemoryValue {
    if (memory.type === 'number-chunk')
        return {
            ...memory,
            expected: memory.expected.map((e) => BigInt(e)),
            address: BigInt(memory.address)
        }
    if (memory.type === 'string-chunk') return { ...memory, address: BigInt(memory.address) }
    if (memory.type === 'number')
        return { ...memory, address: BigInt(memory.address), expected: BigInt(memory.expected) }
    return memory
}

/** Registers read back from JSON, each value a BigInt again. */
const cleanRegisters = (registers: Record<string, bigint>) =>
    Object.fromEntries(Object.entries(registers).map(([key, value]) => [key, BigInt(value)]))

export function cleanTestcases(testcases: Testcase[]) {
    return testcases.map((original) => {
        //a name that is not text is dropped rather than shown, and no key is added to a Testcase
        //saved without one, so loading it does not count as a change
        const { name, arguments: args, ...testcase } = original
        return {
            ...testcase,
            ...(typeof name === 'string' ? { name } : {}),
            //likewise Arguments, which only text can be
            ...(typeof args === 'string' ? { arguments: args } : {}),
            expectedMemory: testcase.expectedMemory.map(cleanMemoryValue),
            expectedRegisters: cleanRegisters(testcase.expectedRegisters),
            startingMemory: testcase.startingMemory.map(cleanMemoryValue),
            startingRegisters: cleanRegisters(testcase.startingRegisters)
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
