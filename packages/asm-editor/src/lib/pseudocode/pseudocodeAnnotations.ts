import type { DecompileOptions } from '@specy/decompiler'
import {
    addressMap,
    functionCommentAt,
    localsOf,
    type FunctionAnnotations
} from '#lib/annotations/annotations.ts'
import type { Annotations } from '#lib/projectFiles.ts'
import { partitionPoint } from '#lib/sorted.ts'

/**
 * What one function's decompilation takes of a File's **Annotations**
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions
 * 13 to 17): its renamed locals, the line comments in its address range and its function comment,
 * passed with each call rather than in the program, so a comment or a local's name never reopens
 * a program and keys only its own function's Pseudocode.
 */

type Comments = { addresses: number[]; texts: string[] }

/** A record's line comments in address order, kept per record: a batch reads them per function. */
const sortedComments = new WeakMap<object, Comments>()

function commentsOf(record: Annotations['comments']): Comments {
    if (!record) return { addresses: [], texts: [] }
    let sorted = sortedComments.get(record)
    if (!sorted) {
        const map = addressMap(record)
        sorted = { addresses: [...map.keys()], texts: [...map.values()] }
        sortedComments.set(record, sorted)
    }
    return sorted
}

/**
 * {@link FunctionAnnotations} of the function from `start` to `end`, exclusive, at link-time
 * addresses, as a `ListingFunction` gives them, with a record's comments sorted once rather than
 * for each function. Its keys are stable, so `JSON.stringify` of the result keys a decompilation
 * by them.
 */
export function functionAnnotations(
    annotations: Annotations | undefined,
    start: number,
    end: number
): FunctionAnnotations {
    const locals = Object.entries(localsOf(annotations, start))
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    const { addresses, texts } = commentsOf(annotations?.comments)
    const comments: FunctionAnnotations['comments'] = []
    const first = partitionPoint(addresses.length, (i) => addresses[i] < start)
    for (let i = first; i < addresses.length && addresses[i] < end; i++)
        comments.push({ address: addresses[i], text: texts[i] })
    const functionComment = functionCommentAt(annotations, start)
    return { locals, comments, ...(functionComment !== undefined ? { functionComment } : {}) }
}

/** Whether a function has nothing of the person's for the decompiler. */
export function noFunctionAnnotations(own: FunctionAnnotations): boolean {
    return !own.locals.length && !own.comments.length && own.functionComment === undefined
}

/**
 * A stable text of a function's Annotations, which keys its Pseudocode: empty for none, so a
 * function without any keeps the key it had before Annotations existed.
 */
export function functionAnnotationsKey(own: FunctionAnnotations): string {
    return noFunctionAnnotations(own) ? '' : JSON.stringify(own)
}

// The decompiler's shape of a variable id (`VARIABLE_ID` in `@specy/decompiler`, from
// `host/src/markup.hh`'s `variableId`), which the package refuses any other id against with a
// `RangeError`. A File keeps ids as opaque text, so one of another shape (a hand-edited archive)
// is left out here, as an id naming no variable is ignored, rather than failing the function.
const HEX = '0x[0-9a-f]+'
const STORAGE = `(?!hash:)[A-Za-z_][A-Za-z0-9_]*:-?${HEX}`
const PIECE = `${STORAGE}:[1-9][0-9]*`
const USE = `@[+-]${HEX}`
const VARIABLE_ID = new RegExp(
    `^(?:hash:${HEX}${USE}|(?:${STORAGE}|join\\(${PIECE}(?:\\+${PIECE})+\\))(?::[1-9][0-9]*${USE})?)$`
)

/** Whether the decompiler takes `id` as a variable id. */
export function isDecompilerVariableId(id: string): boolean {
    return VARIABLE_ID.test(id)
}

/**
 * The decompiler's options for a function's Annotations, its comments at the image's addresses
 * (the link-time ones shifted by `base`, as the client shifts the function's), comments that no
 * statement holds listed at the top (decision 13), so none a person wrote is hidden. Undefined
 * when there are none, so the package decompiles as it did before Annotations, byte for byte.
 */
export function annotationOptions(
    own: FunctionAnnotations,
    base: number
): DecompileOptions | undefined {
    const locals = own.locals.filter(({ id, name }) => name !== '' && isDecompilerVariableId(id))
    const comments = own.comments.map(({ address, text }) => ({ address: address + base, text }))
    const { functionComment } = own
    if (!locals.length && !comments.length && functionComment === undefined) return undefined
    return {
        ...(locals.length ? { locals } : {}),
        ...(comments.length ? { comments, unplacedComments: true } : {}),
        ...(functionComment !== undefined ? { functionComment } : {})
    }
}
