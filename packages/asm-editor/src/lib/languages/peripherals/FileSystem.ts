import {
    annotationsKey,
    bytesFile,
    cleanFiles,
    projectFileFromBytes,
    fileBytes,
    fileText,
    overwriteBytes,
    storedAnnotationsSize,
    storedFilesSize,
    withAnnotations,
    isValidFilePath,
    ProjectFormatError,
    resolveFilePath,
    textFile,
    formatMiB,
    ANNOTATIONS_BYTE_LIMIT,
    ANNOTATIONS_SAVE_MESSAGE,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    FILE_LIMIT_MESSAGE,
    type Annotations,
    type BuildSources,
    type ByteRun,
    type FileEncoding,
    type ProjectFile,
    type ProjectFiles
} from '#lib/projectFiles.ts'
import { partitionPoint } from '#lib/sorted.ts'

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)
const strictDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** The text of `bytes` when they are valid UTF-8 on their own, otherwise `null`. */
function decodeStandalone(bytes: Uint8Array): string | null {
    try {
        return strictDecoder.decode(bytes)
    } catch {
        return null
    }
}

/**
 * `file` caches this node's storage representation, dropped whenever `bytes` changes and put back
 * by an Undo that restores the bytes it stood for, so a File's record (its encoding and
 * Annotations) comes back as it was rather than rebuilt from its bytes. `busy` marks the running
 * program's own File, its Build output, which the program reads but never changes; `built` marks
 * one only presented to it, which is no File of the Project.
 */
type Node = { bytes: Uint8Array; file?: ProjectFile; busy?: true; built?: true }
type Handle = { node: Node; offset: number; readable: boolean; writable: boolean; append: boolean }
/**
 * A folder open for listing: the entries it had when it was opened, and how far getdents has read
 * them, as Linux reads a folder from where the last read stopped.
 */
type FolderHandle = { path: string; entries: Omit<DirectoryRecord, 'next'>[]; offset: number }
type Inverse = { bytes: number; filesChanged?: true; restore: () => void }
/** A Core-owned instruction identity. Values are compared exactly, without numeric coercion. */
export type FileSystemInstructionId = number | string | bigint

type Frame = {
    id: FileSystemInstructionId
    changes: Inverse[]
    bytes: number
    available: boolean
    filesChanged: boolean
}
/** What a resolved path names: a File, a Directory, nothing, or nothing as it runs through a File. */
type Lookup =
    | { kind: 'file'; node: Node }
    | { kind: 'directory' }
    | { kind: 'missing' }
    | { kind: 'below-file' }
/**
 * Where the Files are kept. It starts with Files `cleanFiles` returned, as `makeProject`'s are:
 * a change keeps every record it holds without checking it again.
 */
export type FileStore = { read: () => ProjectFiles; write: (files: ProjectFiles) => void }
export type { ByteRun }
/**
 * A change to one File's bytes that the **Edit journal** can take back
 * ([ADR 0063](../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)):
 * runs written over them, or a whole new content stored as `encoding`, Canvas size's.
 */
export type ByteChange =
    | Readonly<{ runs: readonly ByteRun[] }>
    | Readonly<{ content: Uint8Array; encoding: FileEncoding }>

/**
 * Why a file operation failed, named after the errno a POSIX system reports for the same failure,
 * so an adapter answers in its Target's convention (MARS's -1, EASy68K's D0 result, Linux's
 * negative errno) without reading the message.
 */
export enum FileErrorCode {
    /** No File at the path, for an operation that does not create one. */
    NotFound = 'ENOENT',
    /** An exclusive create found a File already there, or a mkdir found anything there. */
    Exists = 'EEXIST',
    /** A descriptor that is not open, or not open for the read or write asked of it. */
    BadDescriptor = 'EBADF',
    /** A File operation on a Directory, the Project root included. */
    IsDirectory = 'EISDIR',
    /** A path that runs through a File as if it were a Directory, or a listing of a File. */
    NotDirectory = 'ENOTDIR',
    /** The session's limit on open descriptors is reached. */
    TooManyOpen = 'EMFILE',
    /** The Project's limit on its Files' bytes (`FILE_BYTE_LIMIT`) or on 4,096 Files would be passed. */
    NoSpace = 'ENOSPC',
    /** One File would grow past `FILE_BYTE_LIMIT`, all the room the Project's Files have. */
    TooLarge = 'EFBIG',
    /** A malformed path, count, position, seek origin or open mode. */
    InvalidArgument = 'EINVAL',
    /** A path that climbs out of the Project root. */
    AccessDenied = 'EACCES',
    /** A write to, or a truncation of, the running program's own File: the Build output. */
    TextBusy = 'ETXTBSY',
    /** A rename or removal of the Build output, which the running program was started from. */
    Busy = 'EBUSY',
    /** An rmdir of a folder that still holds a File or a folder. */
    NotEmpty = 'ENOTEMPTY'
}

/**
 * A failure the running program can be told about, with its cause as an errno name: a path that is
 * not there, a descriptor it never opened, a File it opened read-only, a full FileSystem. An
 * architecture whose syscalls report failure through a return value answers these with its own
 * error value instead of ending the run. Everything else the FileSystem throws — a session that
 * has ended, a misused transaction — is an environment failure the program cannot act on, and
 * stays an exception.
 */
export class FileSystemGuestError extends Error {
    constructor(
        readonly code: FileErrorCode,
        message: string
    ) {
        super(message)
        this.name = 'FileSystemGuestError'
    }
}

/**
 * The value MARS and RARS hand back for a failed file syscall: -1, a full FileSystem (ENOSPC,
 * EFBIG) included, as their write service returns -1 for an `IOException`. Anything that is not a
 * guest failure is rethrown, so a session that has ended still ends the run instead of being
 * mistaken for an ordinary error code.
 */
export function guestFileFailure(error: unknown): number {
    if (error instanceof FileSystemGuestError || error instanceof ProjectFormatError) return -1
    throw error
}

/**
 * Linux's numbers for the errno names, those of its generic table (`asm-generic/errno-base.h` and
 * `errno.h`), which the MIPS and RISC-V folder calls report on both Targets.
 */
const LINUX_ERRNO: Readonly<Record<FileErrorCode, number>> = {
    [FileErrorCode.NotFound]: 2,
    [FileErrorCode.BadDescriptor]: 9,
    [FileErrorCode.AccessDenied]: 13,
    [FileErrorCode.Busy]: 16,
    [FileErrorCode.Exists]: 17,
    [FileErrorCode.NotDirectory]: 20,
    [FileErrorCode.IsDirectory]: 21,
    [FileErrorCode.InvalidArgument]: 22,
    [FileErrorCode.TooManyOpen]: 24,
    [FileErrorCode.TextBusy]: 26,
    [FileErrorCode.TooLarge]: 27,
    [FileErrorCode.NoSpace]: 28,
    [FileErrorCode.NotEmpty]: 39
}

/**
 * Minus the Linux error number of a failed file operation, the value the MIPS and RISC-V folder
 * calls return, Linux's way ([ADR 0072](../../../../../../docs/adr/0072-mips-and-risc-v-folder-calls-continue-rars-s-linux-numbering.md)):
 * -2 for a path that names nothing, -17 for one that names something already, -39 for a folder
 * that is not empty. A Project path the Files cannot take is -22, EINVAL. Anything that is not a
 * guest failure is rethrown, as `guestFileFailure` rethrows it.
 */
export function guestErrno(error: unknown): number {
    if (error instanceof FileSystemGuestError) return -LINUX_ERRNO[error.code]
    if (error instanceof ProjectFormatError) return -LINUX_ERRNO[FileErrorCode.InvalidArgument]
    throw error
}

/** What a descriptor may do with its File: O_RDONLY, O_WRONLY or O_RDWR. */
export type FileAccess = 'read' | 'write' | 'read-write'
const FILE_ACCESSES: readonly FileAccess[] = ['read', 'write', 'read-write']

/** POSIX's open flags, for Targets whose file services are named after them. */
export type FileOpenFlags = {
    access: FileAccess
    /** O_CREAT: create an empty File when the path names none, with the Directories on its path. */
    create?: boolean
    /** O_EXCL: with `create`, fail with EEXIST when the File exists already. Ignored without it. */
    exclusive?: boolean
    /** O_TRUNC: empty the File as it opens, whatever the access. */
    truncate?: boolean
    /** O_APPEND: every `write` lands at the end of the File, wherever the position was. */
    append?: boolean
}

/**
 * MARS and RARS's open modes, kept as shorthands: `read` opens an existing File read-only, `write`
 * creates or empties one, and `append` creates one or writes after what it holds.
 */
export type FileOpenMode = 'read' | 'write' | 'append'
const OPEN_MODES: Readonly<Record<FileOpenMode, FileOpenFlags>> = {
    read: { access: 'read' },
    write: { access: 'write', create: true, truncate: true },
    append: { access: 'write', create: true, append: true }
}

/**
 * How a session numbers descriptors. `open` hands out the lowest free one from `firstDescriptor`
 * and fails with EMFILE while `maxOpen` are open. The default, 3 upward without a limit, leaves
 * 0–2 to the standard streams as MARS, RARS and Linux do; EASy68K's file numbers are 0 to 7.
 */
export type FileDescriptorOptions = { firstDescriptor?: number; maxOpen?: number }

export type FileKind = 'file' | 'directory'
/** What `stat` reports. A Directory's size is 0: it holds Files, not bytes. */
export type FileStat = { kind: FileKind; size: number }
export type DirectoryEntry = { name: string; kind: FileKind }
/**
 * What `inspect` reports, a folder call's stat: `stat`'s, with the inode number and the link count.
 * Inode numbers are made up, but each File and each folder keeps its own for the whole session: a
 * File's moves with it when it is renamed, and the Project root's is 1.
 */
export type FileDetails = FileStat & { inode: number; links: number }
/**
 * One entry of a folder open for listing, as `readDirectory` hands it out: `.` and `..` first, as
 * Linux lists them, then the folder's Files and folders in name order. `next` is the position just
 * after it, which getdents reports as the entry's offset.
 */
export type DirectoryRecord = { name: string; kind: FileKind; inode: number; next: number }

/**
 * Resolves a program's path against the Project root by `resolveFilePath`'s rules, with typed
 * failures, and with '' for the root itself, which is a Directory and never a File.
 */
function resolveSessionPath(path: string): string {
    const parts: string[] = []
    for (const part of path.replace(/^\//, '').split('/')) {
        if (part === '.') continue
        if (part === '..') {
            if (!parts.length)
                throw new FileSystemGuestError(
                    FileErrorCode.AccessDenied,
                    `Path escapes the Project root: ${path}`
                )
            parts.pop()
        } else parts.push(part)
    }
    const resolved = parts.join('/')
    if (resolved !== '' && !isValidFilePath(resolved))
        throw new FileSystemGuestError(FileErrorCode.InvalidArgument, `Invalid file path: ${path}`)
    return resolved
}

/**
 * A folder call's path: `resolveSessionPath`'s, read as Linux reads one, where repeated slashes are
 * one and a trailing slash says the path must name a folder (`directory`). An empty path names
 * nothing (ENOENT), where the other operations take it for the Project root.
 */
function resolveCallPath(path: string): { path: string; directory: boolean } {
    if (path === '')
        throw new FileSystemGuestError(FileErrorCode.NotFound, 'No such File or Directory: ""')
    const directory = path.endsWith('/')
    return {
        path: resolveSessionPath(path.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1')),
        directory
    }
}

/** The folder that holds a resolved path: '' for the Project root's children. */
function parentOf(path: string): string {
    const slash = path.lastIndexOf('/')
    return slash === -1 ? '' : path.slice(0, slash)
}

/** The failure for a path that names no File, after what it names instead. */
function noFile(path: string, found: Exclude<Lookup, { kind: 'file' }>) {
    if (found.kind === 'directory')
        return new FileSystemGuestError(FileErrorCode.IsDirectory, `Is a Directory: ${path || '/'}`)
    if (found.kind === 'below-file')
        return new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${path}`)
    return new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
}

/**
 * The failure for changing the Build output, the File the running program was started from, named
 * as Linux names it: a write or truncation is ETXTBSY, a rename or removal EBUSY.
 */
function busyFile(path: string, code: FileErrorCode.TextBusy | FileErrorCode.Busy) {
    const reason = code === FileErrorCode.TextBusy ? 'Text file busy' : 'Device or resource busy'
    return new FileSystemGuestError(code, `${reason}: ${path}`)
}

/** A byte count or position the program passed: a non-negative safe integer, or EINVAL. */
function checkCount(value: number, what: string) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new FileSystemGuestError(FileErrorCode.InvalidArgument, `Invalid ${what}: ${value}`)
}

/** Project-backed named files; runtime capabilities hold transient descriptors and instruction history. */
export class FileSystem {
    private store: FileStore
    private active?: FileSystemSession
    private listeners = new Set<(filesChanged: boolean) => void>()
    constructor(files: ProjectFiles = {}, store?: FileStore) {
        let current = cleanFiles(files)
        this.store = store ?? {
            read: () => current,
            write: (next) => {
                current = next
            }
        }
    }
    get files() {
        return this.store.read()
    }
    get locked() {
        return !!this.active
    }
    subscribe(listener: (filesChanged: boolean) => void) {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }
    private notify(filesChanged = false) {
        for (const listener of this.listeners) listener(filesChanged)
    }
    assertEditable() {
        if (this.locked) throw new Error('Stop the Debug session before changing Files')
    }
    readBytes(path: string) {
        const file = this.files[resolveFilePath(path)]
        if (!file) throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        return fileBytes(file)
    }
    readText(path: string) {
        const file = this.files[resolveFilePath(path)]
        if (!file) throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        return fileText(file)
    }
    snapshot(entry: string, assemblerProfile?: BuildSources['assemblerProfile']): BuildSources {
        return Object.freeze({
            files: cleanFiles(this.files),
            entry,
            ...(assemblerProfile !== undefined ? { assemblerProfile } : {})
        })
    }
    replace(files: ProjectFiles) {
        this.assertEditable()
        this.commit(files)
    }
    /**
     * Replaces a File's whole content: any Annotations it had are dropped, as for an upload over
     * it. It is stored as text when the bytes decode as UTF-8, unless `encoding` says how.
     */
    writeBytes(path: string, bytes: Uint8Array, replace = true, encoding?: FileEncoding) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!replace && hasOwn(this.files, path))
            throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${path}`)
        const file = encoding ? projectFileFromBytes(bytes, encoding) : bytesFile(bytes)
        this.commit({ ...this.files, [path]: file })
    }
    /**
     * Makes `changes` to one File, in order, as one save, and returns for each, in the same order,
     * the change that takes it back, so that made last first they take every change back: what
     * the Hex and Pixel editors write, and what the Edit journal writes back
     * ([ADR 0063](../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).
     * Runs overwrite, so the File keeps its length, its encoding and its Annotations; a File
     * stored as text must stay UTF-8. A whole new content drops the Annotations, as `writeBytes`
     * does. A refused change, past the File's end or the Project's `FILE_BYTE_LIMIT`, leaves it as
     * it was.
     */
    changeBytes(path: string, changes: readonly ByteChange[]): ByteChange[] {
        this.assertEditable()
        path = resolveFilePath(path)
        const before = this.files[path]
        if (!before)
            throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        let file = before
        const inverses = changes.map((change): ByteChange => {
            if ('runs' in change) {
                const written = overwriteBytes(file, change.runs)
                if (written && !written.restore.length) return { runs: [] }
                if (!written)
                    throw new ProjectFormatError(
                        `Not saved: ${path} is stored as text, and these bytes would leave it no longer UTF-8`
                    )
                file = written.file
                return { runs: written.restore }
            }
            const inverse = { content: fileBytes(file), encoding: file.encoding }
            file = projectFileFromBytes(change.content, change.encoding)
            return inverse
        })
        if (file === before) return inverses
        //nothing else changed, so instead of `cleanFiles`, which would still decode the changed
        //File whole, the size is read from the stored lengths: typing into a File of many MiB
        //costs what the change does
        const files: Record<string, ProjectFile> = Object.assign(Object.create(null), this.files)
        files[path] = file
        if (storedFilesSize(files) > FILE_BYTE_LIMIT)
            throw new ProjectFormatError(FILE_LIMIT_MESSAGE)
        this.store.write(Object.freeze(files))
        this.notify(true)
        return inverses
    }
    /**
     * Replaces a File's Annotations
     * ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
     * decision 20), or takes them all away with undefined. They change no byte, so unlike every
     * other change this is allowed while a Debug session holds the Files: the session's record of
     * the File takes them and publishes it, so that its next publish keeps them, and no instruction
     * Undo takes them back. The record is checked as a saved one is, and the Project's Annotations
     * together must stay within `ANNOTATIONS_BYTE_LIMIT`; a refused change leaves the Files as they were. Its File
     * change notice saves them as any change to the Files is saved. A record the same as the
     * File's changes nothing and tells no one.
     */
    annotate(path: string, annotations: Annotations | undefined) {
        path = resolveFilePath(path)
        if (this.active) {
            this.active.annotate(path, annotations)
            return
        }
        const file = this.files[path]
        if (!file) throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        if (annotationsKey(file) === annotationsKey({ annotations })) return
        const files: Record<string, ProjectFile> = Object.assign(Object.create(null), this.files)
        files[path] = withAnnotations(path, file, annotations)
        if (storedAnnotationsSize(files) > ANNOTATIONS_BYTE_LIMIT)
            throw new ProjectFormatError(ANNOTATIONS_SAVE_MESSAGE)
        this.store.write(Object.freeze(files))
        this.notify(true)
    }
    /**
     * Replaces a File's whole content with text, as typing into the editor does, which drops its
     * Annotations as `writeBytes` does. The text is not encoded to check it (`textFile`), so a
     * keystroke in a File costs about its length, whatever the Project's size.
     */
    writeText(path: string, text: string, replace = true) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!replace && hasOwn(this.files, path))
            throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${path}`)
        this.commit({ ...this.files, [path]: textFile(text) })
    }
    remove(path: string) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!hasOwn(this.files, path))
            throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        const files = { ...this.files }
        delete files[path]
        this.commit(files)
    }
    rename(from: string, to: string) {
        this.assertEditable()
        from = resolveFilePath(from)
        to = resolveFilePath(to)
        if (from === to) return
        if (!hasOwn(this.files, from))
            throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${from}`)
        if (hasOwn(this.files, to))
            throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${to}`)
        const files = { ...this.files, [to]: this.files[from] }
        delete files[from]
        this.commit(files)
    }
    /**
     * Stores `files` once `cleanFiles` checked them. Every record it already holds is kept as it
     * is, wherever it now is, as `changeBytes` and `annotate` keep them: only the Files a change
     * made are checked, and every other one stays the record caches keyed by it know.
     */
    private commit(files: ProjectFiles) {
        this.store.write(cleanFiles(files))
        this.notify(true)
    }
    /**
     * The Debug session's own publish. It validated each path through `resolveFilePath`'s rules,
     * refused File/directory collisions as it applied them and enforced the size and count limits
     * through `capacity`, and every File it publishes came from `bytesFile`, is a record it was
     * given, which `cleanFiles` checked, or is one `annotate` checked through `withAnnotations` and
     * the Annotations' limit, so re-running `cleanFiles` here would decode each File the session
     * wrote, whole, again on every Core step that touches one.
     */
    private publishSessionFiles(files: ProjectFiles) {
        this.store.write(files)
        this.notify(true)
    }
    /**
     * Starts the Debug session's exclusive access. `descriptors` sets how its descriptors are
     * numbered, for the Target's convention; the default suits MARS, RARS and Linux.
     */
    beginSession(
        budget = 64 * 1024 * 1024,
        coreHistorySize = 100,
        descriptors: FileDescriptorOptions = {}
    ): FileSystemSession {
        this.assertEditable()
        const session = new FileSystemSession(
            this.files,
            budget,
            Math.max(0, Math.floor(coreHistorySize)),
            (files) => {
                if (this.active !== session) throw new Error('FileSystem session has ended')
                this.publishSessionFiles(files)
            },
            () => {
                if (this.active === session) {
                    this.active = undefined
                    this.notify()
                }
            },
            descriptors
        )
        this.active = session
        this.notify()
        return session
    }
    stop() {
        this.active?.stop()
    }
}

/**
 * The only write capability available while a Debug session owns the FileSystem. Its operations
 * follow their POSIX namesakes, report what a program can be told as `FileSystemGuestError`, and
 * journal every change they make into the current instruction's frame, so Undo restores Files,
 * descriptors and positions together.
 */
export class FileSystemSession {
    private paths = new Map<string, Node>()
    private handles = new Map<number, Handle>()
    /** The folders open for listing, by descriptor, numbered with the Files' descriptors. */
    private folderHandles = new Map<number, FolderHandle>()
    /**
     * The folders `mkdir` made, as x86's Project mount keeps them: a Project has no empty folders,
     * one exists while a File's path runs through it, so a folder made for the run lasts for the
     * run, and is a folder of the Project afterwards only if a File ends up inside it.
     */
    private madeFolders = new Set<string>()
    /** The inode numbers handed out so far: a File's goes with its node, a folder's with its path. */
    private fileInodes = new WeakMap<Node, number>()
    private folderInodes = new Map<string, number>([['', 1]])
    private nextInode = 2
    private history: Frame[] = []
    private frame?: Frame
    private retained = 0
    private stopped = false
    private firstDescriptor: number
    private maxOpen: number
    private builtPath: string | undefined
    constructor(
        files: ProjectFiles,
        private budget: number,
        private coreHistorySize: number,
        private publish: (files: ProjectFiles) => void,
        private release: () => void,
        { firstDescriptor = 3, maxOpen = Infinity }: FileDescriptorOptions = {}
    ) {
        for (const [path, file] of Object.entries(files))
            this.paths.set(path, { bytes: fileBytes(file), file })
        if (!Number.isFinite(budget) || budget < 0)
            throw new Error('Invalid FileSystem history budget')
        if (
            !Number.isSafeInteger(firstDescriptor) ||
            firstDescriptor < 0 ||
            !(maxOpen === Infinity || (Number.isSafeInteger(maxOpen) && maxOpen >= 0))
        )
            throw new Error('Invalid FileSystem descriptor options')
        this.firstDescriptor = firstDescriptor
        this.maxOpen = maxOpen
    }
    private ensureActive() {
        if (this.stopped) throw new Error('FileSystem session has ended')
    }
    /**
     * Keeps the Build output at `path`, the File a person's Build saved the program it linked in
     * ([ADR 0056](../../../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md)),
     * from that program while it runs: it reads it like any other File, where the Command line
     * says it was started from, but cannot write, truncate, rename or remove it, as Linux keeps a
     * running program's own File. False, keeping nothing, when no File has the path, or the
     * session keeps or presents one already.
     */
    protectBuildOutput(path: string): boolean {
        this.ensureActive()
        path = resolveSessionPath(path)
        const found = this.lookup(path)
        if (this.builtPath !== undefined || found.kind !== 'file') return false
        found.node.busy = true
        this.builtPath = path
        return true
    }
    /**
     * Shows the program a Build linked at `path` without saving it: a Testcase's, and a Build's
     * in a Project that cannot change. It reads it as `protectBuildOutput`'s, but it is no File of
     * the Project, so it is never published and counts toward no limit. False, placing nothing,
     * when a File or a folder of the session has the path already.
     */
    presentBuildOutput(path: string, bytes: Uint8Array): boolean {
        this.ensureActive()
        path = resolveSessionPath(path)
        if (path === '' || this.builtPath !== undefined || this.lookup(path).kind !== 'missing')
            return false
        this.paths.set(path, { bytes, busy: true, built: true })
        this.builtPath = path
        return true
    }
    /** Where the session keeps or presents the running program's own File, if it does. */
    get buildOutputPath(): string | undefined {
        return this.builtPath
    }
    /**
     * `FileSystem.annotate` while this session holds the Files: the File's record, made from its
     * bytes when the program has changed them, takes `annotations`, and the session publishes it,
     * so that every later publish keeps them. It is journaled in no instruction's frame, so no
     * instruction Undo takes it back, but an Undo of a program's write puts back the record from
     * before the write, with the Annotations it had then (decision 3). A presented program, which
     * is no File of the Project, takes none.
     */
    annotate(path: string, annotations: Annotations | undefined) {
        this.ensureActive()
        const node = this.paths.get(path)
        if (!node || node.built)
            throw new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
        const file = node.file ?? bytesFile(node.bytes)
        if (annotationsKey(file) === annotationsKey({ annotations })) return
        const next = withAnnotations(path, file, annotations)
        const records: Record<string, ProjectFile> = Object.create(null)
        for (const [other, each] of this.paths) if (each.file) records[other] = each.file
        records[path] = next
        if (storedAnnotationsSize(records) > ANNOTATIONS_BYTE_LIMIT)
            throw new ProjectFormatError(ANNOTATIONS_SAVE_MESSAGE)
        node.file = next
        this.flush()
    }
    private record(change: Inverse) {
        this.ensureActive()
        if (!this.frame) throw new Error('File operation outside an instruction transaction')
        if (this.frame.changes.length === 0) this.frame.bytes += 64
        this.frame.changes.push(change)
        this.frame.bytes += change.bytes
        if (change.filesChanged) this.frame.filesChanged = true
    }
    /**
     * Opens the journal frame for one Core step, identified the way that Core identifies the step
     * it will roll back. Several sequential callbacks of one instruction use the same id, and
     * their frames are combined so Undo restores all its effects together. A Core-only instruction
     * needs no frame: its unique id cannot match an earlier instruction that touched a File.
     */
    beginInstruction(id: FileSystemInstructionId) {
        this.ensureActive()
        if (this.frame) throw new Error('FileSystem instruction already active')
        this.frame = { id, changes: [], bytes: 0, available: true, filesChanged: false }
    }
    performInstruction<T>(id: FileSystemInstructionId, operation: () => T): T {
        this.beginInstruction(id)
        try {
            return operation()
        } finally {
            this.endInstruction()
        }
    }
    endInstruction() {
        if (!this.frame) return
        const frame = this.frame
        this.frame = undefined
        //Publish each callback's mutations together. Sequential callbacks of one instruction
        //remain separate publications, while their inverses share one Undo frame below.
        if (frame.filesChanged) this.flush()
        const previous = this.history[this.history.length - 1]
        if (previous?.id === frame.id) {
            //A later callback, including one that does nothing, still belongs to this instruction.
            //If earlier inverses were evicted, keep the whole instruction unavailable: retaining
            //only its newest effects would make a partial Undo look successful.
            if (previous.available) {
                const bytes = frame.bytes - (previous.bytes > 0 && frame.bytes > 0 ? 64 : 0)
                previous.changes.push(...frame.changes)
                previous.bytes += bytes
                previous.filesChanged ||= frame.filesChanged
                this.retained += bytes
            }
        } else {
            this.history.push(frame)
            this.retained += frame.bytes
        }
        while (this.retained > this.budget) {
            const oldest = this.history.find((candidate) => candidate.available && candidate.bytes)
            if (!oldest) break
            this.retained -= oldest.bytes
            oldest.bytes = 0
            oldest.changes = []
            oldest.available = false
        }
        while (this.history.length > this.coreHistorySize) {
            const oldest = this.history.shift()!
            this.retained -= oldest.bytes
        }
    }
    canUndo(id: FileSystemInstructionId) {
        const latest = this.history[this.history.length - 1]
        return !this.stopped && !this.frame && latest?.id === id && latest.available
    }
    /** Whether the Core step `id` can be rolled back, which is vacuously true if it recorded none. */
    canUndoAfter(id: FileSystemInstructionId) {
        const latest = this.history[this.history.length - 1]
        return !latest || latest.id !== id || this.canUndo(id)
    }
    /**
     * Preflight a Core history window whose instruction ids are increasing numeric serials.
     * Serial gaps after Undo are valid. Binary search skips unrelated frames, and only availability
     * metadata is inspected; no inverse is read or applied before the whole window is accepted.
     */
    canUndoSerialRange(oldest: bigint, newest: bigint): boolean {
        if (this.stopped || this.frame || oldest > newest) return false
        const lowerBound = (serial: bigint, inclusive: boolean) =>
            partitionPoint(this.history.length, (index) => {
                const id = BigInt(this.history[index].id)
                return id < serial || (!inclusive && id === serial)
            })
        const start = lowerBound(oldest, true)
        const end = lowerBound(newest, false)
        for (let index = start; index < end; index++)
            if (!this.history[index].available) return false
        return true
    }
    undoAfter(id: FileSystemInstructionId) {
        if (this.history[this.history.length - 1]?.id === id) this.undo(id)
    }
    /**
     * Rolls back every Core step from `oldest` on, newest first: a group taken back in one go, a
     * Step over's or a call into library code. `undoAfter` takes back only the one step it names;
     * this takes back the frames of every step whose numeric serial is `oldest` or later, which
     * `canUndoSerialRange` has found available.
     */
    undoFrom(oldest: FileSystemInstructionId) {
        const from = BigInt(oldest)
        const newest = this.history[this.history.length - 1]
        if (!newest || BigInt(newest.id) < from) return
        if (!this.canUndoSerialRange(from, BigInt(newest.id))) {
            throw new Error('FileSystem Undo history exhausted')
        }
        let changed = false
        while (
            this.history.length > 0 &&
            BigInt(this.history[this.history.length - 1].id) >= from
        ) {
            changed = this.rollBack() || changed
        }
        if (changed) this.flush()
    }
    undo(id: FileSystemInstructionId) {
        if (!this.canUndo(id)) throw new Error('FileSystem Undo history exhausted')
        if (this.rollBack()) this.flush()
    }
    /** Pops the newest frame and applies its inverses in reverse. Returns whether Files changed. */
    private rollBack(): boolean {
        const frame = this.history.pop()!
        this.retained -= frame.bytes
        for (let index = frame.changes.length - 1; index >= 0; index--) {
            frame.changes[index].restore()
        }
        return frame.changes.some((change) => change.filesChanged)
    }
    /**
     * Publishes the session's Files. Only nodes whose bytes changed are re-encoded: rebuilding
     * every File here made one guest write cost O(total Project bytes), most of it spent on Files
     * the program never touched.
     */
    private flush() {
        const files: Record<string, ProjectFile> = Object.create(null)
        for (const [path, node] of this.paths) {
            if (node.built) continue
            node.file ??= bytesFile(node.bytes)
            files[path] = node.file
        }
        this.publish(Object.freeze(files))
    }
    /**
     * Refuses, before anything changes, a `node` resized to `length` (or, with `extra`, one more
     * File of `length` bytes) that would pass the limits. Files held only by an open descriptor
     * after their path was removed still count.
     */
    private capacity(node?: Node, length = 0, extra = false) {
        if (length > FILE_BYTE_LIMIT)
            throw new FileSystemGuestError(
                FileErrorCode.TooLarge,
                `File too large (${formatMiB(FILE_BYTE_LIMIT)})`
            )
        //a presented program is no File of the Project, and never changes
        const nodes = new Set(
            [...this.paths.values(), ...Array.from(this.handles.values(), (h) => h.node)].filter(
                (target) => !target.built
            )
        )
        let bytes = extra ? length : 0
        for (const target of nodes) bytes += target === node ? length : target.bytes.length
        if (bytes > FILE_BYTE_LIMIT || nodes.size + Number(extra) > FILE_COUNT_LIMIT)
            throw new FileSystemGuestError(
                FileErrorCode.NoSpace,
                `FileSystem capacity exceeded (${formatMiB(FILE_BYTE_LIMIT)} / ${FILE_COUNT_LIMIT.toLocaleString('en-US')} Files)`
            )
    }
    /**
     * What a resolved path names. A Directory exists while some File's path runs through it, or
     * while it is, or holds, a folder `mkdir` made.
     */
    private lookup(path: string): Lookup {
        if (path === '') return { kind: 'directory' }
        const node = this.paths.get(path)
        if (node) return { kind: 'file', node }
        for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1))
            if (this.paths.has(path.slice(0, slash))) return { kind: 'below-file' }
        if (this.madeFolders.has(path) || this.holdsAnything(path)) return { kind: 'directory' }
        return { kind: 'missing' }
    }
    /** Whether a File or a made folder of the session is inside the folder at a resolved path. */
    private holdsAnything(path: string): boolean {
        const prefix = path === '' ? '' : `${path}/`
        for (const key of this.paths.keys()) if (key.startsWith(prefix)) return true
        for (const folder of this.madeFolders) if (folder.startsWith(prefix)) return true
        return false
    }
    /** The File at a resolved path, or the failure for what is there instead. */
    private fileAt(path: string): Node {
        const found = this.lookup(path)
        if (found.kind === 'file') return found.node
        throw noFile(path, found)
    }
    private handle(fd: number) {
        this.ensureActive()
        const handle = this.handles.get(fd)
        if (!handle)
            throw new FileSystemGuestError(
                FileErrorCode.BadDescriptor,
                `Invalid file descriptor: ${fd}`
            )
        return handle
    }
    private readableHandle(fd: number) {
        const handle = this.handle(fd)
        if (!handle.readable)
            throw new FileSystemGuestError(
                FileErrorCode.BadDescriptor,
                `Descriptor ${fd} is not open for reading`
            )
        return handle
    }
    private writableHandle(fd: number) {
        const handle = this.handle(fd)
        if (!handle.writable)
            throw new FileSystemGuestError(
                FileErrorCode.BadDescriptor,
                `Descriptor ${fd} is not open for writing`
            )
        return handle
    }
    /** The descriptor `open` hands out: the caller's choice, or the lowest free from the first. */
    private freeDescriptor(fd?: number): number {
        if (this.handles.size + this.folderHandles.size >= this.maxOpen)
            throw new FileSystemGuestError(
                FileErrorCode.TooManyOpen,
                `Too many open files (at most ${this.maxOpen})`
            )
        if (fd === undefined) {
            fd = this.firstDescriptor
            while (this.handles.has(fd) || this.folderHandles.has(fd)) fd++
            return fd
        }
        if (
            !Number.isSafeInteger(fd) ||
            fd < 0 ||
            this.handles.has(fd) ||
            this.folderHandles.has(fd)
        )
            throw new FileSystemGuestError(
                FileErrorCode.BadDescriptor,
                `Descriptor not available: ${fd}`
            )
        return fd
    }
    /**
     * Opens the File at `path` and returns its descriptor: `fd` when the caller picks one, or the
     * lowest free from the session's first. `mode` is a MARS shorthand or POSIX's flags. Every
     * check runs before anything changes, so a failed open leaves no File, truncation or
     * descriptor behind. A Directory cannot be opened (EISDIR).
     */
    open(path: string, mode: FileOpenMode | FileOpenFlags, fd?: number): number {
        this.ensureActive()
        const flags = typeof mode === 'string' ? OPEN_MODES[mode] : mode
        if (!FILE_ACCESSES.includes(flags?.access))
            throw new FileSystemGuestError(
                FileErrorCode.InvalidArgument,
                `Invalid open mode: ${JSON.stringify(mode)}`
            )
        const descriptor = this.freeDescriptor(fd)
        path = resolveSessionPath(path)
        const found = this.lookup(path)
        let node: Node
        if (found.kind === 'file') {
            if (flags.create && flags.exclusive)
                throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${path}`)
            if (found.node.busy && (flags.access !== 'read' || flags.truncate))
                throw busyFile(path, FileErrorCode.TextBusy)
            node = found.node
        } else {
            if (found.kind !== 'missing' || !flags.create) throw noFile(path, found)
            this.capacity(undefined, 0, true)
            node = { bytes: new Uint8Array() }
            const created = path
            this.record({
                bytes: path.length * 2,
                filesChanged: true,
                restore: () => {
                    this.paths.delete(created)
                }
            })
            this.paths.set(path, node)
        }
        if (flags.truncate) this.replaceBytes(node, new Uint8Array())
        this.record({
            bytes: 32,
            restore: () => {
                this.handles.delete(descriptor)
            }
        })
        this.handles.set(descriptor, {
            node,
            offset: 0,
            readable: flags.access !== 'write',
            writable: flags.access !== 'read',
            append: !!flags.append
        })
        return descriptor
    }
    close(fd: number) {
        const folder = this.folderHandles.get(fd)
        if (folder && !this.stopped) {
            this.record({
                bytes: 32,
                restore: () => {
                    this.folderHandles.set(fd, folder)
                }
            })
            this.folderHandles.delete(fd)
            return
        }
        const handle = this.handle(fd)
        this.record({
            //Reopening this descriptor costs the Handle itself; the Node it points at stays in
            //`paths` either way. Charging the File's length here spent the whole Undo budget on
            //open/close pairs and evicted the frames that hold real byte diffs.
            bytes: 32,
            restore: () => {
                this.handles.set(fd, handle)
            }
        })
        this.handles.delete(fd)
    }
    /** Closes every open descriptor, as EASy68K's task 50 does; Undo reopens them where they were. */
    closeAll() {
        this.ensureActive()
        if (this.handles.size === 0 && this.folderHandles.size === 0) return
        const closed = new Map(this.handles)
        const folders = new Map(this.folderHandles)
        this.record({
            bytes: 32 * (closed.size + folders.size),
            restore: () => {
                for (const [fd, handle] of closed) this.handles.set(fd, handle)
                for (const [fd, folder] of folders) this.folderHandles.set(fd, folder)
            }
        })
        this.handles.clear()
        this.folderHandles.clear()
    }
    /** Moves a descriptor's position, journaled so Undo puts it back. */
    private moveTo(handle: Handle, position: number) {
        const previous = handle.offset
        if (position === previous) return
        this.record({
            bytes: 8,
            restore: () => {
                handle.offset = previous
            }
        })
        handle.offset = position
    }
    read(fd: number, length: number): Uint8Array {
        const handle = this.readableHandle(fd)
        checkCount(length, 'read length')
        const bytes = handle.node.bytes.slice(handle.offset, handle.offset + length)
        this.moveTo(handle, handle.offset + bytes.length)
        return bytes
    }
    /** Reads up to `length` bytes from `position` without moving the descriptor's position. */
    pread(fd: number, position: number, length: number): Uint8Array {
        const handle = this.readableHandle(fd)
        checkCount(position, 'file position')
        checkCount(length, 'read length')
        return handle.node.bytes.slice(position, position + length)
    }
    write(fd: number, bytes: Uint8Array): number {
        const handle = this.writableHandle(fd)
        const start = handle.append ? handle.node.bytes.length : handle.offset
        this.writeAt(handle.node, start, bytes)
        this.moveTo(handle, start + bytes.length)
        return bytes.length
    }
    /**
     * Writes `bytes` at `position` without moving the descriptor's position. POSIX has this ignore
     * O_APPEND and so does this; Linux appends instead, which a caller wanting that gets by
     * passing the File's size.
     */
    pwrite(fd: number, position: number, bytes: Uint8Array): number {
        const handle = this.writableHandle(fd)
        checkCount(position, 'file position')
        this.writeAt(handle.node, position, bytes)
        return bytes.length
    }
    /** Writes `bytes` into `node` from `start`, filling a gap left past the end with zeros. */
    private writeAt(node: Node, start: number, bytes: Uint8Array) {
        if (bytes.length === 0) return
        const length = Math.max(node.bytes.length, start + bytes.length)
        this.capacity(node, length)
        if (start === node.bytes.length) this.appendBytes(node, bytes)
        else {
            const next = new Uint8Array(length)
            next.set(node.bytes)
            next.set(bytes, start)
            this.replaceBytes(node, next)
        }
    }
    /**
     * Moves a descriptor's position, as lseek does: from the start (0), the current position (1) or
     * the end (2). A position past the end reads as end of file until a write fills the gap with
     * zeros; a negative position is a guest error. Returns the new position.
     */
    seek(fd: number, offset: number, whence: number): number {
        const folder = this.folderHandles.get(fd)
        if (folder && !this.stopped) return this.seekFolder(folder, offset, whence)
        const handle = this.handle(fd)
        if (!Number.isSafeInteger(offset))
            throw new FileSystemGuestError(FileErrorCode.InvalidArgument, 'Invalid seek offset')
        const base =
            whence === 0
                ? 0
                : whence === 1
                  ? handle.offset
                  : whence === 2
                    ? handle.node.bytes.length
                    : undefined
        if (base === undefined)
            throw new FileSystemGuestError(
                FileErrorCode.InvalidArgument,
                `Invalid seek origin: ${whence}`
            )
        const position = base + offset
        if (position < 0 || position > FILE_BYTE_LIMIT)
            throw new FileSystemGuestError(FileErrorCode.InvalidArgument, 'Invalid seek position')
        this.moveTo(handle, position)
        return position
    }
    /** Sets the File at `path` to `length` bytes, cutting its end or extending it with zeros. */
    truncate(path: string, length: number) {
        this.ensureActive()
        checkCount(length, 'file length')
        path = resolveSessionPath(path)
        const node = this.fileAt(path)
        if (node.busy) throw busyFile(path, FileErrorCode.TextBusy)
        this.resize(node, length)
    }
    /**
     * `truncate` through a descriptor, which reaches its File even after the path was removed. The
     * descriptor must be open for writing (EINVAL otherwise, as on Linux). No position moves.
     */
    ftruncate(fd: number, length: number) {
        const handle = this.handle(fd)
        checkCount(length, 'file length')
        if (!handle.writable)
            throw new FileSystemGuestError(
                FileErrorCode.InvalidArgument,
                `Descriptor ${fd} is not open for writing`
            )
        this.resize(handle.node, length)
    }
    private resize(node: Node, length: number) {
        const oldLength = node.bytes.length
        if (length === oldLength) return
        this.capacity(node, length)
        if (length < oldLength) {
            this.replaceBytes(node, node.bytes.slice(0, length))
            return
        }
        const grown = new Uint8Array(length)
        grown.set(node.bytes)
        this.replaceBytes(node, grown)
    }
    /** What is at `path` ('' or '/' for the Project root), or `undefined` when nothing is. */
    stat(path: string): FileStat | undefined {
        this.ensureActive()
        const found = this.lookup(resolveSessionPath(path))
        if (found.kind === 'file') return { kind: 'file', size: found.node.bytes.length }
        if (found.kind === 'directory') return { kind: 'directory', size: 0 }
        return undefined
    }
    /**
     * The whole of the File at `path` as it is now, or undefined when there is none: the Audio
     * Peripheral's Sound Files, read in one go. It changes nothing, so it journals nothing.
     *
     * The File's own bytes, not a copy, which a caller must never change and must copy to keep: an
     * append after an Undo can reuse their buffer. Every write gives the File a new array, so the
     * same array read again is the same content, which spares EASy68K's retry-while-busy loop a copy
     * of the whole Sound on every try.
     */
    readWhole(path: string): Uint8Array | undefined {
        this.ensureActive()
        let resolved: string
        try {
            resolved = resolveSessionPath(path)
        } catch {
            return undefined
        }
        const found = this.lookup(resolved)
        return found.kind === 'file' ? found.node.bytes : undefined
    }
    /** `stat` through a descriptor, which reaches its File even after the path was removed. */
    fstat(fd: number): FileStat {
        return { kind: 'file', size: this.handle(fd).node.bytes.length }
    }
    /**
     * The immediate children of the Directory at `path` ('' or '/' for the Project root), in name
     * order, for getdents, the folders `mkdir` made included. Neither `.` nor `..` is listed.
     */
    list(path: string): DirectoryEntry[] {
        this.ensureActive()
        path = resolveSessionPath(path)
        const found = this.lookup(path)
        if (found.kind === 'missing')
            throw new FileSystemGuestError(
                FileErrorCode.NotFound,
                `No such File or Directory: ${path}`
            )
        if (found.kind !== 'directory')
            throw new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${path}`)
        return this.children(path)
    }
    /** The immediate children of the folder at a resolved path, in name order. */
    private children(path: string): DirectoryEntry[] {
        const prefix = path === '' ? '' : `${path}/`
        const children = new Map<string, FileKind>()
        const add = (key: string, leaf: FileKind) => {
            if (!key.startsWith(prefix)) return
            const rest = key.slice(prefix.length)
            const slash = rest.indexOf('/')
            if (slash === -1) children.set(rest, leaf)
            else children.set(rest.slice(0, slash), 'directory')
        }
        for (const key of this.paths.keys()) add(key, 'file')
        for (const folder of this.madeFolders) add(folder, 'directory')
        return Array.from(children, ([name, kind]) => ({ name, kind })).sort((a, b) =>
            a.name < b.name ? -1 : 1
        )
    }
    /** A File's inode number, made up the first time it is asked for and kept with its node. */
    private fileInode(node: Node): number {
        let inode = this.fileInodes.get(node)
        if (inode === undefined) this.fileInodes.set(node, (inode = this.nextInode++))
        return inode
    }
    /** A folder's inode number, kept with its path: the Project root's is 1. */
    private folderInode(path: string): number {
        let inode = this.folderInodes.get(path)
        if (inode === undefined) this.folderInodes.set(path, (inode = this.nextInode++))
        return inode
    }
    /**
     * The folder call `stat`: what is at `path`, with its inode number and link count, read as
     * Linux reads a path (`resolveCallPath`). ENOENT when nothing is there, ENOTDIR when the path
     * runs through a File, or names one with a trailing slash. Both a File and a folder have one
     * link, as x86's Project mount reports them.
     */
    inspect(path: string): FileDetails {
        this.ensureActive()
        const call = resolveCallPath(path)
        const found = this.lookup(call.path)
        if (found.kind === 'file') {
            if (call.directory)
                throw new FileSystemGuestError(
                    FileErrorCode.NotDirectory,
                    `Not a Directory: ${path}`
                )
            return {
                kind: 'file',
                size: found.node.bytes.length,
                inode: this.fileInode(found.node),
                links: 1
            }
        }
        if (found.kind === 'directory')
            return { kind: 'directory', size: 0, inode: this.folderInode(call.path), links: 1 }
        throw noFile(call.path, found)
    }
    /** Whether `path`, read as a folder call reads it, names a folder; false for any failure. */
    isDirectory(path: string): boolean {
        this.ensureActive()
        try {
            return this.lookup(resolveCallPath(path).path).kind === 'directory'
        } catch (error) {
            if (error instanceof FileSystemGuestError) return false
            throw error
        }
    }
    /**
     * Makes a folder, as `mkdir` does: it lasts for the session, and stays in the Project only if
     * a File ends up inside it. The folder that holds it must exist (ENOENT), as a folder and not a
     * File (ENOTDIR); a path that names anything already, the Project root included, is EEXIST.
     */
    mkdir(path: string) {
        this.ensureActive()
        const resolved = resolveCallPath(path).path
        const found = this.lookup(resolved)
        if (found.kind === 'file' || found.kind === 'directory')
            throw new FileSystemGuestError(FileErrorCode.Exists, `File exists: ${resolved || '/'}`)
        if (found.kind === 'below-file') throw noFile(resolved, found)
        const parent = parentOf(resolved)
        const above = this.lookup(parent)
        if (above.kind === 'missing')
            throw new FileSystemGuestError(
                FileErrorCode.NotFound,
                `No such File or Directory: ${parent}`
            )
        if (above.kind !== 'directory')
            throw new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${parent}`)
        if (this.madeFolders.size >= FILE_COUNT_LIMIT)
            throw new FileSystemGuestError(
                FileErrorCode.NoSpace,
                `FileSystem capacity exceeded (${FILE_COUNT_LIMIT.toLocaleString('en-US')} folders)`
            )
        this.record({
            bytes: resolved.length * 2 + 16,
            restore: () => {
                this.madeFolders.delete(resolved)
            }
        })
        this.madeFolders.add(resolved)
    }
    /**
     * Removes an empty folder, as `rmdir` does: one holding a File or a folder is ENOTEMPTY, so in
     * practice only a folder `mkdir` made, once it is empty again. A File is ENOTDIR, nothing at
     * the path ENOENT, and the Project root EBUSY.
     */
    rmdir(path: string) {
        this.ensureActive()
        const resolved = resolveCallPath(path).path
        if (resolved === '')
            throw new FileSystemGuestError(FileErrorCode.Busy, 'Device or resource busy: /')
        const found = this.lookup(resolved)
        if (found.kind === 'file')
            throw new FileSystemGuestError(
                FileErrorCode.NotDirectory,
                `Not a Directory: ${resolved}`
            )
        if (found.kind !== 'directory') throw noFile(resolved, found)
        if (this.holdsAnything(resolved))
            throw new FileSystemGuestError(
                FileErrorCode.NotEmpty,
                `Directory not empty: ${resolved}`
            )
        this.record({
            bytes: resolved.length * 2 + 16,
            restore: () => {
                this.madeFolders.add(resolved)
            }
        })
        this.madeFolders.delete(resolved)
    }
    /**
     * The folder call `unlink`: `remove` for a path read as Linux reads one. A folder is EISDIR,
     * and a File named with a trailing slash ENOTDIR.
     */
    unlink(path: string) {
        this.ensureActive()
        const call = resolveCallPath(path)
        if (call.directory && this.lookup(call.path).kind === 'file')
            throw new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${path}`)
        this.remove(call.path)
    }
    /**
     * The folder call `rename`: `rename` for paths read as Linux reads them, where the folder the
     * File moves into must exist already (ENOENT, or ENOTDIR for a File), as it must on x86 and on
     * Linux. A File already at `to` is replaced, as rename(2) replaces it (the owner's decision of
     * 2026-11-03). A folder cannot move (EISDIR), as on x86's Project mount, though naming one
     * onto itself does nothing, as it does there and on Linux; naming one onto a File is ENOTDIR,
     * as Linux and x86's mount have it.
     */
    move(from: string, to: string) {
        this.ensureActive()
        const source = resolveCallPath(from)
        const target = resolveCallPath(to)
        const found = this.lookup(source.path)
        if (found.kind === 'directory' && source.path !== '' && source.path === target.path) return
        if (found.kind === 'directory' && this.lookup(target.path).kind === 'file')
            throw new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${to}`)
        if (found.kind !== 'file') throw noFile(source.path, found)
        if (source.directory || target.directory)
            throw new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${from}`)
        if (source.path !== target.path) {
            const parent = parentOf(target.path)
            const above = this.lookup(parent)
            if (above.kind === 'missing')
                throw new FileSystemGuestError(
                    FileErrorCode.NotFound,
                    `No such File or Directory: ${parent}`
                )
            if (above.kind !== 'directory')
                throw new FileSystemGuestError(
                    FileErrorCode.NotDirectory,
                    `Not a Directory: ${parent}`
                )
        }
        this.rename(source.path, target.path)
    }
    /**
     * Opens the folder at `path` for listing and returns its descriptor, numbered as `open`
     * numbers them: what a folder call's Open for reading gives, which `readDirectory` reads. The
     * folder's entries are taken as it is opened, `.` and `..` first, as getdents lists them.
     */
    openDirectory(path: string, fd?: number): number {
        this.ensureActive()
        const resolved = resolveCallPath(path).path
        const found = this.lookup(resolved)
        if (found.kind === 'file')
            throw new FileSystemGuestError(
                FileErrorCode.NotDirectory,
                `Not a Directory: ${resolved}`
            )
        if (found.kind !== 'directory') throw noFile(resolved, found)
        const descriptor = this.freeDescriptor(fd)
        const prefix = resolved === '' ? '' : `${resolved}/`
        const entries = [
            { name: '.', kind: 'directory' as const, inode: this.folderInode(resolved) },
            { name: '..', kind: 'directory' as const, inode: this.folderInode(parentOf(resolved)) },
            ...this.children(resolved).map(({ name, kind }) => ({
                name,
                kind,
                inode:
                    kind === 'file'
                        ? this.fileInode(this.paths.get(prefix + name)!)
                        : this.folderInode(prefix + name)
            }))
        ]
        this.record({
            bytes: 32 + entries.reduce((sum, entry) => sum + entry.name.length * 2 + 16, 0),
            restore: () => {
                this.folderHandles.delete(descriptor)
            }
        })
        this.folderHandles.set(descriptor, { path: resolved, entries, offset: 0 })
        return descriptor
    }
    /**
     * Reads the entries of the folder open on `fd` from where the last read stopped, for getdents:
     * each in turn while `fits` accepts it, the position moving past those it took, journaled so
     * Undo puts it back. An empty answer is the end of the folder unless `fits` refused the first.
     * A descriptor of a File is ENOTDIR, one not open EBADF.
     */
    readDirectory(fd: number, fits: (record: DirectoryRecord) => boolean): DirectoryRecord[] {
        this.ensureActive()
        const folder = this.folderHandles.get(fd)
        if (!folder) {
            if (this.handles.has(fd))
                throw new FileSystemGuestError(
                    FileErrorCode.NotDirectory,
                    `Descriptor ${fd} is not a folder`
                )
            throw new FileSystemGuestError(
                FileErrorCode.BadDescriptor,
                `Invalid file descriptor: ${fd}`
            )
        }
        const records: DirectoryRecord[] = []
        let position = folder.offset
        while (position < folder.entries.length) {
            const record = { ...folder.entries[position], next: position + 1 }
            if (!fits(record)) break
            records.push(record)
            position++
        }
        this.moveFolderTo(folder, position)
        return records
    }
    /** lseek on a folder: positions count entries, as the offsets getdents reports do. */
    private seekFolder(folder: FolderHandle, offset: number, whence: number): number {
        const base = whence === 0 ? 0 : whence === 1 ? folder.offset : undefined
        if (base === undefined || !Number.isSafeInteger(offset) || base + offset < 0)
            throw new FileSystemGuestError(
                FileErrorCode.InvalidArgument,
                'Invalid seek on a folder'
            )
        this.moveFolderTo(folder, base + offset)
        return base + offset
    }
    private moveFolderTo(folder: FolderHandle, position: number) {
        const previous = folder.offset
        if (position === previous) return
        this.record({
            bytes: 8,
            restore: () => {
                folder.offset = previous
            }
        })
        folder.offset = position
    }
    /**
     * Appending is what a program writing a log or an output File does, so the node's buffer grows
     * geometrically and the inverse is "shrink back to the old length". Rebuilding the whole File
     * and rescanning it for a common prefix on every write made a run that appends N times cost
     * O(N²): 20,000 64-byte appends took 36 seconds.
     */
    private appendBytes(node: Node, bytes: Uint8Array): void {
        const oldLength = node.bytes.length
        const oldFile = node.file
        this.record({
            bytes: 16,
            filesChanged: true,
            restore: () => {
                node.bytes = node.bytes.subarray(0, oldLength)
                node.file = oldFile
            }
        })
        const required = oldLength + bytes.length
        const spare = node.bytes.buffer.byteLength - node.bytes.byteOffset
        if (required > spare) {
            const grown = new Uint8Array(Math.max(required, spare * 2, 64))
            grown.set(node.bytes)
            node.bytes = grown.subarray(0, oldLength)
        }
        const store = new Uint8Array(node.bytes.buffer, node.bytes.byteOffset)
        store.set(bytes, oldLength)
        node.bytes = store.subarray(0, required)
        //Extend the cached representation instead of dropping it. Valid UTF-8 appended to valid
        //UTF-8 is valid UTF-8 and re-encodes to exactly these bytes, so the next publish costs the
        //appended text rather than a fresh decode of the whole File.
        const previous = node.file
        const appended = previous?.encoding === 'plain' ? decodeStandalone(bytes) : null
        node.file =
            previous && appended !== null
                ? Object.freeze({ encoding: 'plain', content: previous.content + appended })
                : undefined
    }
    private replaceBytes(node: Node, bytes: Uint8Array): boolean {
        const oldLength = node.bytes.length
        let start = 0
        while (start < Math.min(oldLength, bytes.length) && node.bytes[start] === bytes[start])
            start++
        let end = Math.min(oldLength, bytes.length)
        if (oldLength === bytes.length)
            while (end > start && node.bytes[end - 1] === bytes[end - 1]) end--
        else end = oldLength
        if (oldLength === bytes.length && start === end) return false
        const before = node.bytes.slice(start, end)
        const oldFile = node.file
        this.record({
            bytes: before.length + 16,
            filesChanged: true,
            restore: () => {
                const restored = new Uint8Array(oldLength)
                restored.set(node.bytes.subarray(0, oldLength))
                restored.set(before, start)
                node.bytes = restored
                node.file = oldFile
            }
        })
        node.bytes = bytes
        node.file = undefined
        return true
    }
    /**
     * Moves a File to `to`, as rename(2) does: a File already there is replaced in the same
     * operation, which Undo takes back whole, putting both Files where they were. A descriptor open
     * on the replaced File keeps it, as one open on a removed File does: it reads and writes the
     * bytes it had, which no path names any more. Renaming a File onto itself does nothing. Only
     * Files move: a Directory at either path is EISDIR. The Build output can be neither moved nor
     * replaced (EBUSY), unlike Linux, which keeps the running program's File only from writes.
     */
    rename(from: string, to: string) {
        this.ensureActive()
        from = resolveSessionPath(from)
        to = resolveSessionPath(to)
        const node = this.fileAt(from)
        if (from === to) return
        if (node.busy) throw busyFile(from, FileErrorCode.Busy)
        const target = this.lookup(to)
        if (target.kind === 'file' && target.node.busy) throw busyFile(to, FileErrorCode.Busy)
        if (target.kind !== 'file' && target.kind !== 'missing') throw noFile(to, target)
        const replaced = target.kind === 'file' ? target.node : undefined
        this.record({
            //the replaced File is held for Undo as a removed one is
            bytes: (from.length + to.length) * 2 + (replaced?.bytes.length ?? 0),
            filesChanged: true,
            restore: () => {
                if (replaced) this.paths.set(to, replaced)
                else this.paths.delete(to)
                this.paths.set(from, node)
            }
        })
        this.paths.delete(from)
        this.paths.set(to, node)
    }
    remove(path: string) {
        this.ensureActive()
        path = resolveSessionPath(path)
        const node = this.fileAt(path)
        if (node.busy) throw busyFile(path, FileErrorCode.Busy)
        this.record({
            bytes: node.bytes.length + path.length * 2,
            filesChanged: true,
            restore: () => {
                this.paths.set(path, node)
            }
        })
        this.paths.delete(path)
    }
    stop() {
        this.stopped = true
        this.handles.clear()
        this.folderHandles.clear()
        this.madeFolders.clear()
        this.paths.clear()
        this.history = []
        this.frame = undefined
        this.retained = 0
        this.release()
    }
}
