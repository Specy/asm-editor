import { isAssemblerProfile } from './assemblerProfiles'
import { commentProblem } from './annotations/comments'
import { looksLikeGhidraName, nameProblem } from './annotations/names'
import { isRuntimeAbiName } from './runtimeAbi'
import { isBmp } from './pixels/bmp'

/** Shared byte and path rules for persistence, assembly, and the FileSystem. */
export type FileEncoding = 'plain' | 'base64'
/**
 * A **Byte edit**, as Projects saved before [ADR 0063](../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)
 * may carry them beside a File's original bytes: `remove` bytes at `offset` replaced by `insert`,
 * in base64, applied in order. Nothing writes them any more: `cleanFiles` applies a File's edits
 * once, as it is read, and keeps the bytes they leave.
 */
export type ByteEdit = Readonly<{ offset: number; remove: number; insert: string }>
/**
 * A link-time address, the file address Invented names are derived from
 * ([ADR 0045](../../../../docs/adr/0045-invented-names-are-frozen-words-from-file-addresses.md)),
 * so an annotation keyed by one does not depend on where a PIE is loaded: `0x` and lower-case hex
 * digits without leading zeros, as `fileAddress` writes it, of at most `Number.MAX_SAFE_INTEGER`.
 */
export type FileAddress = string
/**
 * A person's **Annotations** on an Executable, kept beside its bytes
 * ([annotations-and-search.md](../../../../docs/design/annotations-and-search.md), decision 2):
 * - `names`: global renames, of a function, data, string or jump-target label, by its address;
 * - `comments`: line comments, by the address of the line they are on;
 * - `functionComments`: function comments, by the function's address;
 * - `locals`: renames of one function's Pseudocode variables, by the function's address, then the
 *   decompiler's opaque id for the variable (decision 15).
 *
 * Each map is omitted when it is empty, and a File keeps no record when all are. Every key and
 * text is checked by `cleanAnnotations`, which also puts the keys in address order (ids in code
 * unit order), so the same annotations always save as the same text.
 */
export type Annotations = Readonly<{
    names?: Readonly<Record<FileAddress, string>>
    comments?: Readonly<Record<FileAddress, string>>
    functionComments?: Readonly<Record<FileAddress, string>>
    locals?: Readonly<Record<FileAddress, Readonly<Record<string, string>>>>
}>
/**
 * One File as the Project stores it: its current bytes as `content`, and the Annotations a person
 * made on it, omitted when there are none (ADR 0063). Annotations change no byte: an overwrite and
 * a rename of the File keep them, and whatever makes its whole content new drops them
 * (decision 3). Undo of the Hex and Pixel editors lives beside the Project, in the Edit journal.
 */
export type ProjectFile = Readonly<{
    encoding: FileEncoding
    content: string
    annotations?: Annotations
}>

export type ProjectFiles = Readonly<Record<string, ProjectFile>>
export const FILE_ENCODINGS: readonly FileEncoding[] = ['plain', 'base64']
/**
 * The bytes all a Project's Files may hold together, UTF-8 or binary
 * ([ADR 0076](../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)). The FileSystem gives
 * a running program the same room: one File may take all of it.
 */
export const FILE_BYTE_LIMIT = 64 * 1024 * 1024
export const FILE_COUNT_LIMIT = 4096
export const PATH_BYTE_LIMIT = 1024
/**
 * What the Annotations of all a Project's Files take together, in UTF-8 bytes of their keys,
 * ids, names and comments (decision 5): small enough for an archive's 1 MiB manifest to hold them.
 */
export const ANNOTATIONS_BYTE_LIMIT = 256 * 1024
/** The longest variable id the decompiler's annotations are kept by. */
export const VARIABLE_ID_LENGTH_LIMIT = 256
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** A byte count as the messages that state a limit write it: `64 MiB`. */
export function formatMiB(bytes: number): string {
    return `${Number((bytes / (1024 * 1024)).toFixed(1))} MiB`
}

/** What a Project whose Files pass {@link FILE_BYTE_LIMIT} is refused with. */
export const FILE_LIMIT_MESSAGE = `Project exceeds the ${formatMiB(FILE_BYTE_LIMIT)} file limit`

/** {@link FILE_COUNT_LIMIT} as the messages write it: `4,096`. */
export const FILE_COUNT_TEXT = FILE_COUNT_LIMIT.toLocaleString('en-US')

/** {@link ANNOTATIONS_BYTE_LIMIT} as the messages write it: `256 KiB`. */
export const ANNOTATIONS_LIMIT_TEXT = `${ANNOTATIONS_BYTE_LIMIT / 1024} KiB`

/** What a change that takes the Annotations past {@link ANNOTATIONS_BYTE_LIMIT} is refused with. */
export const ANNOTATIONS_SAVE_MESSAGE = `This Project could not be saved, as it contains too many renames and comments (at most ${ANNOTATIONS_LIMIT_TEXT}). Delete some and try again.`

/**
 * The byte length of each File record this module made from checked bytes or text, by the record.
 * A File's own rules do not depend on the other Files, so a record here is valid in any Project:
 * `cleanFiles` keeps it without decoding it again and counts it from its stored length, which makes
 * a change to one File of a large Project cost that File, not the Project. Only records frozen
 * here are added, never one a caller made, which could be changed afterwards.
 */
const checkedRecords = new WeakMap<ProjectFile, number>()
/** The maps `cleanFiles` returned, frozen and of checked records, which it returns as they are. */
const checkedMaps = new WeakSet<object>()
/** The UTF-8 size of each Annotations record `cleanAnnotations` returned, see `annotationsSize`. */
const annotationSizes = new WeakMap<Annotations, number>()

/** Keeps `file`, frozen here from checked content, as a record `cleanFiles` need not check again. */
function checkedRecord(file: ProjectFile, bytes: number): ProjectFile {
    checkedRecords.set(file, bytes)
    return file
}

/** Whether `cleanFiles` or another function here made `file`, so its content is known valid. */
function isChecked(file: ProjectFile): boolean {
    return checkedRecords.has(file)
}

const hasWellFormed =
    typeof (String.prototype as { isWellFormed?: unknown }).isWellFormed === 'function'

/**
 * Whether text has no unpaired surrogate, which is exactly when its UTF-8 decodes back to it:
 * `isWellFormed` answers without encoding it, at once for text V8 holds as one byte a character.
 */
function isWellFormedText(text: string): boolean {
    if (hasWellFormed) return (text as string & { isWellFormed(): boolean }).isWellFormed()
    return decoder.decode(encoder.encode(text)) === text
}

export class ProjectFormatError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectFormatError'
    }
}

/**
 * The paths `isValidFilePath` accepted lately, which it accepts again without checking them: every
 * change to one File checks every path of the Project, thousands in a large one. Emptied past twice
 * the Files a Project may hold, so that renames cannot grow it without end.
 */
const validPaths = new Set<string>()

export function isValidFilePath(path: string): boolean {
    if (typeof path !== 'string') return false
    if (validPaths.has(path)) return true
    const valid = checkFilePath(path)
    if (valid) {
        if (validPaths.size >= 2 * FILE_COUNT_LIMIT) validPaths.clear()
        validPaths.add(path)
    }
    return valid
}

function checkFilePath(path: string): boolean {
    return (
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
 * The File an include in `containingPath` names: the written path beside that File, else from the
 * Project root. Null when neither is a File of `sources`.
 */
export function resolveProjectInclude(
    containingPath: string,
    writtenPath: string,
    sources: BuildSources
): string | null {
    const parts = containingPath.split('/')
    parts.pop()
    const directory = parts.join('/')
    const candidates = [directory ? `${directory}/${writtenPath}` : writtenPath, writtenPath]
    for (const candidate of candidates) {
        try {
            const normalized = resolveFilePath(candidate)
            if (sources.files[normalized]) return normalized
        } catch {
            // A path that escapes the Project root, or is malformed, names no File: the assembler
            // reports it in its own diagnostics.
        }
    }
    return null
}

/**
 * Decodes canonical base64, the form every byte File is stored in. Decoding is the validation. A
 * structural regex over the whole string is not an option here:
 * `(?:[A-Za-z0-9+/]{4})*` overflows V8's backtrack arena above roughly 4.5 million characters, so
 * any File past about 3.3 MiB threw a RangeError well inside the 16 MiB limit. `atob` rejects an
 * invalid alphabet and the round trip below rejects everything else, both in linear time.
 */
export function decodeBase64(text: string): Uint8Array {
    let raw: string
    try {
        raw = atob(text)
    } catch {
        throw new ProjectFormatError('Invalid file encoding or base64 content')
    }
    if (btoa(raw) !== text) throw new ProjectFormatError('Noncanonical base64 content')
    return rawBytes(raw)
}

/** The bytes of `atob`'s answer, one a character. */
function rawBytes(raw: string): Uint8Array {
    //a plain loop: `Uint8Array.from` with a mapping function takes about 50 times as long, over a
    //second and a half for 16 MiB, and the Hex editor decodes a File again at every change
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

/** A File's bytes, decoded from its `content`. */
export function fileBytes(file: ProjectFile): Uint8Array {
    if (file.encoding === 'plain') {
        if (!isChecked(file) && !isWellFormedText(file.content))
            throw new ProjectFormatError('Text contains an unpaired surrogate')
        return encoder.encode(file.content)
    }
    if (file.encoding !== 'base64') {
        throw new ProjectFormatError('Invalid file encoding or base64 content')
    }
    //a checked record's base64 is canonical already: no need to encode it again to see
    return isChecked(file) ? rawBytes(atob(file.content)) : decodeBase64(file.content)
}

/** Whether a Byte edit only overwrites: the File keeps its length, and every offset its byte. */
function isOverwrite(edit: ByteEdit) {
    return edit.remove === base64Length(edit.insert)
}

/** The byte length of canonical base64, without decoding it. */
function base64Length(text: string) {
    if (!text.length) return 0
    return (text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0)
}

/**
 * The bytes of `original` after `edits`, applied in order; `original` is left unchanged.
 * Overwrites are written over one copy; an insertion or a deletion copies the bytes it leaves,
 * which `cleanByteEdits` bounds.
 */
export function applyByteEdits(original: Uint8Array, edits: readonly ByteEdit[]): Uint8Array {
    let result = original.slice()
    for (const edit of edits) {
        if (edit.offset + edit.remove > result.length)
            throw new ProjectFormatError('A Byte edit is past the end of its File')
        const insert = decodeBase64(edit.insert)
        if (isOverwrite(edit)) {
            result.set(insert, edit.offset)
            continue
        }
        const next = new Uint8Array(result.length - edit.remove + insert.length)
        next.set(result.subarray(0, edit.offset))
        next.set(insert, edit.offset)
        next.set(result.subarray(edit.offset + edit.remove), edit.offset + insert.length)
        result = next
    }
    return result
}

/**
 * The text of a File stored as text once `bytes` overwrite its UTF-8 from `offset`, or undefined
 * when they would leave it no longer UTF-8, which such a File must be: typing over its bytes in the
 * Hex editor changes its text, as typing into its Text view does.
 */
export function overwriteText(text: string, offset: number, bytes: Uint8Array): string | undefined {
    const next = encoder.encode(text)
    next.set(bytes, offset)
    try {
        return decoder.decode(next)
    } catch {
        return undefined
    }
}

/** Bytes written over a File's from `offset`, as the Hex and Pixel editors write them. */
export type ByteRun = Readonly<{ offset: number; bytes: Uint8Array }>

/**
 * `file` with `runs` written over its bytes in order, a later run winning where two overlap, and
 * the runs that write back what they replaced, in the order to write them. The File keeps its
 * length, its encoding and its Annotations, since an overwrite moves no address. A File stored as
 * bytes decodes and encodes only the base64 around the runs, so typing into a File of many MiB
 * costs what the runs do; one stored as text takes them over its UTF-8, and is undefined when they
 * would leave it no longer UTF-8. A run past the end of the File throws.
 */
export function overwriteBytes(
    file: ProjectFile,
    runs: readonly ByteRun[]
): { file: ProjectFile; restore: ByteRun[] } | undefined {
    const length = fileByteLength(file)
    for (const { offset, bytes } of runs)
        if (!Number.isSafeInteger(offset) || offset < 0 || offset + bytes.length > length)
            throw new ProjectFormatError('An overwrite is past the end of its File')
    const written = runs.filter((run) => run.bytes.length)
    const restore: ByteRun[] = []
    let content: string
    if (file.encoding === 'plain') {
        const bytes = encoder.encode(file.content)
        for (const { offset, bytes: run } of written) {
            restore.push({ offset, bytes: bytes.slice(offset, offset + run.length) })
            bytes.set(run, offset)
        }
        const text = decodedText(bytes)
        if (text === undefined) return undefined
        content = text
    } else {
        //the runs' spans of whole base64 groups, three bytes each, joined where they meet
        const groupsOf = (run: ByteRun) => [
            Math.floor(run.offset / 3),
            Math.ceil((run.offset + run.bytes.length) / 3)
        ]
        const order = written
            .map((run, index) => ({ index, groups: groupsOf(run) }))
            .sort((left, right) => left.groups[0] - right.groups[0])
        const spans: { start: number; end: number; bytes?: Uint8Array }[] = []
        const spanOf: number[] = []
        for (const { index, groups } of order) {
            const last = spans.at(-1)
            if (last && groups[0] <= last.end) last.end = Math.max(last.end, groups[1])
            else spans.push({ start: groups[0], end: groups[1] })
            spanOf[index] = spans.length - 1
        }
        for (const span of spans)
            span.bytes = decodeBase64(file.content.slice(span.start * 4, span.end * 4))
        written.forEach(({ offset, bytes: run }, index) => {
            const span = spans[spanOf[index]]
            const at = offset - span.start * 3
            restore.push({ offset, bytes: span.bytes!.slice(at, at + run.length) })
            span.bytes!.set(run, at)
        })
        const parts: string[] = []
        let from = 0
        for (const span of spans) {
            parts.push(file.content.slice(from, span.start * 4), encodeBase64(span.bytes!))
            from = span.end * 4
        }
        parts.push(file.content.slice(from))
        content = parts.join('')
    }
    const next: ProjectFile = Object.freeze({
        encoding: file.encoding,
        content,
        ...(file.annotations ? { annotations: file.annotations } : {})
    })
    //the bytes are as many as before, and a checked File's Annotations stay checked
    return {
        file: isChecked(file) ? checkedRecord(next, length) : next,
        restore: restore.reverse()
    }
}

/**
 * How many bytes a File holds, without decoding a byte File: a checked record's stored length, else
 * counted from its content.
 */
export function fileByteLength(file: ProjectFile): number {
    const known = checkedRecords.get(file)
    if (known !== undefined) return known
    return file.encoding === 'base64' ? base64Length(file.content) : utf8Length(file.content)
}

const NON_ASCII = /[\u0080-\uffff]+/g

/**
 * The UTF-8 length of `text`, without encoding it, for text with no unpaired surrogate, as
 * `cleanFiles` leaves every text File: each half of a pair is two of the character's four bytes.
 * Every ASCII character is one byte, so only the runs of others are looked at, which a regular
 * expression finds several times faster than a loop over every character.
 */
function utf8Length(text: string) {
    let length = text.length
    NON_ASCII.lastIndex = 0
    for (let run = NON_ASCII.exec(text); run; run = NON_ASCII.exec(text)) {
        const characters = run[0]
        for (let index = 0; index < characters.length; index++) {
            const code = characters.charCodeAt(index)
            length += code < 0x800 || (code >= 0xd800 && code <= 0xdfff) ? 1 : 2
        }
    }
    return length
}

/**
 * What the Files take of the Project's {@link FILE_BYTE_LIMIT}, as `cleanFiles` counts it: each
 * File's bytes. Read from the stored lengths without decoding a File, for Files `cleanFiles`
 * checked, whose base64 is canonical and whose text has no lone surrogate.
 */
export function storedFilesSize(files: ProjectFiles): number {
    let size = 0
    for (const file of Object.values(files)) size += fileByteLength(file)
    return size
}

/**
 * Whether two Files hold the same bytes the same way: encoding and content. Their Annotations are
 * no part of it, so a rename or a comment never makes a Build stale.
 */
export function sameFileContent(left: ProjectFile | undefined, right: ProjectFile | undefined) {
    if (!left || !right) return left === right
    return left.encoding === right.encoding && left.content === right.content
}

const ANNOTATION_KINDS: readonly (keyof Annotations)[] = [
    'names',
    'comments',
    'functionComments',
    'locals'
]
/** The kinds a Listing is generated from: renames and comments, not a function's local names. */
const LISTING_ANNOTATION_KINDS: readonly (keyof Annotations)[] = [
    'names',
    'comments',
    'functionComments'
]
const FILE_ADDRESS = /^0x(?:0|[1-9a-f][0-9a-f]*)$/

/** Whether `key` is a {@link FileAddress}: canonical lower-case hex, a safe integer. */
export function isFileAddress(key: unknown): key is FileAddress {
    return (
        typeof key === 'string' &&
        key.length <= 16 &&
        FILE_ADDRESS.test(key) &&
        Number(key) <= Number.MAX_SAFE_INTEGER
    )
}

/**
 * Whether `id` can be a variable id, which the editor keeps as the decompiler gives it without
 * reading it (decision 15): 1 to {@link VARIABLE_ID_LENGTH_LIMIT} characters, none a control.
 */
export function isVariableId(id: unknown): id is string {
    if (typeof id !== 'string' || !id.length || id.length > VARIABLE_ID_LENGTH_LIMIT) return false
    for (let index = 0; index < id.length; index++) {
        const code = id.charCodeAt(index)
        if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false
    }
    return true
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strings in the order of their UTF-16 code units, as `sort` without a comparator puts them. */
function byCodeUnits(left: string, right: string) {
    return left < right ? -1 : left > right ? 1 : 0
}

/** Canonical file addresses in address order: the longer is the larger, without leading zeros. */
function byAddress(left: string, right: string) {
    return left.length - right.length || byCodeUnits(left, right)
}

/** A frozen map without a prototype, with `entries` in the order given. */
function frozenRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
    const record: Record<string, T> = Object.create(null)
    for (const [key, value] of entries) record[key] = value
    return Object.freeze(record)
}

/** A saved comment's problem: not text, empty, or what `commentProblem` refuses. */
function savedCommentProblem(text: unknown): string | undefined {
    if (typeof text !== 'string') return 'not text'
    if (!text.trim()) return 'an empty comment'
    return commentProblem(text)
}

/** A saved local's name's problem: what any name may not be, or one shaped like Ghidra's own. */
function savedLocalProblem(name: unknown): string | undefined {
    if (typeof name !== 'string') return 'not text'
    const problem = nameProblem(name)
    if (problem) return problem
    return looksLikeGhidraName(name)
        ? `The name “${name}” uses the same format that the decompiler uses. Choose a different name.`
        : undefined
}

/** A File's saved renames or comments that are not the shape they are saved in. */
const damagedAnnotations = (path: string) =>
    new ProjectFormatError(`${path} has damaged renames or comments and can't be opened.`)

/** A File's saved rename or comment at a key that is no address. */
const misplacedAnnotation = (path: string, key: string) =>
    new ProjectFormatError(`${path} has a rename or comment at a bad address (${key}).`)

/** A File's saved local name under a key that is no variable id, shown quoted and cut short. */
const misplacedLocal = (path: string, id: string) =>
    new ProjectFormatError(
        `${path} has a renamed variable with a bad id (${JSON.stringify(id.length > 40 ? `${id.slice(0, 40)}…` : id)}).`
    )

/** One map of texts by address, checked, in address order; undefined when absent or empty. */
function cleanAddressTexts(
    path: string,
    value: unknown,
    what: string,
    problemOf: (text: unknown) => string | undefined
): Readonly<Record<FileAddress, string>> | undefined {
    if (value === undefined) return undefined
    if (!isPlainRecord(value)) throw damagedAnnotations(path)
    const entries = Object.entries(value).map(([key, text]) => {
        if (!isFileAddress(key)) throw misplacedAnnotation(path, key)
        const problem = problemOf(text)
        if (problem)
            throw new ProjectFormatError(
                `${path} has a ${what} at ${key} that can't be used: ${problem}`
            )
        return [key, text as string] as const
    })
    if (!entries.length) return undefined
    return frozenRecord(entries.sort((left, right) => byAddress(left[0], right[0])))
}

/**
 * A File's saved Annotations, checked as a saved File is: an unknown kind, a key
 * that is not a canonical file address or variable id, a name that is not one a person may give
 * (`nameProblem`, and for a local one not shaped like Ghidra's own), or a comment that is empty
 * or past the limits throws a `ProjectFormatError`. Uniqueness is not checked, since it depends on
 * the Listing, which an overwrite can change: a name another label took is not applied
 * (decision 10). The result is frozen, in address order, without empty maps; undefined when
 * nothing is left.
 */
export function cleanAnnotations(path: string, value: unknown): Annotations | undefined {
    if (value === undefined) return undefined
    if (
        !isPlainRecord(value) ||
        Object.keys(value).some((key) => !ANNOTATION_KINDS.includes(key as keyof Annotations))
    )
        throw damagedAnnotations(path)
    const names = cleanAddressTexts(path, value.names, 'name', (name) =>
        typeof name === 'string' ? nameProblem(name) : 'not text'
    )
    const comments = cleanAddressTexts(path, value.comments, 'comment', savedCommentProblem)
    const functionComments = cleanAddressTexts(
        path,
        value.functionComments,
        'function comment',
        savedCommentProblem
    )
    let locals: Annotations['locals']
    if (value.locals !== undefined) {
        if (!isPlainRecord(value.locals)) throw damagedAnnotations(path)
        const functions: (readonly [FileAddress, Readonly<Record<string, string>>])[] = []
        for (const [key, variables] of Object.entries(value.locals)) {
            if (!isFileAddress(key)) throw misplacedAnnotation(path, key)
            if (!isPlainRecord(variables)) throw damagedAnnotations(path)
            const named = Object.entries(variables).map(([id, name]) => {
                if (!isVariableId(id)) throw misplacedLocal(path, id)
                const problem = savedLocalProblem(name)
                if (problem)
                    throw new ProjectFormatError(
                        `${path} has a variable name at ${key} that can't be used: ${problem}`
                    )
                return [id, name as string] as const
            })
            if (named.length)
                functions.push([
                    key,
                    frozenRecord(named.sort(([left], [right]) => byCodeUnits(left, right)))
                ])
        }
        if (functions.length)
            locals = frozenRecord(functions.sort((left, right) => byAddress(left[0], right[0])))
    }
    const kinds = { names, comments, functionComments, locals }
    const kept = ANNOTATION_KINDS.filter((kind) => kinds[kind] !== undefined)
    if (!kept.length) return undefined
    const clean = Object.freeze(
        Object.fromEntries(kept.map((kind) => [kind, kinds[kind]]))
    ) as Annotations
    annotationSizes.set(clean, countAnnotations(clean))
    return clean
}

/**
 * The same File with `annotations` in place of its own, checked and put in order as
 * `cleanAnnotations` does; without a record when they are undefined or empty. Its bytes stay as
 * they are. The Project's limit on all its Files' Annotations together is the
 * caller's to check (`storedAnnotationsSize`), as `FileSystem.annotate` does.
 */
export function withAnnotations(
    path: string,
    file: ProjectFile,
    annotations: Annotations | undefined
): ProjectFile {
    const clean = cleanAnnotations(path, annotations)
    const next: ProjectFile = Object.freeze({
        encoding: file.encoding,
        content: file.content,
        ...(clean ? { annotations: clean } : {})
    })
    const bytes = checkedRecords.get(file)
    return bytes === undefined ? next : checkedRecord(next, bytes)
}

/**
 * The UTF-8 bytes of a File's Annotations: every key, id, name and comment, kept for those
 * `cleanAnnotations` returned, which are frozen whole.
 */
function annotationsSize(annotations: Annotations | undefined): number {
    if (!annotations) return 0
    return annotationSizes.get(annotations) ?? countAnnotations(annotations)
}

function countAnnotations(annotations: Annotations): number {
    let size = 0
    const texts = (record: Readonly<Record<string, string>> | undefined) => {
        for (const [key, text] of Object.entries(record ?? {}))
            size += utf8Length(key) + utf8Length(text)
    }
    texts(annotations.names)
    texts(annotations.comments)
    texts(annotations.functionComments)
    for (const [key, variables] of Object.entries(annotations.locals ?? {})) {
        size += utf8Length(key)
        texts(variables)
    }
    return size
}

/**
 * What the Annotations of all `files` take of the Project's {@link ANNOTATIONS_BYTE_LIMIT}, as
 * `cleanFiles` counts it, for Files whose Annotations it checked.
 */
export function storedAnnotationsSize(files: ProjectFiles): number {
    let size = 0
    for (const file of Object.values(files)) size += annotationsSize(file.annotations)
    return size
}

/** The kinds of `annotations` named, in a fixed order, as text no two different records share. */
function annotationsText(
    annotations: Annotations | undefined,
    kinds: readonly (keyof Annotations)[]
): string {
    if (!annotations) return ''
    const sorted = (
        record: Readonly<Record<string, unknown>>,
        order: (left: string, right: string) => number
    ): [string, unknown][] =>
        Object.keys(record)
            .sort(order)
            .map((key) => [key, record[key]])
    const parts: [keyof Annotations, unknown][] = []
    for (const kind of kinds) {
        const record = annotations[kind]
        if (!record || !Object.keys(record).length) continue
        if (kind !== 'locals') {
            parts.push([kind, sorted(record, byAddress)])
            continue
        }
        const functions = sorted(record, byAddress)
            .map(([key, variables]) => [
                key,
                sorted(variables as Readonly<Record<string, string>>, byCodeUnits)
            ])
            .filter(([, variables]) => variables.length)
        if (functions.length) parts.push([kind, functions])
    }
    return parts.length ? JSON.stringify(parts) : ''
}

/**
 * A stable text naming a File's Annotations, empty when it has none, for keys and equality: two
 * Files' keys are equal exactly when their Annotations are, whatever order their keys were added
 * in.
 */
export function annotationsKey(file: Pick<ProjectFile, 'annotations'>): string {
    return annotationsText(file.annotations, ANNOTATION_KINDS)
}

/**
 * The part of {@link annotationsKey} a File's Listing is generated from, its renames and comments,
 * so that renaming a local, which only its function's Pseudocode shows, leaves the Listing as it
 * is. Empty when there is none.
 */
export function listingAnnotationsKey(file: Pick<ProjectFile, 'annotations'>): string {
    return annotationsText(file.annotations, LISTING_ANNOTATION_KINDS)
}

/**
 * The first `length` bytes of a File, decoding only as much of it as they need: recognising a File
 * by its first bytes runs on every check and must not decode a File of many MiB.
 */
export function fileHead(file: ProjectFile, length: number): Uint8Array {
    //every character is at least one byte of UTF-8, so `length` characters are enough
    if (file.encoding === 'plain')
        return encoder.encode(file.content.slice(0, length)).slice(0, length)
    //every four base64 characters are three bytes, and canonical base64 decodes in pieces
    return decodeBase64(file.content.slice(0, Math.ceil(length / 3) * 4)).slice(0, length)
}

/**
 * The bytes a Project held when editors still wrote Byte edits, which bounds what its edits put
 * in: only a Project saved under that 16 MiB limit has any, so raising the limit leaves this where
 * it was ([ADR 0076](../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)).
 */
const LEGACY_EDIT_BYTE_LIMIT = 16 * 1024 * 1024

/**
 * How many bytes the insertions and deletions of a Project's legacy edits may copy as they apply,
 * each copying the File it leaves: none an editor wrote, and enough for a few on the largest File
 * of a Project of their time, so a crafted link with thousands of them, over as many Files, cannot
 * hold the page for minutes.
 */
const EDIT_COPY_LIMIT = 8 * LEGACY_EDIT_BYTE_LIMIT

/** What a Project's legacy edits have put in and copied so far, as `cleanFiles` applies them. */
type EditWork = { inserted: number; copied: number }

/**
 * A File's legacy Byte edits, checked by applying them in order to its original's `length`: each
 * in range of the length the edits before it leave, so a Project is never opened with bytes it
 * would read differently. An insertion or a deletion is as valid as an overwrite (ADR 0047). The
 * Project's edits together, counted in `work`, put in at most {@link LEGACY_EDIT_BYTE_LIMIT}, as
 * the Files and edits a Project saved together did, and copy at most {@link EDIT_COPY_LIMIT}.
 * Undefined when there are none.
 */
function cleanByteEdits(
    path: string,
    value: { encoding: FileEncoding; edits?: unknown },
    length: number,
    work: EditWork
): readonly ByteEdit[] | undefined {
    if (value.edits === undefined) return undefined
    if (!Array.isArray(value.edits)) throw new ProjectFormatError(`Invalid Byte edits for ${path}`)
    if (!value.edits.length) return undefined
    if (value.encoding !== 'base64')
        throw new ProjectFormatError(`Only a File stored as bytes has Byte edits: ${path}`)
    let current = length
    return value.edits.map((edit: unknown) => {
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
        const size = decodeBase64(insert).length
        if (!remove && !size) throw new ProjectFormatError(`An empty Byte edit for ${path}`)
        if (offset + remove > current)
            throw new ProjectFormatError(`A Byte edit is past the end of ${path}`)
        work.inserted += size
        if (work.inserted > LEGACY_EDIT_BYTE_LIMIT)
            throw new ProjectFormatError(
                `The Byte edits of this Project put in more than ${formatMiB(LEGACY_EDIT_BYTE_LIMIT)}`
            )
        current += size - remove
        if (size !== remove) {
            work.copied += current
            if (work.copied > EDIT_COPY_LIMIT)
                throw new ProjectFormatError(`Too many Byte edits insert or delete in ${path}`)
        }
        return { offset, remove, insert }
    })
}

/** Bytes as text when they decode as UTF-8, else undefined. */
function decodedText(bytes: Uint8Array): string | undefined {
    try {
        return decoder.decode(bytes)
    } catch {
        return undefined
    }
}

/**
 * Bytes as a File: stored as text when they decode as UTF-8, except a BMP, which is stored as
 * bytes even then, since a small and dark one can be all ASCII and would open as text
 * ([pixel-editor-plan.md](../../../../docs/design/pixel-editor-plan.md), decision 3).
 */
export function bytesFile(bytes: Uint8Array): ProjectFile {
    const text = isBmp(bytes) ? undefined : decodedText(bytes)
    if (text !== undefined)
        return checkedRecord(Object.freeze({ encoding: 'plain', content: text }), bytes.length)
    return checkedRecord(
        Object.freeze({ encoding: 'base64', content: encodeBase64(bytes) }),
        bytes.length
    )
}

/**
 * Text as a File, as typing into the editor makes it, without encoding it to check it: text with
 * no unpaired surrogate is valid UTF-8, and its length is counted rather than encoded. Text that
 * starts like a BMP is stored as bytes, as `bytesFile` stores it.
 */
export function textFile(text: string): ProjectFile {
    if (!isWellFormedText(text)) throw new ProjectFormatError('Text contains an unpaired surrogate')
    //a BMP's signature and header size are in its first 18 bytes, which 26 characters cover
    if (text.startsWith('BM') && isBmp(encoder.encode(text.slice(0, 26))))
        return bytesFile(encoder.encode(text))
    return checkedRecord(Object.freeze({ encoding: 'plain', content: text }), utf8Length(text))
}

/**
 * Rebuilds an archive's chosen storage representation without changing any of its bytes: a BMP an
 * older editor stored as text stays text.
 */
export function projectFileFromBytes(bytes: Uint8Array, encoding: FileEncoding): ProjectFile {
    if (encoding === 'plain') {
        const text = decodedText(bytes)
        if (text === undefined) {
            throw new ProjectFormatError('A plain File contains invalid UTF-8')
        }
        return checkedRecord(Object.freeze({ encoding: 'plain', content: text }), bytes.length)
    }
    if (encoding !== 'base64') throw new ProjectFormatError('Invalid file encoding')
    return checkedRecord(
        Object.freeze({ encoding: 'base64', content: encodeBase64(bytes) }),
        bytes.length
    )
}

/**
 * A File's text: its bytes as UTF-8, which they must be. A File stored as text is its content,
 * which decoding its UTF-8 would give back.
 */
export function fileText(file: ProjectFile): string {
    if (file.encoding === 'plain' && (isChecked(file) || isWellFormedText(file.content)))
        return file.content
    try {
        return decoder.decode(fileBytes(file))
    } catch {
        throw new ProjectFormatError('File is not readable UTF-8 text')
    }
}

/**
 * Files as they are saved, each checked and frozen in a frozen map with no prototype, or a
 * `ProjectFormatError`. A record this module made, as this returns and the FileSystem writes them,
 * is kept as it is at whatever path it now has, its bytes and Annotations counted from their
 * stored lengths: a change to one File of a Project costs what that File does, leaves the record
 * of every other, which caches keyed by the record keep finding, and decodes none of them again.
 * A map this returned is returned as it is, so passing one on checks nothing twice.
 */
export function cleanFiles(raw: unknown): ProjectFiles {
    if (checkedMaps.has(raw as object)) return raw as ProjectFiles
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ProjectFormatError('Files must be a path-to-file map')
    const entries = Object.entries(raw)
    if (entries.length > FILE_COUNT_LIMIT)
        throw new ProjectFormatError(`Project exceeds the ${FILE_COUNT_TEXT}-file limit`)
    const files: Record<string, ProjectFile> = Object.create(null)
    let size = 0
    let annotated = 0
    const work: EditWork = { inserted: 0, copied: 0 }
    for (const [path, value] of entries) {
        if (!isValidFilePath(path)) throw new ProjectFormatError(`Invalid file path: ${path}`)
        let file: ProjectFile
        const known = checkedRecords.get(value)
        if (known !== undefined) {
            file = value
            size += known
        } else {
            if (
                !value ||
                typeof value !== 'object' ||
                typeof value.content !== 'string' ||
                !FILE_ENCODINGS.includes(value.encoding)
            ) {
                throw new ProjectFormatError(`Invalid contents or encoding for ${path}`)
            }
            if (value.content.length > (FILE_BYTE_LIMIT * 4) / 3 + 4)
                throw new ProjectFormatError(FILE_LIMIT_MESSAGE)
            let bytes = fileBytes(value)
            //a Project saved before ADR 0063 may keep Byte edits beside the original: the File is
            //the bytes they leave, and keeps none
            const edits = cleanByteEdits(path, value, bytes.length, work)
            if (edits) bytes = applyByteEdits(bytes, edits)
            size += bytes.length
            const annotations = cleanAnnotations(path, value.annotations)
            file = checkedRecord(
                Object.freeze({
                    encoding: value.encoding,
                    content: edits ? encodeBase64(bytes) : value.content,
                    ...(annotations ? { annotations } : {})
                }),
                bytes.length
            )
        }
        if (size > FILE_BYTE_LIMIT) throw new ProjectFormatError(FILE_LIMIT_MESSAGE)
        annotated += annotationsSize(file.annotations)
        //met when a Project is opened or imported: saving is refused earlier, by the FileSystem
        if (annotated > ANNOTATIONS_BYTE_LIMIT)
            throw new ProjectFormatError(
                `This Project can't be opened: it has too many renames and comments (at most ${ANNOTATIONS_LIMIT_TEXT}).`
            )
        files[path] = file
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
    const clean = Object.freeze(files)
    checkedMaps.add(clean)
    return clean
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
    /**
     * The Project's other assembly Files a Build takes as an archive's members, by path in path
     * order (`resolveLinkUnits`): the Core assembles and links one only when it defines a global
     * the program still needs ([ADR 0033](../../../../docs/adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md),
     * 2026-11-03 and 2026-11-04 notes). On MIPS and RISC-V, absent when there are none; on x86
     * always given by a Project's Build, since without it the Core takes every source File.
     */
    linkUnits?: readonly string[]
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
    linkUnits: true,
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
    if (sources.linkUnits) configuration.linkUnits = Object.freeze([...sources.linkUnits])
    return Object.freeze(configuration) as BuildConfiguration
}

export function buildConfigurationsEqual(left: BuildConfiguration, right: BuildConfiguration) {
    return (Object.keys(BUILD_CONFIGURATION_KEYS) as (keyof BuildConfiguration)[]).every((key) => {
        if (key === 'linkUnits') {
            const a = left.linkUnits ?? []
            const b = right.linkUnits ?? []
            return a.length === b.length && a.every((path, index) => path === b[index])
        }
        if (key !== 'compiledLanguages') return left[key] === right[key]
        const a = left.compiledLanguages ?? {}
        const b = right.compiledLanguages ?? {}
        return (
            Object.keys(a).length === Object.keys(b).length &&
            Object.keys(a).every((path) => hasOwn(b, path) && a[path] === b[path])
        )
    })
}

/**
 * A text naming a Build configuration, the same for two that `buildConfigurationsEqual` holds
 * equal, for a saved record to keep in place of the configuration.
 */
export function buildConfigurationKey(configuration: BuildConfiguration): string {
    const values: unknown[] = (
        Object.keys(BUILD_CONFIGURATION_KEYS) as (keyof BuildConfiguration)[]
    )
        //named last, and only when there are any, so a key saved before them names the same
        .filter((key) => key !== 'linkUnits')
        .map((key) => {
            if (key !== 'compiledLanguages') return configuration[key] ?? null
            const languages = configuration.compiledLanguages ?? {}
            return Object.keys(languages)
                .sort()
                .map((path) => [path, languages[path]])
        })
    if (configuration.linkUnits?.length) values.push([...configuration.linkUnits])
    return JSON.stringify(values)
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
            hasOwn(input, 'linkUnits') &&
            (!Array.isArray(input.linkUnits) ||
                input.linkUnits.some(
                    (path) =>
                        typeof path !== 'string' || !isValidFilePath(path) || path === input.entry
                ))
        )
            throw new ProjectFormatError('Invalid linked units')
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
        files: cleanFiles({ ...sources.files, [sources.entry]: textFile(text) })
    })
}

export function sourceText(sources: BuildSources): string {
    const file = sources.files[sources.entry]
    if (!file) throw new ProjectFormatError(`Entry file not found: ${sources.entry}`)
    return fileText(file)
}

/** Line `line`, 0 based, of the File at `path`: '' when there is no such File, line or text. */
export function sourceLineText(sources: BuildSources, path: string, line: number): string {
    const file = sources.files[path]
    if (!file) return ''
    try {
        return fileText(file).split(/\r?\n/)[line] ?? ''
    } catch {
        return ''
    }
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
