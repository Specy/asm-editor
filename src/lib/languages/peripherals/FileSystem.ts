import {
    bytesFile,
    cleanFiles,
    fileBytes,
    fileText,
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
type Frame = {
    position: number
    changes: Inverse[]
    bytes: number
    available: boolean
    filesChanged: boolean
}
export type FileStore = { read: () => ProjectFiles; write: (files: ProjectFiles) => void }

/**
 * A failure the running program can be told about: a path that is not there, a descriptor it never
 * opened, a File it opened read-only. An architecture whose syscalls report failure through a
 * return value answers these with its own error value instead of ending the run. Everything else
 * the FileSystem throws — capacity, a session that has ended, a misused transaction — is an
 * environment failure the program cannot act on, and stays an exception.
 */
export class FileSystemGuestError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'FileSystemGuestError'
    }
}

/**
 * The value an architecture whose file syscalls report failure through a return value hands back.
 * Anything that is not a guest-observable failure is rethrown, so a capacity breach or a session
 * that has ended still ends the run instead of being mistaken for an ordinary error code.
 */
export function guestFileFailure(error: unknown): number {
    if (error instanceof FileSystemGuestError || error instanceof ProjectFormatError) return -1
    throw error
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
        if (!file) throw new FileSystemGuestError(`File not found: ${path}`)
        return fileBytes(file)
    }
    readText(path: string) {
        const file = this.files[resolveFilePath(path)]
        if (!file) throw new FileSystemGuestError(`File not found: ${path}`)
        return fileText(file)
    }
    snapshot(entry: string): BuildSources {
        return Object.freeze({ files: cleanFiles(this.files), entry })
    }
    replace(files: ProjectFiles) {
        this.assertEditable()
        this.commit(files)
    }
    writeBytes(path: string, bytes: Uint8Array, replace = true) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!replace && hasOwn(this.files, path))
            throw new FileSystemGuestError(`File already exists: ${path}`)
        this.commit({ ...this.files, [path]: bytesFile(bytes) })
    }
    writeText(path: string, text: string, replace = true) {
        const file = { encoding: 'plain' as const, content: text }
        this.writeBytes(path, fileBytes(file), replace)
    }
    remove(path: string) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!hasOwn(this.files, path)) throw new FileSystemGuestError(`File not found: ${path}`)
        const files = { ...this.files }
        delete files[path]
        this.commit(files)
    }
    rename(from: string, to: string) {
        this.assertEditable()
        from = resolveFilePath(from)
        to = resolveFilePath(to)
        if (from === to) return
        if (!hasOwn(this.files, from)) throw new FileSystemGuestError(`File not found: ${from}`)
        if (hasOwn(this.files, to)) throw new FileSystemGuestError(`File already exists: ${to}`)
        const files = { ...this.files, [to]: this.files[from] }
        delete files[from]
        this.commit(files)
    }
    private commit(files: ProjectFiles) {
        this.store.write(cleanFiles(files))
        this.notify(true)
    }
    /**
     * The Debug session's own publish. It validated each path through `resolveFilePath`, refused
     * File/directory collisions as it applied them and enforced the size and count limits through
     * `capacity`, and every File it publishes came from `bytesFile`, so re-running `cleanFiles`
     * here would decode and re-encode the whole Project on every Core step that touches a File.
     */
    private publishSessionFiles(files: ProjectFiles) {
        this.store.write(files)
        this.notify(true)
    }
    beginSession(budget = 64 * 1024 * 1024, coreHistorySize = 100): FileSystemSession {
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
            }
        )
        this.active = session
        this.notify()
        return session
    }
    stop() {
        this.active?.stop()
    }
}

/** The only write capability available while a Debug session owns the FileSystem. */
export class FileSystemSession {
    private paths = new Map<string, Node>()
    private handles = new Map<number, Handle>()
    private history: Frame[] = []
    private frame?: Frame
    private retained = 0
    private stopped = false
    constructor(
        files: ProjectFiles,
        private budget: number,
        private coreHistorySize: number,
        private publish: (files: ProjectFiles) => void,
        private release: () => void
    ) {
        for (const [path, file] of Object.entries(files))
            this.paths.set(path, { bytes: fileBytes(file), file })
        if (!Number.isFinite(budget) || budget < 0)
            throw new Error('Invalid FileSystem history budget')
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
     * Opens the journal frame for one Core step. `position` says where that step sits in execution
     * order, the same contract `ScreenInstructionHistory` uses: it only has to grow as the program
     * runs, and Undo rolls back everything recorded past a position rather than matching one frame
     * by name. A position that moves backwards means the caller passed something that is not an
     * execution position at all (a program counter, say), which would silently pair a frame with
     * the wrong step, so it is refused here rather than corrupting Files later. Equal positions are
     * allowed: a Core step that records no history of its own leaves the position where it was.
     */
    beginInstruction(position: number) {
        this.ensureActive()
        if (this.frame) throw new Error('FileSystem instruction already active')
        const latest = this.history[this.history.length - 1]
        if (latest && position < latest.position) {
            throw new Error('FileSystem instruction positions must not move backwards')
        }
        this.frame = { position, changes: [], bytes: 0, available: true, filesChanged: false }
    }
    performInstruction<T>(position: number, operation: () => T): T {
        this.beginInstruction(position)
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
        //One publish per Core step rather than one per operation: an instruction that opens a File
        //and writes it is a single change as far as the editor and autosave are concerned.
        if (frame.filesChanged) this.flush()
        this.history.push(frame)
        this.retained += frame.bytes
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
    canUndo(position: number) {
        const latest = this.history[this.history.length - 1]
        return !this.stopped && !this.frame && latest?.position === position && latest.available
    }
    /** The frames a rewind to `position` has to roll back, oldest first. */
    private framesAfter(position: number): Frame[] {
        let index = this.history.length
        while (index > 0 && this.history[index - 1].position > position) index--
        return this.history.slice(index)
    }
    /** Whether rewinding execution to `position` can restore every File operation recorded after it. */
    canUndoAfter(position: number) {
        const frames = this.framesAfter(position)
        if (frames.length === 0) return true
        return !this.stopped && !this.frame && frames.every((frame) => frame.available)
    }
    undoAfter(position: number) {
        const frames = this.framesAfter(position)
        if (frames.length === 0) return
        //Checked in full before anything is restored: a partial rollback would leave the Files
        //describing a point in execution the Core has already left.
        if (!this.canUndoAfter(position)) throw new Error('FileSystem Undo history exhausted')
        let changed = false
        for (let index = 0; index < frames.length; index++) changed = this.rollBack() || changed
        if (changed) this.flush()
    }
    undo(position: number) {
        if (!this.canUndo(position)) throw new Error('FileSystem Undo history exhausted')
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
    private capacity(node?: Node, length = 0, extra = false) {
        const nodes = new Set([
            ...this.paths.values(),
            ...Array.from(this.handles.values(), (h) => h.node)
        ])
        let bytes = extra ? length : 0
        for (const target of nodes) bytes += target === node ? length : target.bytes.length
        if (bytes > FILE_BYTE_LIMIT || nodes.size + Number(extra) > FILE_COUNT_LIMIT)
            throw new Error('FileSystem capacity exceeded (16 MiB / 4,096 Files)')
    }
    private handle(fd: number) {
        this.ensureActive()
        const handle = this.handles.get(fd)
        if (!handle) throw new FileSystemGuestError(`Invalid file descriptor: ${fd}`)
        return handle
    }
    open(path: string, mode: 'read' | 'write' | 'append', fd?: number): number {
        this.ensureActive()
        path = resolveFilePath(path)
        if (fd === undefined) {
            fd = 3
            while (this.handles.has(fd)) fd++
        }
        if (this.handles.has(fd)) throw new FileSystemGuestError(`Descriptor already open: ${fd}`)
        let node = this.paths.get(path)
        if (!node) {
            if (mode === 'read') throw new FileSystemGuestError(`File not found: ${path}`)
            cleanFiles({
                ...Object.fromEntries(
                    Array.from(this.paths.keys(), (key) => [
                        key,
                        { encoding: 'plain', content: '' }
                    ])
                ),
                [path]: { encoding: 'plain', content: '' }
            })
            this.capacity(undefined, 0, true)
            node = { bytes: new Uint8Array() }
            this.record({
                bytes: path.length * 2,
                filesChanged: true,
                restore: () => {
                    this.paths.delete(path)
                }
            })
            this.paths.set(path, node)
        }
        if (mode === 'write') this.replaceBytes(node, new Uint8Array())
        const descriptor = fd
        this.record({
            bytes: 32,
            restore: () => {
                this.handles.delete(descriptor)
            }
        })
        this.handles.set(fd, {
            node,
            offset: 0,
            readable: mode === 'read',
            writable: mode !== 'read',
            append: mode === 'append'
        })
        return fd
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
    read(fd: number, length: number): Uint8Array {
        const handle = this.handle(fd)
        if (!handle.readable || !Number.isSafeInteger(length) || length < 0)
            throw new FileSystemGuestError('Invalid file read')
        const offset = handle.offset
        const bytes = handle.node.bytes.slice(offset, offset + length)
        handle.offset += bytes.length
        if (handle.offset !== offset)
            this.record({
                bytes: 8,
                restore: () => {
                    handle.offset = offset
                }
            })
        return bytes
    }
    write(fd: number, bytes: Uint8Array): number {
        const handle = this.handle(fd)
        if (!handle.writable) throw new FileSystemGuestError('File not writable')
        const offset = handle.offset
        const start = handle.append ? handle.node.bytes.length : offset
        const length = Math.max(handle.node.bytes.length, start + bytes.length)
        this.capacity(handle.node, length)
        if (bytes.length > 0) {
            if (start === handle.node.bytes.length) this.appendBytes(handle.node, bytes)
            else {
                const next = new Uint8Array(length)
                next.set(handle.node.bytes)
                next.set(bytes, start)
                this.replaceBytes(handle.node, next)
            }
        }
        handle.offset = start + bytes.length
        if (handle.offset !== offset)
            this.record({
                bytes: 8,
                restore: () => {
                    handle.offset = offset
                }
            })
        return bytes.length
    }
    /**
     * Appending is what a program writing a log or an output File does, so the node's buffer grows
     * geometrically and the inverse is "shrink back to the old length". Rebuilding the whole File
     * and rescanning it for a common prefix on every write made a run that appends N times cost
     * O(N²): 20,000 64-byte appends took 36 seconds.
     */
    private appendBytes(node: Node, bytes: Uint8Array): void {
        const oldLength = node.bytes.length
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
        this.record({
            bytes: 16,
            filesChanged: true,
            restore: () => {
                node.bytes = node.bytes.subarray(0, oldLength)
                node.file = undefined
            }
        })
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
    rename(from: string, to: string) {
        this.ensureActive()
        from = resolveFilePath(from)
        to = resolveFilePath(to)
        if (from === to) return
        const node = this.paths.get(from)
        if (!node || this.paths.has(to))
            throw new FileSystemGuestError('Missing source or occupied destination')
        const names = Object.fromEntries(
            Array.from(this.paths.keys(), (path) => [path, { encoding: 'plain', content: '' }])
        )
        delete names[from]
        names[to] = { encoding: 'plain', content: '' }
        cleanFiles(names)
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
        path = resolveFilePath(path)
        const node = this.paths.get(path)
        if (!node) throw new FileSystemGuestError(`File not found: ${path}`)
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
