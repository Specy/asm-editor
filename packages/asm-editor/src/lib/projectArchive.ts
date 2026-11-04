import {
    isAvailableLanguage,
    legacyProjectShape,
    makeProject,
    type ExternalImport,
    type LegacyProjectData,
    type Project,
    type ProjectData,
    type StoredProject,
    withoutBuildOutputs
} from '#lib/Project.svelte.ts'
import { untouchedBuildOutputs } from '#lib/buildOutput.ts'
import { LANGUAGE_EXTENSIONS } from '#lib/Config.ts'
import { serializer } from '#lib/json.ts'
import {
    cleanFiles,
    formatMiB,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    FILE_COUNT_TEXT,
    FILE_ENCODINGS,
    PATH_BYTE_LIMIT,
    isValidFilePath,
    fileBytes,
    projectFileFromBytes,
    withAnnotations,
    ProjectFormatError,
    type Annotations,
    type ByteEdit,
    type FileEncoding,
    type ProjectFile
} from '#lib/projectFiles.ts'
import {
    AsyncZipDeflate,
    inflate,
    unzip,
    Zip,
    ZipDeflate,
    type UnzipFileInfo,
    type Unzipped
} from 'fflate'

/**
 * Version 2 gave a File's manifest entry its Byte edits, beside the original bytes under `files/`;
 * version 3 replaced the project's `entry`, `settings`, `testcases` and `display` with its `programs`
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md));
 * version 4, version 3's shape, gave a File's entry its Annotations
 * ([annotations-and-search.md](../../../../docs/design/annotations-and-search.md), decision 21).
 * An archive is written in the oldest version that holds it, which older editors read: a Project
 * with one Program as version 1, one with several or none as 3, and only one with Annotations as
 * 4, which an editor before them refuses as a version it does not know. Since a File holds its
 * current bytes ([ADR 0063](../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md))
 * none is written with Byte edits, so none as version 2; those read are applied as the File is.
 */
const ARCHIVE_VERSION_WITH_ANNOTATIONS = 4
const ARCHIVE_VERSION = 3
const ARCHIVE_VERSION_WITHOUT_PROGRAMS = 2
const ARCHIVE_VERSION_WITHOUT_EDITS = 1
const MANIFEST_NAME = 'project.json'
const FILE_PREFIX = 'files/'
const MANIFEST_BYTE_LIMIT = 1024 * 1024
const METADATA_LIMIT_MESSAGE = `Project metadata exceeds the ${formatMiB(MANIFEST_BYTE_LIMIT)} archive limit`
//A valid worst-case ZIP repeats every path in its local and central directory records. Keep the
//compressed-input guard large enough that a Project's whole `FILE_BYTE_LIMIT` of Files can always
//round-trip, even when it is split across 4,096 maximally long paths.
const ARCHIVE_BYTE_LIMIT =
    FILE_BYTE_LIMIT + MANIFEST_BYTE_LIMIT + FILE_COUNT_LIMIT * (PATH_BYTE_LIMIT * 2 + 256)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

type ArchivedFile = {
    encoding: FileEncoding
    /** Read from versions 2 to 4, never written. */
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

/**
 * The Project as a download or an archive holds it: without the Build outputs nobody changed, which
 * a Build makes again ([ADR 0056](../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).
 */
function snapshotOf(project: Project | ProjectData): ProjectData {
    return withoutBuildOutputs('toObject' in project ? project.toObject() : project)
}

/** How large a File fflate's `zip` compresses in a Worker; smaller ones it compresses itself. */
const DEFLATE_IN_WORKER = 160_000
/**
 * How many Workers compress at once. fflate's `zip` starts one for every large File together,
 * each a JavaScript engine of its own: an archive of a 64 MiB Project then took about 320 MiB more
 * memory while it was made, and two at a time about 100 MiB.
 */
const DEFLATE_WORKERS = 2

/**
 * An archive of `entries`, made as fflate's asynchronous `zip` makes it, through its streaming
 * `Zip`: each File of {@link DEFLATE_IN_WORKER} or more is compressed in a Worker, at most
 * {@link DEFLATE_WORKERS} at once, so the seconds a large Project's archive takes are off the
 * page's thread; a smaller one is compressed on the thread, where a Worker would cost more than
 * it saves. The entries' bytes are handed over to the Workers, so the caller keeps none of them.
 */
function zipped(entries: Record<string, Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = []
        const running = new Set<AsyncZipDeflate>()
        let failed = false
        let freed: (() => void) | undefined
        const fail = (error: unknown) => {
            if (failed) return
            failed = true
            for (const file of running) file.terminate()
            freed?.()
            reject(error)
        }
        const archive = new Zip((error, data, final) => {
            if (failed) return
            if (error) return fail(error)
            chunks.push(data)
            if (!final) return
            const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0))
            let at = 0
            for (const chunk of chunks) {
                bytes.set(chunk, at)
                at += chunk.length
            }
            resolve(bytes)
        })
        const add = async () => {
            for (const [name, bytes] of Object.entries(entries)) {
                if (bytes.length < DEFLATE_IN_WORKER) {
                    const file = new ZipDeflate(name, { level: 6 })
                    archive.add(file)
                    file.push(bytes, true)
                    continue
                }
                while (running.size >= DEFLATE_WORKERS && !failed)
                    await new Promise<void>((resolve) => (freed = resolve))
                if (failed) return
                const file = new AsyncZipDeflate(name, { level: 6 })
                archive.add(file)
                //the archive's own handler, which `add` set, and the slot this File frees
                const handle = file.ondata
                file.ondata = (error, data, final) => {
                    handle(error, data, final)
                    if (error || final) {
                        running.delete(file)
                        const next = freed
                        freed = undefined
                        next?.()
                    }
                }
                running.add(file)
                file.push(bytes, true)
            }
            archive.end()
        }
        add().catch(fail)
    })
}

/**
 * fflate's `unzip` as a promise. `filter` sees each entry before it is inflated, and a throw from
 * it refuses the archive: no entry after it is inflated, and the Workers already started are
 * stopped.
 */
function unzipOnce(bytes: Uint8Array, filter: (file: UnzipFileInfo) => boolean): Promise<Unzipped> {
    return new Promise((resolve, reject) => {
        let refusal: { error: unknown } | undefined
        const checked = (file: UnzipFileInfo) => {
            if (refusal) return false
            try {
                return filter(file)
            } catch (error) {
                refusal = { error }
                return false
            }
        }
        let stop: () => void
        try {
            stop = unzip(bytes, { filter: checked }, (error, data) => {
                if (refusal) reject(refusal.error)
                else if (error) reject(error)
                else resolve(data)
            })
        } catch (error) {
            reject(error)
            return
        }
        //every entry is filtered before `unzip` returns
        if (refusal) {
            stop()
            reject(refusal.error)
        }
    })
}

/**
 * Whether fflate's `unzip` inflates an entry in a Worker, as it does a large one that compresses
 * well; it inflates every other one on the page's thread, where a Worker would cost more than it
 * saves.
 */
const inflatedInWorker = (file: UnzipFileInfo) =>
    file.compression === 8 &&
    file.originalSize >= 512 * 1024 &&
    file.size <= 0.8 * file.originalSize

/** How many Workers inflate at once, each a JavaScript engine of its own. */
const INFLATE_WORKERS = 2

/** Where an entry's compressed bytes start and how many there are, as the archive says. */
type EntryPlace = { start: number; size: number; originalSize: number }

/**
 * Each entry's place, in the order of the archive's central directory, which is the order fflate's
 * `unzip` shows the entries to its filter in; undefined for an archive this does not read, a ZIP64
 * one, which no Project's archive needs.
 */
function entryPlaces(bytes: Uint8Array): EntryPlace[] | undefined {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let end = bytes.length - 22
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) {
        if (bytes.length - end > 65_557) return undefined
        end--
    }
    if (end < 0) return undefined
    const count = view.getUint16(end + 10, true)
    let at = view.getUint32(end + 16, true)
    if (count === 0xffff || at === 0xffffffff) return undefined
    const places: EntryPlace[] = []
    for (let index = 0; index < count; index++) {
        if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return undefined
        const size = view.getUint32(at + 20, true)
        const originalSize = view.getUint32(at + 24, true)
        const local = view.getUint32(at + 42, true)
        if (size === 0xffffffff || originalSize === 0xffffffff || local === 0xffffffff)
            return undefined
        if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50)
            return undefined
        const start =
            local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
        if (start + size > bytes.length) return undefined
        places.push({ start, size, originalSize })
        //the header, its name, its extra field and its comment
        at +=
            46 +
            view.getUint16(at + 28, true) +
            view.getUint16(at + 30, true) +
            view.getUint16(at + 32, true)
    }
    return places
}

/**
 * fflate's asynchronous `inflate` of one entry's own bytes, which its Worker takes over, and how
 * to stop it, which ends its Worker.
 */
function inflated(
    data: Uint8Array,
    size: number
): { result: Promise<Uint8Array<ArrayBuffer>>; stop: () => void } {
    let stop = () => {}
    const result = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
        try {
            const terminate = inflate(data, { size, consume: true }, (error, bytes) =>
                error ? reject(error) : resolve(bytes as Uint8Array<ArrayBuffer>)
            )
            stop = () => {
                terminate()
                reject(new ProjectFormatError('Reading the archive was stopped'))
            }
        } catch (error) {
            reject(error)
        }
    })
    return { result, stop: () => stop() }
}

/**
 * The entries `filter` takes, inflated as fflate's asynchronous `unzip` does, the large ones in
 * Workers, but {@link INFLATE_WORKERS} at a time and each given its own compressed bytes. fflate's
 * `unzip` starts a Worker for every large entry at once and sends each one the whole archive,
 * which for a 64 MiB Project's took 1.4 GiB more memory than inflating it on the page's thread.
 */
async function unzipped(
    bytes: Uint8Array,
    filter: (file: UnzipFileInfo) => boolean
): Promise<Unzipped> {
    const large: { file: UnzipFileInfo; index: number }[] = []
    let index = 0
    const files = await unzipOnce(bytes, (file) => {
        const at = index++
        if (!filter(file)) return false
        if (!inflatedInWorker(file)) return true
        large.push({ file, index: at })
        return false
    })
    if (!large.length) return files
    const places = entryPlaces(bytes)
    //an entry that fails, or the page left, stops the Workers inflating and starts no more
    const running = new Set<() => void>()
    let failure: { error: unknown } | undefined
    const stopAll = (error: unknown) => {
        failure ??= { error }
        for (const stop of running) stop()
    }
    const leave = () =>
        stopAll(new ProjectFormatError('The page was left before the archive was read'))
    const page = typeof window === 'undefined' ? undefined : window
    page?.addEventListener('pagehide', leave)
    let next = 0
    const inflateLarge = async () => {
        while (next < large.length && !failure) {
            const { file, index } = large[next++]
            const place = places?.[index]
            if (!place || place.size !== file.size || place.originalSize !== file.originalSize) {
                files[file.name] = (await unzipOnce(bytes, (entry) => entry.name === file.name))[
                    file.name
                ]
                continue
            }
            //a copy of its own, which the Worker takes over: a slice of a Node Buffer would be
            //a view of the whole archive
            const job = inflated(
                new Uint8Array(bytes.subarray(place.start, place.start + place.size)),
                file.originalSize
            )
            running.add(job.stop)
            try {
                files[file.name] = await job.result
            } catch (error) {
                stopAll(error)
            } finally {
                running.delete(job.stop)
            }
        }
    }
    try {
        await Promise.all(
            Array.from({ length: Math.min(INFLATE_WORKERS, large.length) }, inflateLarge)
        )
    } finally {
        page?.removeEventListener('pagehide', leave)
    }
    if (failure) throw failure.error
    return files
}

/**
 * A complete, byte-preserving Project ZIP. No running descriptor or Undo state is serialized. The
 * larger Files are compressed in Workers (`zipped`).
 */
export async function projectToArchive(
    project: Project | ProjectData
): Promise<Uint8Array<ArrayBuffer>> {
    const snapshot = snapshotOf(project)
    const files = cleanFiles(snapshot.files)
    const annotated = Object.values(files).some((file) => file.annotations)
    //no version before Programs holds Annotations, so they take the shape after them
    const legacy = annotated ? undefined : legacyProjectShape(snapshot)
    const projectMetadata = { ...(legacy ?? snapshot) }
    Reflect.deleteProperty(projectMetadata, 'files')
    const manifest: ProjectManifest = {
        version: annotated
            ? ARCHIVE_VERSION_WITH_ANNOTATIONS
            : !legacy
              ? ARCHIVE_VERSION
              : ARCHIVE_VERSION_WITHOUT_EDITS,
        project: projectMetadata,
        files: Object.fromEntries(
            Object.entries(files).map(([path, file]) => [
                path,
                {
                    encoding: file.encoding,
                    ...(file.annotations ? { annotations: file.annotations } : {})
                }
            ])
        )
    }
    const manifestBytes = encoder.encode(serializer.stringify(manifest, null, 2))
    if (manifestBytes.length > MANIFEST_BYTE_LIMIT) {
        throw new ProjectFormatError(METADATA_LIMIT_MESSAGE)
    }
    const entries: Record<string, Uint8Array> = { [MANIFEST_NAME]: manifestBytes }
    for (const [path, file] of Object.entries(files))
        entries[`${FILE_PREFIX}${path}`] = fileBytes(file)
    return zipped(entries)
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
 * exported file's shape before Programs can say. A Build output nobody changed does not count,
 * since the file leaves it out.
 */
export function isSingleSourceProject(project: Project | ProjectData): boolean {
    const derived = untouchedBuildOutputs(project.files, project.builds)
    const paths = Object.keys(project.files).filter((path) => !derived.has(path))
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
export async function projectDownload(project: Project | ProjectData): Promise<ProjectDownload> {
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
        contents: await projectToArchive(snapshot)
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

/**
 * Validates the entire archive before constructing a Project. The larger Files are inflated in
 * Workers (`unzipped`).
 */
export async function makeProjectFromArchive(
    input: ArrayBuffer | Uint8Array
): Promise<ExternalImport> {
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
        extracted = await unzipped(bytes, (file) => {
            if (seen.has(file.name))
                throw new ProjectFormatError(`Duplicate archive entry: ${file.name}`)
            seen.add(file.name)
            if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) {
                throw new ProjectFormatError(`Invalid expanded size for ${file.name}`)
            }
            //no DEFLATE stream needs more than its bytes and a few for each block to hold them,
            //so a longer one is not what it says it expands to: a zip bomb expanding far past
            //its stated size on the page's thread, or a damaged archive
            if (
                file.compression === 0
                    ? file.size !== file.originalSize
                    : file.size > file.originalSize + Math.ceil(file.originalSize / 16_384) * 5 + 64
            ) {
                throw new ProjectFormatError(`Invalid compressed size for ${file.name}`)
            }
            if (file.name === MANIFEST_NAME) {
                if (manifestFound) throw new ProjectFormatError('Duplicate project manifest')
                manifestFound = true
                if (file.originalSize > MANIFEST_BYTE_LIMIT) {
                    throw new ProjectFormatError(METADATA_LIMIT_MESSAGE)
                }
                return true
            }
            if (!file.name.startsWith(FILE_PREFIX)) {
                throw new ProjectFormatError(`Unsupported archive entry: ${file.name}`)
            }
            const path = file.name.slice(FILE_PREFIX.length)
            if (!isValidFilePath(path)) {
                throw new ProjectFormatError(`Unsafe or invalid archived file path: ${file.name}`)
            }
            fileCount += 1
            fileBytesTotal += file.originalSize
            if (fileCount > FILE_COUNT_LIMIT) {
                throw new ProjectFormatError(
                    `Project archive exceeds the ${FILE_COUNT_TEXT}-file limit`
                )
            }
            if (fileBytesTotal > FILE_BYTE_LIMIT) {
                throw new ProjectFormatError(
                    `Project archive exceeds the ${formatMiB(FILE_BYTE_LIMIT)} file limit`
                )
            }
            return true
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

    const files: Record<string, ProjectFile & Pick<ArchivedFile, 'edits'>> = Object.create(null)
    for (const path of metadataPaths) {
        if (!isValidFilePath(path))
            throw new ProjectFormatError(`Invalid manifest File path: ${path}`)
        const archived = extracted[`${FILE_PREFIX}${path}`]
        if (!archived) throw new ProjectFormatError(`Archived File is missing: ${path}`)
        const info = rawManifest.files[path]
        const file = projectFileFromBytes(archived, info.encoding)
        //a File without edits is the record its bytes made, which `cleanFiles` below does not
        //check again, with its Annotations checked as a saved Project's; one with them is left to
        //`cleanFiles`, which applies the edits of versions 2 to 4 to the original under `files/`
        files[path] =
            info.edits === undefined
                ? info.annotations === undefined
                    ? file
                    : withAnnotations(path, file, info.annotations)
                : {
                      ...file,
                      edits: info.edits,
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
        throw new ProjectFormatError(METADATA_LIMIT_MESSAGE)
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
