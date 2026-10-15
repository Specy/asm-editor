import { isAssemblerProfile } from './assemblerProfiles'
import { isRuntimeAbiName } from './runtimeAbi'

/** Shared byte and path rules for persistence, assembly, and the FileSystem. */
export type FileEncoding = 'plain' | 'base64'
/**
 * A **Byte edit** ([ADR 0047](../../../../docs/adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md)):
 * `remove` bytes at `offset` replaced by `insert`, in base64. A File's edits apply in order to its
 * original bytes. The Hex editor only overwrites, so there `remove` is the inserted length; the
 * shape also expresses an insertion or a deletion, which a Project is read with, though this
 * editor writes none yet.
 */
export type ByteEdit = Readonly<{ offset: number; remove: number; insert: string }>
/**
 * One File as the Project stores it: its original bytes as `content` and, on a File stored as bytes
 * only, the Byte edits typed over them, omitted when there are none. Every reader goes through
 * `fileBytes`, which applies them.
 */
export type ProjectFile = Readonly<{
    encoding: FileEncoding
    content: string
    edits?: readonly ByteEdit[]
}>
export type ProjectFiles = Readonly<Record<string, ProjectFile>>
export const FILE_ENCODINGS: readonly FileEncoding[] = ['plain', 'base64']
export const FILE_BYTE_LIMIT = 16 * 1024 * 1024
export const FILE_COUNT_LIMIT = 4096
export const PATH_BYTE_LIMIT = 1024
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export class ProjectFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectFormatError'
    }
}

export function isValidFilePath(path: string): boolean {
    return (
        typeof path === 'string' &&
        path.length > 0 &&
        encoder.encode(path).length <= PATH_BYTE_LIMIT &&
        decoder.decode(encoder.encode(path)) === path &&
        !path.includes('\\') &&
        !Array.from(path).some((character) => {
            const code = character.charCodeAt(0)
            return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
        }) &&
        path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    )
}

export function resolveFilePath(path: string): string {
    const parts: string[] = []
    for (const part of path.replace(/^\//, '').split('/')) {
        if (part === '.') continue
        if (part === '..') {
            if (!parts.length) throw new ProjectFormatError('Path escapes the Project root')
            parts.pop()
        } else parts.push(part)
    }
    const result = parts.join('/')
    if (!isValidFilePath(result)) throw new ProjectFormatError(`Invalid file path: ${path}`)
    return result
}

/**
 * Decodes canonical base64, the form every byte File and Byte edit is stored in. Decoding is the
 * validation. A structural regex over the whole string is not an option here:
 * `(?:[A-Za-z0-9+/]{4})*` overflows V8's backtrack arena above roughly 4.5 million characters, so
 * any File past about 3.3 MiB threw a RangeError well inside the 16 MiB limit. `atob` rejects an
 * invalid alphabet and the round trip below rejects everything else, both in linear time.
 */
function decodeBase64(text: string): Uint8Array {
    let raw: string
    try {
        raw = atob(text)
    } catch {
        throw new ProjectFormatError('Invalid file encoding or base64 content')
    }
    if (btoa(raw) !== text) throw new ProjectFormatError('Noncanonical base64 content')
    //a plain loop: `Uint8Array.from` with a mapping function takes about 50 times as long, over a
    //second and a half for 16 MiB, and the Hex editor decodes a File again at every Byte edit
    const bytes = new Uint8Array(raw.length)
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
    return bytes
}

export function encodeBase64(bytes: Uint8Array): string {
    let raw = ''
    for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return btoa(raw)
}

/** A File's bytes as stored, before its Byte edits. */
export function originalBytes(file: ProjectFile): Uint8Array {
    if (file.encoding === 'plain') {
        const bytes = encoder.encode(file.content)
        if (decoder.decode(bytes) !== file.content)
            throw new ProjectFormatError('Text contains an unpaired surrogate')
        return bytes
    }
    if (file.encoding !== 'base64') {
        throw new ProjectFormatError('Invalid file encoding or base64 content')
    }
    return decodeBase64(file.content)
}

/** A File's bytes as everything reads them: the original with its Byte edits applied. */
export function fileBytes(file: ProjectFile): Uint8Array {
    const bytes = originalBytes(file)
    return file.edits?.length ? applyByteEdits(bytes, file.edits) : bytes
}

/**
 * Whether a Byte edit only overwrites, the one kind the editor writes: the File keeps its length,
 * and every offset names the same byte before and after it.
 */
function isOverwrite(edit: ByteEdit) {
    return edit.remove === base64Length(edit.insert)
}

/** The byte length of canonical base64, without decoding it. */
function base64Length(text: string) {
    if (!text.length) return 0
    return (text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0)
}

/** The bytes of `original` after `edits`, applied in order; `original` is left unchanged. */
export function applyByteEdits(original: Uint8Array, edits: readonly ByteEdit[]): Uint8Array {
    if (edits.every(isOverwrite)) {
        const result = original.slice()
        for (const edit of edits) {
            if (edit.offset + edit.remove > result.length)
                throw new ProjectFormatError('A Byte edit is past the end of its File')
            result.set(decodeBase64(edit.insert), edit.offset)
        }
        return result
    }
    let result = original
    for (const edit of edits) {
        if (edit.offset + edit.remove > result.length)
            throw new ProjectFormatError('A Byte edit is past the end of its File')
        const insert = decodeBase64(edit.insert)
        const next = new Uint8Array(result.length - edit.remove + insert.length)
        next.set(result.subarray(0, edit.offset))
        next.set(insert, edit.offset)
        next.set(result.subarray(edit.offset + edit.remove), edit.offset + insert.length)
        result = next
    }
    return result
}

/**
 * Overwrites folded into the fewest sorted runs that do not touch, which apply to the same bytes:
 * a later edit wins where two overlap. Only overwrites can be merged this way, since an insertion
 * or a deletion moves every byte after it.
 */
export function mergeOverwrites(edits: readonly ByteEdit[]): ByteEdit[] {
    if (!edits.every(isOverwrite))
        throw new ProjectFormatError('Only overwriting Byte edits can be merged')
    const live = edits.filter((edit) => edit.remove > 0)
    if (!live.length) return []
    let start = Infinity,
        end = 0
    for (const edit of live) {
        start = Math.min(start, edit.offset)
        end = Math.max(end, edit.offset + edit.remove)
    }
    const bytes = new Uint8Array(end - start)
    const written = new Uint8Array(end - start)
    for (const edit of live) {
        bytes.set(decodeBase64(edit.insert), edit.offset - start)
        written.fill(1, edit.offset - start, edit.offset - start + edit.remove)
    }
    const runs: ByteEdit[] = []
    for (let index = 0; index < written.length;) {
        if (!written[index]) {
            index++
            continue
        }
        let last = index
        while (last < written.length && written[last]) last++
        runs.push(
            Object.freeze({
                offset: start + index,
                remove: last - index,
                insert: encodeBase64(bytes.subarray(index, last))
            })
        )
        index = last
    }
    return runs
}

/**
 * Whether a File's Byte edits only overwrite, as the Hex editor's do: it can add to those alone,
 * since an insertion or a deletion moves every byte after it.
 */
export function overwritesOnly(file: ProjectFile): boolean {
    return (file.edits ?? []).every(isOverwrite)
}

/** How many bytes a File reads as, edits applied, without decoding a byte File. */
export function fileByteLength(file: ProjectFile): number {
    if (file.encoding !== 'base64') return fileBytes(file).length
    let length = base64Length(file.content)
    for (const edit of file.edits ?? []) length += base64Length(edit.insert) - edit.remove
    return length
}

/** A stable text naming a File's Byte edits, empty when it has none, for keys and equality. */
export function byteEditsKey(file: ProjectFile): string {
    return file.edits?.length
        ? file.edits.map((edit) => `${edit.offset},${edit.remove},${edit.insert}`).join(';')
        : ''
}

/** Whether two Files hold the same bytes the same way: encoding, original and Byte edits. */
export function sameFileContent(left: ProjectFile | undefined, right: ProjectFile | undefined) {
    if (!left || !right) return left === right
    return (
        left.encoding === right.encoding &&
        left.content === right.content &&
        byteEditsKey(left) === byteEditsKey(right)
    )
}

/**
 * The first `length` bytes a File reads as, edits applied, decoding only as much of it as they
 * need: recognising a File by its first bytes runs on every check and must not decode 16 MiB.
 */
export function fileHead(file: ProjectFile, length: number): Uint8Array {
    if (file.edits?.length && !file.edits.every(isOverwrite))
        return fileBytes(file).slice(0, length)
    let head: Uint8Array
    if (file.encoding === 'plain') {
        //every character is at least one byte of UTF-8, so `length` characters are enough
        head = encoder.encode(file.content.slice(0, length)).slice(0, length)
    } else {
        //every four base64 characters are three bytes, and canonical base64 decodes in pieces
        head = decodeBase64(file.content.slice(0, Math.ceil(length / 3) * 4)).slice(0, length)
    }
    for (const edit of file.edits ?? []) {
        if (edit.offset >= head.length) continue
        const insert = decodeBase64(edit.insert)
        head.set(insert.subarray(0, head.length - edit.offset), edit.offset)
    }
    return head
}

/**
 * The Byte edits stored with a File, checked by applying them in order to its original's
 * `length`: each in range of the length the edits before it leave, so a Project is never opened
 * with bytes it would read differently. An insertion or a deletion is as valid as an overwrite
 * (ADR 0047), so a Project that carries one is read, though this editor writes only overwrites.
 * Undefined when there are none.
 */
function cleanByteEdits(
    path: string,
    value: { encoding: FileEncoding; edits?: unknown },
    length: number
): readonly ByteEdit[] | undefined {
    if (value.edits === undefined) return undefined
    if (!Array.isArray(value.edits)) throw new ProjectFormatError(`Invalid Byte edits for ${path}`)
    if (!value.edits.length) return undefined
    if (value.encoding !== 'base64')
        throw new ProjectFormatError(`Only a File stored as bytes has Byte edits: ${path}`)
    let current = length
    return Object.freeze(
        value.edits.map((edit: unknown) => {
            if (
                !edit ||
                typeof edit !== 'object' ||
                Object.keys(edit).some(
                    (key) => key !== 'offset' && key !== 'remove' && key !== 'insert'
                )
            )
                throw new ProjectFormatError(`Invalid Byte edit for ${path}`)
            const { offset, remove, insert } = edit as Record<string, unknown>
            if (
                typeof offset !== 'number' ||
                typeof remove !== 'number' ||
                typeof insert !== 'string' ||
                !Number.isSafeInteger(offset) ||
                !Number.isSafeInteger(remove) ||
                offset < 0 ||
                remove < 0
            )
                throw new ProjectFormatError(`Invalid Byte edit for ${path}`)
            const inserted = decodeBase64(insert).length
            if (!remove && !inserted) throw new ProjectFormatError(`An empty Byte edit for ${path}`)
            if (offset + remove > current)
                throw new ProjectFormatError(`A Byte edit is past the end of ${path}`)
            current += inserted - remove
            return Object.freeze({ offset, remove, insert })
        })
    )
}

export function bytesFile(bytes: Uint8Array): ProjectFile {
    try {
        return Object.freeze({ encoding: 'plain', content: decoder.decode(bytes) })
    } catch {
        return Object.freeze({ encoding: 'base64', content: encodeBase64(bytes) })
    }
}

/** Rebuilds an archive's chosen storage representation without changing any of its bytes. */
export function projectFileFromBytes(bytes: Uint8Array, encoding: FileEncoding): ProjectFile {
    const automatic = bytesFile(bytes)
    if (encoding === 'plain') {
        if (automatic.encoding !== 'plain') {
            throw new ProjectFormatError('A plain File contains invalid UTF-8')
        }
        return automatic
    }
    if (encoding !== 'base64') throw new ProjectFormatError('Invalid file encoding')
    return Object.freeze({ encoding: 'base64', content: encodeBase64(bytes) })
}

/**
 * A File's text. A File with Byte edits has none: only a File stored as bytes takes them, and it
 * stays one whatever its edited bytes decode as.
 */
export function fileText(file: ProjectFile): string {
    if (file.edits?.length) throw new ProjectFormatError('File is not readable UTF-8 text')
    try {
        return decoder.decode(fileBytes(file))
    } catch {
        throw new ProjectFormatError('File is not readable UTF-8 text')
    }
}

export function cleanFiles(raw: unknown): ProjectFiles {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ProjectFormatError('Files must be a path-to-file map')
    const entries = Object.entries(raw)
    if (entries.length > FILE_COUNT_LIMIT)
        throw new ProjectFormatError('Project exceeds the 4,096-file limit')
    const files: Record<string, ProjectFile> = Object.create(null)
    let size = 0
    for (const [path, value] of entries) {
        if (!isValidFilePath(path)) throw new ProjectFormatError(`Invalid file path: ${path}`)
        if (
            !value ||
            typeof value !== 'object' ||
            typeof value.content !== 'string' ||
            !FILE_ENCODINGS.includes(value.encoding)
        ) {
            throw new ProjectFormatError(`Invalid contents or encoding for ${path}`)
        }
        if (value.content.length > (FILE_BYTE_LIMIT * 4) / 3 + 4)
            throw new ProjectFormatError('Project exceeds the 16 MiB file limit')
        const bytes = originalBytes(value)
        const edits = cleanByteEdits(path, value, bytes.length)
        //the original and its Byte edits are both kept, so both count (ADR 0047): the bytes each
        //edit puts in, an overwrite's length; the File as edited is never longer than all these
        size += bytes.length
        for (const edit of edits ?? []) size += base64Length(edit.insert)
        if (size > FILE_BYTE_LIMIT)
            throw new ProjectFormatError('Project exceeds the 16 MiB file limit')
        files[path] = Object.freeze({
            encoding: value.encoding,
            content: value.content,
            ...(edits ? { edits } : {})
        })
    }
    for (const path of Object.keys(files)) {
        const parts = path.split('/')
        parts.pop()
        while (parts.length) {
            if (hasOwn(files, parts.join('/')))
                throw new ProjectFormatError(`File/directory collision: ${path}`)
            parts.pop()
        }
    }
    return Object.freeze(files)
}

export type BuildConfiguration = Readonly<{
    assemblerProfile?: import('./assemblerProfiles').AssemblerProfile
    /** A source-unit resolution failure, carried to live checking and Build as a Diagnostic. */
    assemblyError?: string
    /**
     * The Runtime ABI whose library the Build links, absent when it links none
     * ([ADR 0031](../../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
     */
    runtimeAbi?: `v${number}`
    /**
     * The global execution starts at instead of `main`: the Runtime library's `_start` for compiled
     * programs. On x86, where every program starts at `_start`, it asks for the start code that
     * defines it: the Runtime library's `crt0` once x86 has one, the editor's start unit until then.
     */
    entrySymbol?: string
    /** x86 compiler support archive; startup is selected only for a compiled Entry. */
    x86Support?: boolean
    /** Generated assembly path to the source language that produced it. */
    compiledLanguages?: Readonly<
        Record<string, import('./sourceCompilation/records').SourceLanguage>
    >
    /**
     * The source File the Entry was compiled from when the Entry is Generated assembly, which
     * names the program on the Command line and in its `argv[0]`: `main.c` runs as `./main`.
     */
    entrySource?: string
}>

export type BuildSources = Readonly<{ files: ProjectFiles; entry: string }> & BuildConfiguration

// Exhaustive at compile time: a new configuration field must participate in every consumer.
const BUILD_CONFIGURATION_KEYS: Record<keyof Required<BuildConfiguration>, true> = {
    assemblerProfile: true,
    assemblyError: true,
    runtimeAbi: true,
    entrySymbol: true,
    x86Support: true,
    compiledLanguages: true,
    entrySource: true
}

export function buildConfiguration(sources: BuildConfiguration): BuildConfiguration {
    const configuration: Record<string, unknown> = {}
    for (const key of Object.keys(BUILD_CONFIGURATION_KEYS) as (keyof BuildConfiguration)[]) {
        if (sources[key] !== undefined) configuration[key] = sources[key]
    }
    if (sources.compiledLanguages)
        configuration.compiledLanguages = Object.freeze({ ...sources.compiledLanguages })
    return Object.freeze(configuration) as BuildConfiguration
}

export function buildConfigurationsEqual(left: BuildConfiguration, right: BuildConfiguration) {
    return (Object.keys(BUILD_CONFIGURATION_KEYS) as (keyof BuildConfiguration)[]).every((key) => {
        if (key !== 'compiledLanguages') return left[key] === right[key]
        const a = left.compiledLanguages ?? {}
        const b = right.compiledLanguages ?? {}
        return (
            Object.keys(a).length === Object.keys(b).length &&
            Object.keys(a).every((path) => hasOwn(b, path) && a[path] === b[path])
        )
    })
}

export function buildSourcesEqual(left: BuildSources, right: BuildSources): boolean {
    return (
        left.entry === right.entry &&
        buildConfigurationsEqual(left, right) &&
        Object.keys(left.files).length === Object.keys(right.files).length &&
        Object.keys(left.files).every(
            (path) =>
                hasOwn(right.files, path) && sameFileContent(left.files[path], right.files[path])
        )
    )
}

export type BuildInput = string | BuildSources

export function buildAssemblerProfile(sources: BuildSources) {
    if (sources.assemblyError) throw new ProjectFormatError(sources.assemblyError)
    if (!hasOwn(sources, 'assemblerProfile')) return 'rars' as const
    if (!isAssemblerProfile(sources.assemblerProfile)) {
        throw new ProjectFormatError(
            `Unsupported assembler profile: ${String(sources.assemblerProfile)}`
        )
    }
    return sources.assemblerProfile
}

export function normalizeBuildInput(input: BuildInput): BuildSources {
    if (typeof input !== 'string') {
        if (hasOwn(input, 'assemblyError') && typeof input.assemblyError !== 'string') {
            throw new ProjectFormatError('Invalid assembly resolution error')
        }
        if (!isValidFilePath(input.entry)) {
            throw new ProjectFormatError(`Invalid entry path: ${input.entry}`)
        }
        if (
            Object.prototype.hasOwnProperty.call(input, 'assemblerProfile') &&
            !isAssemblerProfile(input.assemblerProfile)
        ) {
            throw new ProjectFormatError(
                `Unsupported assembler profile: ${String(input.assemblerProfile)}`
            )
        }
        if (hasOwn(input, 'runtimeAbi') && !isRuntimeAbiName(input.runtimeAbi)) {
            throw new ProjectFormatError(`Invalid Runtime ABI: ${String(input.runtimeAbi)}`)
        }
        if (
            hasOwn(input, 'entrySymbol') &&
            (typeof input.entrySymbol !== 'string' ||
                !/^[.$A-Za-z_][.$A-Za-z_0-9]*$/.test(input.entrySymbol))
        ) {
            throw new ProjectFormatError(`Invalid entry symbol: ${String(input.entrySymbol)}`)
        }
        if (hasOwn(input, 'x86Support') && typeof input.x86Support !== 'boolean')
            throw new ProjectFormatError('Invalid x86 compiler support setting')
        if (
            hasOwn(input, 'compiledLanguages') &&
            (!input.compiledLanguages ||
                typeof input.compiledLanguages !== 'object' ||
                Array.isArray(input.compiledLanguages) ||
                Object.entries(input.compiledLanguages).some(
                    ([path, language]) =>
                        !isValidFilePath(path) || (language !== 'c' && language !== 'cpp')
                ))
        )
            throw new ProjectFormatError('Invalid compiled source languages')
        if (
            hasOwn(input, 'entrySource') &&
            (typeof input.entrySource !== 'string' || !isValidFilePath(input.entrySource))
        )
            throw new ProjectFormatError(`Invalid Entry source: ${String(input.entrySource)}`)
        return Object.freeze({
            files: cleanFiles(input.files),
            entry: input.entry,
            ...buildConfiguration(input)
        })
    }
    return Object.freeze({
        files: cleanFiles({ main: { encoding: 'plain', content: input } }),
        entry: 'main'
    })
}

export function updateEntryText(sources: BuildSources, text: string): BuildSources {
    return Object.freeze({
        ...sources,
        entry: sources.entry,
        files: cleanFiles({
            ...sources.files,
            [sources.entry]: { encoding: 'plain', content: text }
        })
    })
}

export function sourceText(sources: BuildSources): string {
    const file = sources.files[sources.entry]
    if (!file) throw new ProjectFormatError(`Entry file not found: ${sources.entry}`)
    return fileText(file)
}

export function assemblyFiles(sources: BuildSources): Record<string, string | Uint8Array> {
    return Object.fromEntries(
        Object.entries(sources.files).map(([path, file]) => {
            try {
                return [path, fileText(file)]
            } catch {
                return [path, fileBytes(file)]
            }
        })
    )
}

/** Text-only assemblers must not receive unrelated binary assets as bogus source strings. */
export function textAssemblyFiles(sources: BuildSources): Record<string, string> {
    sourceText(sources)
    return Object.fromEntries(
        Object.entries(sources.files).flatMap(([path, file]) => {
            try {
                return [[path, fileText(file)]]
            } catch {
                return []
            }
        })
    )
}
