import { normalizeComment } from './comments'
import { isFileAddress, type Annotations, type FileAddress } from '#lib/projectFiles.ts'

/**
 * Reading and writing a File's **Annotations**
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 1
 * to 4): global renames, line comments, function comments and local renames, each by a link-time
 * address. Every function here is pure: a write returns a new record, frozen, and undefined once
 * nothing is left, which is how a File with no Annotations keeps none. A write does not check what
 * it is given: the prompts check a name with `globalNameProblem` or `localNameProblem` and a
 * comment with `commentProblem` first, and `FileSystem.annotate` refuses a record that does not
 * hold up, with the same reasons, as a `ProjectFormatError`.
 *
 * Nothing is pruned when it no longer applies (decision 4): a name or a comment stays at its
 * address whatever the bytes there become, and shows again when they bring the address back.
 */

/** The key a link-time address is kept by: `0x` and lower-case hex digits, `0x401136`. */
export function fileAddress(address: number): FileAddress {
    if (!Number.isSafeInteger(address) || address < 0)
        throw new RangeError(`Not a link-time address: ${address}`)
    return `0x${address.toString(16)}`
}

/** The link-time address a key names. */
export function addressOf(key: FileAddress): number {
    if (!isFileAddress(key)) throw new RangeError(`Not a file address: ${key}`)
    return Number(key)
}

type Texts = Readonly<Record<string, string>>
const EMPTY: Texts = Object.freeze(Object.create(null))

function textAt(record: Texts | undefined, key: string): string | undefined {
    return record && Object.hasOwn(record, key) ? record[key] : undefined
}

/** The person's name for the label at `address`, if they gave one. */
export function renamed(annotations: Annotations | undefined, address: number): string | undefined {
    return textAt(annotations?.names, fileAddress(address))
}

/** The person's comment on the line at `address`, if there is one. */
export function commentAt(
    annotations: Annotations | undefined,
    address: number
): string | undefined {
    return textAt(annotations?.comments, fileAddress(address))
}

/** The person's comment on the function at `address`, if there is one. */
export function functionCommentAt(
    annotations: Annotations | undefined,
    address: number
): string | undefined {
    return textAt(annotations?.functionComments, fileAddress(address))
}

/**
 * The person's names for the variables of the function at `functionAddress`, by the decompiler's
 * id for each (decision 15); empty when there are none.
 */
export function localsOf(annotations: Annotations | undefined, functionAddress: number): Texts {
    const locals = annotations?.locals
    const key = fileAddress(functionAddress)
    return locals && Object.hasOwn(locals, key) ? locals[key] : EMPTY
}

/** The person's name for one variable of the function at `functionAddress`, if they gave one. */
export function localName(
    annotations: Annotations | undefined,
    functionAddress: number,
    id: string
): string | undefined {
    return textAt(localsOf(annotations, functionAddress), id)
}

/**
 * One kind of Annotations by link-time address, as a Listing takes them: `addressMap(a?.names)`,
 * `addressMap(a?.comments)`, `addressMap(a?.functionComments)`. In address order.
 */
export function addressMap(record: Readonly<Record<FileAddress, string>> | undefined) {
    const map = new Map<number, string>()
    const entries = Object.entries(record ?? {}).map(([key, text]) => [Number(key), text] as const)
    for (const [address, text] of entries.sort(([left], [right]) => left - right))
        map.set(address, text)
    return map
}

/**
 * What one function's decompilation takes of a File's Annotations, in the shape the decompiler
 * package's options have (decision 17): its renamed locals, the line comments in its range, and
 * its function comment. Addresses are link-time: a caller adds the load base where the program
 * runs at another.
 */
export type FunctionAnnotations = {
    /** In id order. */
    locals: { id: string; name: string }[]
    /** In address order. */
    comments: { address: number; text: string }[]
    functionComment?: string
}

/**
 * {@link FunctionAnnotations} of the function from `start` to `end`, exclusive, as a
 * `ListingFunction` gives them. Its keys are stable, so `JSON.stringify` of the result keys a
 * decompilation by them.
 */
export function forFunction(
    annotations: Annotations | undefined,
    start: number,
    end: number
): FunctionAnnotations {
    const locals = Object.entries(localsOf(annotations, start))
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    const comments = [...addressMap(annotations?.comments)]
        .filter(([address]) => address >= start && address < end)
        .map(([address, text]) => ({ address, text }))
    const functionComment = functionCommentAt(annotations, start)
    return { locals, comments, ...(functionComment !== undefined ? { functionComment } : {}) }
}

/** `record` with `key` set to `value`, or without it for undefined; undefined when left empty. */
function withEntry<T>(
    record: Readonly<Record<string, T>> | undefined,
    key: string,
    value: T | undefined
): Readonly<Record<string, T>> | undefined {
    const next: Record<string, T> = Object.assign(Object.create(null), record)
    if (value === undefined) delete next[key]
    else next[key] = value
    return Object.keys(next).length ? Object.freeze(next) : undefined
}

/** `annotations` with one kind replaced, without empty kinds; undefined when nothing is left. */
function withKind<K extends keyof Annotations>(
    annotations: Annotations | undefined,
    kind: K,
    value: Annotations[K] | undefined
): Annotations | undefined {
    const next: Record<string, unknown> = { ...annotations }
    if (value === undefined) delete next[kind]
    else next[kind] = value
    return Object.keys(next).length ? (Object.freeze(next) as Annotations) : undefined
}

/** `annotations` with the label at `address` named `name`. */
export function rename(annotations: Annotations | undefined, address: number, name: string) {
    return withKind(annotations, 'names', withEntry(annotations?.names, fileAddress(address), name))
}

/** `annotations` without a rename at `address` (decision 10's Reset name). */
export function resetName(annotations: Annotations | undefined, address: number) {
    return withKind(
        annotations,
        'names',
        withEntry(annotations?.names, fileAddress(address), undefined)
    )
}

/**
 * `annotations` with the comment on the line at `address` set to `text`, as `normalizeComment`
 * keeps it; an empty one deletes the comment there.
 */
export function setComment(annotations: Annotations | undefined, address: number, text: string) {
    return withKind(
        annotations,
        'comments',
        withEntry(annotations?.comments, fileAddress(address), normalizeComment(text) || undefined)
    )
}

/** `annotations` with the comment of the function at `address` set to `text`, likewise. */
export function setFunctionComment(
    annotations: Annotations | undefined,
    address: number,
    text: string
) {
    return withKind(
        annotations,
        'functionComments',
        withEntry(
            annotations?.functionComments,
            fileAddress(address),
            normalizeComment(text) || undefined
        )
    )
}

/**
 * `annotations` with variable `id` of the function at `functionAddress` named `name`, or without
 * a name of the person's for it when `name` is undefined.
 */
export function renameLocal(
    annotations: Annotations | undefined,
    functionAddress: number,
    id: string,
    name: string | undefined
) {
    const variables = withEntry(localsOf(annotations, functionAddress), id, name)
    return withKind(
        annotations,
        'locals',
        withEntry(annotations?.locals, fileAddress(functionAddress), variables)
    )
}

/** `annotations` without the person's name for variable `id` of that function (Reset name). */
export function resetLocal(
    annotations: Annotations | undefined,
    functionAddress: number,
    id: string
) {
    return renameLocal(annotations, functionAddress, id, undefined)
}
