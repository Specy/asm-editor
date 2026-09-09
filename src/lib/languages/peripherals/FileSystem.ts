import {
    bytesFile,
    cleanFiles,
    fileBytes,
    fileText,
    resolveFilePath,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    type BuildSources,
    type ProjectFiles
} from '$lib/projectFiles'

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)

type Node = { bytes: Uint8Array }
type Handle = { node: Node; offset: number; readable: boolean; writable: boolean; append: boolean }
type Inverse = { bytes: number; filesChanged?: true; restore: () => void }
type Frame = { id: number; changes: Inverse[]; bytes: number; available: boolean }
export type FileStore = { read: () => ProjectFiles; write: (files: ProjectFiles) => void }

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
        if (!file) throw new Error(`File not found: ${path}`)
        return fileBytes(file)
    }
    readText(path: string) {
        const file = this.files[resolveFilePath(path)]
        if (!file) throw new Error(`File not found: ${path}`)
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
        if (!replace && hasOwn(this.files, path)) throw new Error(`File already exists: ${path}`)
        this.commit({ ...this.files, [path]: bytesFile(bytes) })
    }
    writeText(path: string, text: string, replace = true) {
        const file = { encoding: 'plain' as const, content: text }
        this.writeBytes(path, fileBytes(file), replace)
    }
    remove(path: string) {
        this.assertEditable()
        path = resolveFilePath(path)
        if (!hasOwn(this.files, path)) throw new Error(`File not found: ${path}`)
        const files = { ...this.files }
        delete files[path]
        this.commit(files)
    }
    rename(from: string, to: string) {
        this.assertEditable()
        from = resolveFilePath(from)
        to = resolveFilePath(to)
        if (from === to) return
        if (!hasOwn(this.files, from)) throw new Error(`File not found: ${from}`)
        if (hasOwn(this.files, to)) throw new Error(`File already exists: ${to}`)
        const files = { ...this.files, [to]: this.files[from] }
        delete files[from]
        this.commit(files)
    }
    private commit(files: ProjectFiles) {
        this.store.write(cleanFiles(files))
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
                this.commit(files)
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
            this.paths.set(path, { bytes: fileBytes(file) })
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
    }
    beginInstruction(id: number) {
        this.ensureActive()
        if (this.frame) throw new Error('FileSystem instruction already active')
        this.frame = { id, changes: [], bytes: 0, available: true }
    }
    performInstruction<T>(id: number, operation: () => T): T {
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
    canUndo(id: number) {
        return (
            !this.stopped &&
            !this.frame &&
            this.history[this.history.length - 1]?.id === id &&
            this.history[this.history.length - 1]?.available === true
        )
    }
    canUndoAfter(id: number) {
        const latest = this.history[this.history.length - 1]
        return !latest || latest.id !== id || this.canUndo(id)
    }
    undoAfter(id: number) {
        if (this.history[this.history.length - 1]?.id === id) this.undo(id)
    }
    undo(id: number) {
        if (!this.canUndo(id)) throw new Error('FileSystem Undo history exhausted')
        const frame = this.history.pop()!
        this.retained -= frame.bytes
        for (let index = frame.changes.length - 1; index >= 0; index--)
            frame.changes[index].restore()
        if (frame.changes.some((change) => change.filesChanged)) this.flush()
    }
    private flush() {
        this.publish(
            Object.fromEntries(
                Array.from(this.paths, ([path, node]) => [path, bytesFile(node.bytes)])
            )
        )
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
        if (!handle) throw new Error(`Invalid file descriptor: ${fd}`)
        return handle
    }
    open(path: string, mode: 'read' | 'write' | 'append', fd?: number): number {
        this.ensureActive()
        path = resolveFilePath(path)
        if (fd === undefined) {
            fd = 3
            while (this.handles.has(fd)) fd++
        }
        if (this.handles.has(fd)) throw new Error(`Descriptor already open: ${fd}`)
        let node = this.paths.get(path)
        let filesChanged = false
        if (!node) {
            if (mode === 'read') throw new Error(`File not found: ${path}`)
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
            filesChanged = true
        }
        if (mode === 'write')
            filesChanged = this.replaceBytes(node, new Uint8Array()) || filesChanged
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
        if (filesChanged) this.flush()
        return fd
    }
    close(fd: number) {
        const handle = this.handle(fd)
        this.record({
            bytes: handle.node.bytes.length,
            restore: () => {
                this.handles.set(fd, handle)
            }
        })
        this.handles.delete(fd)
    }
    read(fd: number, length: number): Uint8Array {
        const handle = this.handle(fd)
        if (!handle.readable || !Number.isSafeInteger(length) || length < 0)
            throw new Error('Invalid file read')
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
        if (!handle.writable) throw new Error('File not writable')
        const offset = handle.offset
        const start = handle.append ? handle.node.bytes.length : offset
        const length = Math.max(handle.node.bytes.length, start + bytes.length)
        this.capacity(handle.node, length)
        const next = new Uint8Array(length)
        next.set(handle.node.bytes)
        next.set(bytes, start)
        const filesChanged = this.replaceBytes(handle.node, next)
        handle.offset = start + bytes.length
        if (handle.offset !== offset)
            this.record({
                bytes: 8,
                restore: () => {
                    handle.offset = offset
                }
            })
        if (filesChanged) this.flush()
        return bytes.length
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
            }
        })
        node.bytes = bytes
        return true
    }
    rename(from: string, to: string) {
        this.ensureActive()
        from = resolveFilePath(from)
        to = resolveFilePath(to)
        if (from === to) return
        const node = this.paths.get(from)
        if (!node || this.paths.has(to)) throw new Error('Missing source or occupied destination')
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
        this.flush()
    }
    remove(path: string) {
        this.ensureActive()
        path = resolveFilePath(path)
        const node = this.paths.get(path)
        if (!node) throw new Error(`File not found: ${path}`)
        this.record({
            bytes: node.bytes.length + path.length * 2,
            filesChanged: true,
            restore: () => {
                this.paths.set(path, node)
            }
        })
        this.paths.delete(path)
        this.flush()
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
