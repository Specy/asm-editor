import {
    bytesFile,
    cleanFiles,
    fileBytes,
    fileText,
    isValidFilePath,
    ProjectFormatError,
    resolveFilePath,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    type BuildSources,
    type ProjectFile,
    type ProjectFiles
} from '$lib/projectFiles'

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

/** `file` caches this node's storage representation, dropped whenever `bytes` changes. */
type Node = { bytes: Uint8Array; file?: ProjectFile }
type Handle = { node: Node; offset: number; readable: boolean; writable: boolean; append: boolean }
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
export type FileStore = { read: () => ProjectFiles; write: (files: ProjectFiles) => void }

/**
 * Why a file operation failed, named after the errno a POSIX system reports for the same failure,
 * so an adapter answers in its Target's convention (MARS's -1, EASy68K's D0 result, Linux's
 * negative errno) without reading the message.
 */
export enum FileErrorCode {
    /** No File at the path, for an operation that does not create one. */
    NotFound = 'ENOENT',
    /** An exclusive create, or a rename onto a File, found one already there. */
    Exists = 'EEXIST',
    /** A descriptor that is not open, or not open for the read or write asked of it. */
    BadDescriptor = 'EBADF',
    /** A File operation on a Directory, the Project root included. */
    IsDirectory = 'EISDIR',
    /** A path that runs through a File as if it were a Directory, or a listing of a File. */
    NotDirectory = 'ENOTDIR',
    /** The session's limit on open descriptors is reached. */
    TooManyOpen = 'EMFILE',
    /** The Project's 16 MiB or 4,096-File limit would be passed. */
    NoSpace = 'ENOSPC',
    /** One File would grow past 16 MiB. */
    TooLarge = 'EFBIG',
    /** A malformed path, count, position, seek origin or open mode. */
    InvalidArgument = 'EINVAL',
    /** A path that climbs out of the Project root. */
    AccessDenied = 'EACCES'
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

/** The failure for a path that names no File, after what it names instead. */
function noFile(path: string, found: Exclude<Lookup, { kind: 'file' }>) {
    if (found.kind === 'directory')
        return new FileSystemGuestError(FileErrorCode.IsDirectory, `Is a Directory: ${path || '/'}`)
    if (found.kind === 'below-file')
        return new FileSystemGuestError(FileErrorCode.NotDirectory, `Not a Directory: ${path}`)
    return new FileSystemGuestError(FileErrorCode.NotFound, `File not found: ${path}`)
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
    writeBytes(path: string, bytes: Uint8Array, replace = true) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!replace && hasOwn(this.files, path))
            throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${path}`)
        this.commit({ ...this.files, [path]: bytesFile(bytes) })
    }
    writeText(path: string, text: string, replace = true) {
        const file = { encoding: 'plain' as const, content: text }
        this.writeBytes(path, fileBytes(file), replace)
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
    private commit(files: ProjectFiles) {
        this.store.write(cleanFiles(files))
        this.notify(true)
    }
    /**
     * The Debug session's own publish. It validated each path through `resolveFilePath`'s rules,
     * refused File/directory collisions as it applied them and enforced the size and count limits
     * through `capacity`, and every File it publishes came from `bytesFile`, so re-running
     * `cleanFiles` here would decode and re-encode the whole Project on every Core step that
     * touches a File.
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
    private history: Frame[] = []
    private frame?: Frame
    private retained = 0
    private stopped = false
    private firstDescriptor: number
    private maxOpen: number
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
        const lowerBound = (serial: bigint, inclusive: boolean) => {
            let low = 0
            let high = this.history.length
            while (low < high) {
                const middle = Math.floor((low + high) / 2)
                const id = BigInt(this.history[middle].id)
                if (id < serial || (!inclusive && id === serial)) low = middle + 1
                else high = middle
            }
            return low
        }
        const start = lowerBound(oldest, true)
        const end = lowerBound(newest, false)
        for (let index = start; index < end; index++)
            if (!this.history[index].available) return false
        return true
    }
    undoAfter(id: FileSystemInstructionId) {
        if (this.history[this.history.length - 1]?.id === id) this.undo(id)
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
            throw new FileSystemGuestError(FileErrorCode.TooLarge, 'File too large (16 MiB)')
        const nodes = new Set([
            ...this.paths.values(),
            ...Array.from(this.handles.values(), (h) => h.node)
        ])
        let bytes = extra ? length : 0
        for (const target of nodes) bytes += target === node ? length : target.bytes.length
        if (bytes > FILE_BYTE_LIMIT || nodes.size + Number(extra) > FILE_COUNT_LIMIT)
            throw new FileSystemGuestError(
                FileErrorCode.NoSpace,
                'FileSystem capacity exceeded (16 MiB / 4,096 Files)'
            )
    }
    /** What a resolved path names. A Directory exists while some File's path runs through it. */
    private lookup(path: string): Lookup {
        if (path === '') return { kind: 'directory' }
        const node = this.paths.get(path)
        if (node) return { kind: 'file', node }
        for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1))
            if (this.paths.has(path.slice(0, slash))) return { kind: 'below-file' }
        const prefix = `${path}/`
        for (const key of this.paths.keys())
            if (key.startsWith(prefix)) return { kind: 'directory' }
        return { kind: 'missing' }
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
        if (this.handles.size >= this.maxOpen)
            throw new FileSystemGuestError(
                FileErrorCode.TooManyOpen,
                `Too many open files (at most ${this.maxOpen})`
            )
        if (fd === undefined) {
            fd = this.firstDescriptor
            while (this.handles.has(fd)) fd++
            return fd
        }
        if (!Number.isSafeInteger(fd) || fd < 0 || this.handles.has(fd))
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
        if (this.handles.size === 0) return
        const closed = new Map(this.handles)
        this.record({
            bytes: 32 * closed.size,
            restore: () => {
                for (const [fd, handle] of closed) this.handles.set(fd, handle)
            }
        })
        this.handles.clear()
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
        this.resize(this.fileAt(resolveSessionPath(path)), length)
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
    /** `stat` through a descriptor, which reaches its File even after the path was removed. */
    fstat(fd: number): FileStat {
        return { kind: 'file', size: this.handle(fd).node.bytes.length }
    }
    /**
     * The immediate children of the Directory at `path` ('' or '/' for the Project root), in name
     * order, for getdents. Neither `.` nor `..` is listed.
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
        const prefix = path === '' ? '' : `${path}/`
        const children = new Map<string, FileKind>()
        for (const key of this.paths.keys()) {
            if (!key.startsWith(prefix)) continue
            const rest = key.slice(prefix.length)
            const slash = rest.indexOf('/')
            if (slash === -1) children.set(rest, 'file')
            else children.set(rest.slice(0, slash), 'directory')
        }
        return Array.from(children, ([name, kind]) => ({ name, kind })).sort((a, b) =>
            a.name < b.name ? -1 : 1
        )
    }
    /**
     * Appending is what a program writing a log or an output File does, so the node's buffer grows
     * geometrically and the inverse is "shrink back to the old length". Rebuilding the whole File
     * and rescanning it for a common prefix on every write made a run that appends N times cost
     * O(N²): 20,000 64-byte appends took 36 seconds.
     */
    private appendBytes(node: Node, bytes: Uint8Array): void {
        const oldLength = node.bytes.length
        this.record({
            bytes: 16,
            filesChanged: true,
            restore: () => {
                node.bytes = node.bytes.subarray(0, oldLength)
                node.file = undefined
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
        this.record({
            bytes: before.length + 16,
            filesChanged: true,
            restore: () => {
                const restored = new Uint8Array(oldLength)
                restored.set(node.bytes.subarray(0, oldLength))
                restored.set(before, start)
                node.bytes = restored
                node.file = undefined
            }
        })
        node.bytes = bytes
        node.file = undefined
        return true
    }
    /**
     * Moves a File to a path that names nothing. Unlike POSIX it refuses to replace a File there
     * (EEXIST), and it moves Files only: a Directory is EISDIR.
     */
    rename(from: string, to: string) {
        this.ensureActive()
        from = resolveSessionPath(from)
        to = resolveSessionPath(to)
        const node = this.fileAt(from)
        if (from === to) return
        const target = this.lookup(to)
        if (target.kind === 'file')
            throw new FileSystemGuestError(FileErrorCode.Exists, `File already exists: ${to}`)
        if (target.kind !== 'missing') throw noFile(to, target)
        this.record({
            bytes: (from.length + to.length) * 2,
            filesChanged: true,
            restore: () => {
                this.paths.delete(to)
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
        this.paths.clear()
        this.history = []
        this.frame = undefined
        this.retained = 0
        this.release()
    }
}
