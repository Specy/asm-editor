import {
    isAvailableLanguage,
    legacyProjectShape,
    makeProject,
    type ExternalImport,
    type LegacyProjectData,
    type Project,
    type ProjectData,
    type StoredProject
} from '#lib/Project.svelte.ts'
import { LANGUAGE_EXTENSIONS } from '#lib/Config.ts'
import { serializer } from '#lib/json.ts'
import {
    cleanFiles,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    FILE_ENCODINGS,
    PATH_BYTE_LIMIT,
    isValidFilePath,
    originalBytes,
    projectFileFromBytes,
    ProjectFormatError,
    type Annotations,
    type ByteEdit,
    type FileEncoding,
    type ProjectFile
} from '#lib/projectFiles.ts'
import { unzipSync, zipSync, type Unzipped } from 'fflate'

/**
 * Version 2 gave a File's manifest entry its Byte edits, beside the original bytes under `files/`;
 * version 3 replaced the project's `entry`, `settings`, `testcases` and `display` with its `programs`
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md));
 * version 4, version 3's shape, gave a File's entry its Annotations
 * ([annotations-and-search.md](../../../../docs/design/annotations-and-search.md), decision 21).
 * An archive is written in the oldest version that holds it, which older editors read: a Project
 * with one Program as version 1, or 2 with Byte edits, one with several or none as 3, and only one
 * with Annotations as 4, which an editor before them refuses as a version it does not know.
 */
const ARCHIVE_VERSION_WITH_ANNOTATIONS = 4
const ARCHIVE_VERSION = 3
const ARCHIVE_VERSION_WITHOUT_PROGRAMS = 2
const ARCHIVE_VERSION_WITHOUT_EDITS = 1
const MANIFEST_NAME = 'project.json'
const FILE_PREFIX = 'files/'
const MANIFEST_BYTE_LIMIT = 1024 * 1024
//A valid worst-case ZIP repeats every path in its local and central directory records. Keep the
//compressed-input guard large enough that the full 16 MiB Project payload can always round-trip,
//even when it is split across 4,096 maximally long paths.
const ARCHIVE_BYTE_LIMIT =
    FILE_BYTE_LIMIT + MANIFEST_BYTE_LIMIT + FILE_COUNT_LIMIT * (PATH_BYTE_LIMIT * 2 + 256)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

type ArchivedFile = {
    encoding: FileEncoding
    edits?: readonly ByteEdit[]
    annotations?: Annotations
}
type ProjectManifest = {
    version:
        | typeof ARCHIVE_VERSION_WITH_ANNOTATIONS
        | typeof ARCHIVE_VERSION
        | typeof ARCHIVE_VERSION_WITHOUT_PROGRAMS
        | typeof ARCHIVE_VERSION_WITHOUT_EDITS
    /** `LegacyProjectData` before version 3, `ProjectData` without its Files from it on. */
    project: Omit<ProjectData, 'files'> | Omit<LegacyProjectData, 'files'>
    files: Record<string, ArchivedFile>
}

function snapshotOf(project: Project | ProjectData): ProjectData {
    return 'toObject' in project ? project.toObject() : project
}

/** A complete, byte-preserving Project ZIP. No running descriptor or Undo state is serialized. */
export function projectToArchive(project: Project | ProjectData): Uint8Array<ArrayBuffer> {
    const snapshot = snapshotOf(project)
    const files = cleanFiles(snapshot.files)
    const annotated = Object.values(files).some((file) => file.annotations)
    //no version before Programs holds Annotations, so they take the shape after them
    const legacy = annotated ? undefined : legacyProjectShape(snapshot)
    const projectMetadata = { ...(legacy ?? snapshot) }
    Reflect.deleteProperty(projectMetadata, 'files')
    const edited = Object.values(files).some((file) => file.edits?.length)
    const manifest: ProjectManifest = {
        version: annotated
            ? ARCHIVE_VERSION_WITH_ANNOTATIONS
            : !legacy
              ? ARCHIVE_VERSION
              : edited
                ? ARCHIVE_VERSION_WITHOUT_PROGRAMS
                : ARCHIVE_VERSION_WITHOUT_EDITS,
        project: projectMetadata,
        files: Object.fromEntries(
            Object.entries(files).map(([path, file]) => [
                path,
                {
                    encoding: file.encoding,
                    ...(file.edits ? { edits: file.edits } : {}),
                    ...(file.annotations ? { annotations: file.annotations } : {})
                }
            ])
        )
    }
    const manifestBytes = encoder.encode(serializer.stringify(manifest, null, 2))
    if (manifestBytes.length > MANIFEST_BYTE_LIMIT) {
        throw new ProjectFormatError('Project metadata exceeds the 1 MiB archive limit')
    }
    const entries: Record<string, Uint8Array> = { [MANIFEST_NAME]: manifestBytes }
    //the original bytes: the Byte edits are in the manifest, kept apart as the Project keeps them
    for (const [path, file] of Object.entries(files))
        entries[`${FILE_PREFIX}${path}`] = originalBytes(file)
    return zipSync(entries, { level: 6 })
}

function downloadName(name: string, extension: string): string {
    const withoutControls = Array.from(name.trim() || 'Untitled project', (character) =>
        character.charCodeAt(0) <= 0x1f ? '_' : character
    ).join('')
    const cleaned = withoutControls.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
    return `${cleaned}.${extension}`
}

export function projectArchiveName(name: string): string {
    return downloadName(name, 'asmproj')
}

export function projectSourceName(project: Project | ProjectData): string {
    return downloadName(project.name, LANGUAGE_EXTENSIONS[project.language])
}

/**
 * Whether a bare source file could hold the whole Project: one plain-text File without
 * Annotations, which its text cannot carry, and it is the Entry of its one Program, which the
 * exported file's shape before Programs can say.
 */
export function isSingleSourceProject(project: Project | ProjectData): boolean {
    const paths = Object.keys(project.files)
    const entries = Object.keys(project.programs)
    if (paths.length !== 1 || entries.length !== 1 || paths[0] !== entries[0]) return false
    const file = project.files[paths[0]]
    return file?.encoding === 'plain' && !file.annotations
}

export type ProjectDownload = {
    /** `source` is the commented-metadata text file; `archive` the ZIP. */
    kind: 'source' | 'archive'
    fileName: string
    mimeType: string
    contents: string | Uint8Array<ArrayBuffer>
}

/**
 * The single download a Project gets. A one-File Project whose File is its one Program's Entry
 * travels as its source text with the metadata block appended, which other editors and assemblers
 * still read as a program; anything with more Files, binary ones, or other than one Program only
 * survives as the archive.
 */
export function projectDownload(project: Project | ProjectData): ProjectDownload {
    const snapshot = snapshotOf(project)
    if (isSingleSourceProject(snapshot)) {
        return {
            kind: 'source',
            fileName: projectSourceName(snapshot),
            mimeType: 'text/plain;charset=utf-8',
            contents: makeProject(snapshot).toExternal()
        }
    }
    return {
        kind: 'archive',
        fileName: projectArchiveName(snapshot.name),
        mimeType: 'application/zip',
        contents: projectToArchive(snapshot)
    }
}

export function looksLikeZip(bytes: Uint8Array): boolean {
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
    return (
        (bytes[2] === 0x03 && bytes[3] === 0x04) ||
        (bytes[2] === 0x05 && bytes[3] === 0x06) ||
        (bytes[2] === 0x07 && bytes[3] === 0x08)
    )
}

/** Validates the entire archive before constructing a Project. */
export function makeProjectFromArchive(input: ArrayBuffer | Uint8Array): ExternalImport {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (!looksLikeZip(bytes)) throw new ProjectFormatError('Not a ZIP Project archive')
    if (bytes.length > ARCHIVE_BYTE_LIMIT) {
        throw new ProjectFormatError('Project archive exceeds the compressed-size safety limit')
    }

    const seen = new Set<string>()
    let fileCount = 0
    let fileBytesTotal = 0
    let manifestFound = false
    let extracted: Unzipped
    try {
        extracted = unzipSync(bytes, {
            filter: (file) => {
                if (seen.has(file.name))
                    throw new ProjectFormatError(`Duplicate archive entry: ${file.name}`)
                seen.add(file.name)
                if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) {
                    throw new ProjectFormatError(`Invalid expanded size for ${file.name}`)
                }
                if (file.name === MANIFEST_NAME) {
                    if (manifestFound) throw new ProjectFormatError('Duplicate project manifest')
                    manifestFound = true
                    if (file.originalSize > MANIFEST_BYTE_LIMIT) {
                        throw new ProjectFormatError(
                            'Project metadata exceeds the 1 MiB archive limit'
                        )
                    }
                    return true
                }
                if (!file.name.startsWith(FILE_PREFIX)) {
                    throw new ProjectFormatError(`Unsupported archive entry: ${file.name}`)
                }
                const path = file.name.slice(FILE_PREFIX.length)
                if (!isValidFilePath(path)) {
                    throw new ProjectFormatError(
                        `Unsafe or invalid archived file path: ${file.name}`
                    )
                }
                fileCount += 1
                fileBytesTotal += file.originalSize
                if (fileCount > FILE_COUNT_LIMIT) {
                    throw new ProjectFormatError('Project archive exceeds the 4,096-file limit')
                }
                if (fileBytesTotal > FILE_BYTE_LIMIT) {
                    throw new ProjectFormatError('Project archive exceeds the 16 MiB file limit')
                }
                return true
            }
        })
    } catch (error) {
        if (error instanceof ProjectFormatError) throw error
        throw new ProjectFormatError(
            `Could not read Project archive: ${error instanceof Error ? error.message : String(error)}`
        )
    }

    if (!manifestFound || !extracted[MANIFEST_NAME]) {
        throw new ProjectFormatError('Project archive has no project.json manifest')
    }
    const rawManifest = parseManifest(extracted[MANIFEST_NAME])
    const metadataPaths = Object.keys(rawManifest.files)
    if (metadataPaths.length !== fileCount) {
        throw new ProjectFormatError('Project manifest and archived Files do not match')
    }

    const files: Record<string, ProjectFile> = Object.create(null)
    for (const path of metadataPaths) {
        if (!isValidFilePath(path))
            throw new ProjectFormatError(`Invalid manifest File path: ${path}`)
        const archived = extracted[`${FILE_PREFIX}${path}`]
        if (!archived) throw new ProjectFormatError(`Archived File is missing: ${path}`)
        const info = rawManifest.files[path]
        const file = projectFileFromBytes(archived, info.encoding)
        //`cleanFiles` below checks the edits against the original they apply to, and the
        //Annotations as a saved Project's
        files[path] = {
            ...file,
            ...(info.edits ? { edits: info.edits } : {}),
            ...(info.annotations ? { annotations: info.annotations } : {})
        }
    }
    for (const name of Object.keys(extracted)) {
        if (name === MANIFEST_NAME) continue
        const path = name.slice(FILE_PREFIX.length)
        if (!(path in rawManifest.files)) {
            throw new ProjectFormatError(`Archived File has no manifest entry: ${path}`)
        }
    }

    const clean = cleanFiles(files)
    const project = makeProject({ ...rawManifest.project, files: clean } as StoredProject)
    return { project }
}

function parseManifest(bytes: Uint8Array): ProjectManifest {
    if (bytes.length > MANIFEST_BYTE_LIMIT) {
        throw new ProjectFormatError('Project metadata exceeds the 1 MiB archive limit')
    }
    let parsed: unknown
    try {
        parsed = serializer.parse<unknown>(decoder.decode(bytes))
    } catch (error) {
        throw new ProjectFormatError(
            `Invalid project.json manifest: ${error instanceof Error ? error.message : String(error)}`
        )
    }
    if (
        !isRecord(parsed) ||
        (parsed.version !== ARCHIVE_VERSION_WITH_ANNOTATIONS &&
            parsed.version !== ARCHIVE_VERSION &&
            parsed.version !== ARCHIVE_VERSION_WITHOUT_PROGRAMS &&
            parsed.version !== ARCHIVE_VERSION_WITHOUT_EDITS)
    ) {
        throw new ProjectFormatError('Unsupported Project archive version')
    }
    //version 1 knows no Byte edits, and versions before 4 no Annotations
    const keys =
        parsed.version === ARCHIVE_VERSION_WITHOUT_EDITS
            ? ['encoding']
            : parsed.version === ARCHIVE_VERSION_WITH_ANNOTATIONS
              ? ['encoding', 'edits', 'annotations']
              : ['encoding', 'edits']
    if (!isRecord(parsed.project) || !isRecord(parsed.files)) {
        throw new ProjectFormatError('Malformed Project archive manifest')
    }
    validateProjectMetadata(parsed.project, parsed.version)
    for (const [path, info] of Object.entries(parsed.files)) {
        if (
            !isValidFilePath(path) ||
            !isRecord(info) ||
            typeof info.encoding !== 'string' ||
            !FILE_ENCODINGS.includes(info.encoding as FileEncoding) ||
            Object.keys(info).some((key) => !keys.includes(key)) ||
            (info.edits !== undefined && !Array.isArray(info.edits)) ||
            (info.annotations !== undefined && !isRecord(info.annotations))
        ) {
            throw new ProjectFormatError(`Malformed manifest File entry: ${path}`)
        }
    }
    return parsed as ProjectManifest
}

function validateProjectMetadata(project: Record<string, unknown>, version: unknown): void {
    if (
        typeof project.id !== 'string' ||
        typeof project.name !== 'string' ||
        typeof project.description !== 'string' ||
        !isAvailableLanguage(project.language) ||
        typeof project.createdAt !== 'number' ||
        !Number.isFinite(project.createdAt) ||
        typeof project.updatedAt !== 'number' ||
        !Number.isFinite(project.updatedAt)
    ) {
        throw new ProjectFormatError('Malformed Project metadata')
    }
    if (version === ARCHIVE_VERSION || version === ARCHIVE_VERSION_WITH_ANNOTATIONS) {
        if (
            !isRecord(project.programs) ||
            (project.selectedProgram !== undefined &&
                (typeof project.selectedProgram !== 'string' ||
                    !isValidFilePath(project.selectedProgram)))
        ) {
            throw new ProjectFormatError('Malformed Project metadata')
        }
        for (const [entry, program] of Object.entries(project.programs)) {
            if (!isValidFilePath(entry) || !isRecord(program)) {
                throw new ProjectFormatError(`Malformed Program ${entry} metadata`)
            }
            validateProgramMetadata(program, `Program ${entry}`)
        }
    } else {
        //before Programs, the one Program's parts are the project's own
        if (typeof project.entry !== 'string' || !isValidFilePath(project.entry)) {
            throw new ProjectFormatError('Malformed Project metadata')
        }
        validateProgramMetadata(project, 'Project')
    }
    if (project.exam !== undefined && !isRecord(project.exam)) {
        throw new ProjectFormatError('Malformed Project exam metadata')
    }
}

/** A Program's parts, which are at the top of a manifest before version 3. */
function validateProgramMetadata(program: Record<string, unknown>, owner: string): void {
    if (!isRecord(program.settings) || !Array.isArray(program.testcases)) {
        throw new ProjectFormatError(`Malformed ${owner} metadata`)
    }
    if (program.display !== undefined && !isRecord(program.display)) {
        throw new ProjectFormatError(`Malformed ${owner} display metadata`)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLegacyLinkedFileCompatible(project: ProjectData): boolean {
    return isSingleSourceProject(project)
}

export type { ProjectManifest }
