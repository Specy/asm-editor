import type { DecompiledLine, DecompiledToken, DecompiledVariable } from '@specy/decompiler'
import {
    globalNameProblem,
    libraryNameProblem,
    localNameProblem,
    type NamedLabel
} from '#lib/annotations/names.ts'
import {
    functionAtLine,
    LINE_KIND,
    PERSON_COMMENT,
    personCommentIndex,
    type Listing,
    type ListingFunction,
    type ListingLabel
} from '#lib/listing/listing.ts'
import { ListingIndex, listingTokenAt } from '#lib/listing/listingNavigation.ts'
import { listingLabelOfTarget } from '#lib/pseudocode/pseudocodeMap.ts'

/**
 * What Rename… and Comment… act on at a line of an Executable's own Listing or of its Pseudocode
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 6,
 * 7, 10 to 12 and 14): the label a name under the cursor or a label's line means, a variable of
 * the function a Pseudocode shows, and the address a line's comment is kept at. Lines and columns
 * are 0-based.
 */

/** A 0-based line's text, as the Listing writes it. */
function lineText(listing: Listing, line: number): string {
    const index = ListingIndex.of(listing)
    const start = index.offsetOfLine(line)
    const end = index.offsetOfLine(line + 1)
    return listing.text.slice(start, end > start && listing.text[end - 1] === '\n' ? end - 1 : end)
}

/** The labels at a link-time address, in line order. */
function labelsAt(listing: Listing, address: number): ListingLabel[] {
    return listing.labels.filter((label) => label.address === address)
}

/**
 * The label a rename at an address renames: the name operands use there, the last of its labels
 * that is no jump target (aliases come first, decision 6); a jump target's own.
 */
function renamedLabelAt(listing: Listing, label: ListingLabel): ListingLabel {
    if (label.kind === 'block') return label
    const named = labelsAt(listing, label.address).filter((each) => each.kind !== 'block')
    return named.at(-1) ?? label
}

/**
 * The label Rename… at a line and column renames: on a label's line, the name operands use at its
 * address; elsewhere the label named under the cursor, `call main`'s `main` or `jne .LAB_2`'s
 * `.LAB_2`, but no word of a comment. Undefined where there is none.
 */
export function labelToRename(
    listing: Listing,
    line: number,
    column: number
): ListingLabel | undefined {
    const { kinds } = listing.lines
    if (line < 0 || line >= kinds.length) return undefined
    if (kinds[line] === LINE_KIND.label) {
        const defined = listing.labels.find((label) => label.line === line)
        return defined && renamedLabelAt(listing, defined)
    }
    const text = lineText(listing, line)
    const token = listingTokenAt(text, column)
    const index = ListingIndex.of(listing)
    if (
        !token ||
        index.inPersonComment(text, line, token.start) ||
        index.inDemangledComment(text, line, token.start)
    )
        return undefined
    const label = index.label(token.text, line)
    return label && renamedLabelAt(listing, label)
}

/** What a rename of one label needs: the name it has, the one it was given, what it may not be. */
export type RenameTarget = {
    label: ListingLabel
    /** Link-time. */
    address: number
    /** A jump target, written `.name` in its function, whose rename is kept without the dot. */
    jumpTarget: boolean
    /** The name the Listing gave it, as typed: a jump target's without its dot. */
    raw: string
    /** The name it has now, likewise. */
    current: string
    /**
     * Why it cannot be renamed at all: a PLT stub or a GOT slot is named after the library symbol
     * the dynamic linker binds there (decision 6).
     */
    refusal?: string
    /**
     * The labels its name must differ from (decision 7), at run-time addresses, as the Listing's
     * gutter gives them, which a refusal names.
     */
    labels: readonly NamedLabel[]
    /** Its run-time address, by which its own labels are told from the others. */
    runTimeAddress: number
}

const withoutDot = (name: string) => (name.startsWith('.') ? name.slice(1) : name)

export function renameTarget(listing: Listing, label: ListingLabel): RenameTarget {
    const jumpTarget = label.kind === 'block'
    const raw = label.renamed?.from ?? label.name
    const owner = jumpTarget ? functionAtLine(listing, label.line) : undefined
    const library =
        libraryNameProblem(label.name) ??
        (label.origin === 'plt' || label.origin === 'got'
            ? `${label.name.replace(/@.*$/, '')} is named by the library it comes from`
            : undefined)
    return {
        label,
        address: label.address,
        jumpTarget,
        raw: jumpTarget ? withoutDot(raw) : raw,
        current: jumpTarget ? withoutDot(label.name) : label.name,
        ...(library ? { refusal: library } : {}),
        labels: (owner
            ? listing.labels.filter((each) => each.line >= owner.line && each.line < owner.endLine)
            : listing.labels
        ).map((each) => ({ name: each.name, address: each.address + listing.base })),
        runTimeAddress: label.address + listing.base
    }
}

/**
 * A name as the person typed it, as it is kept: without the blanks around it, and a jump target's
 * without the dot it may be typed with.
 */
export function typedName(target: RenameTarget, typed: string): string {
    const name = typed.trim()
    return target.jumpTarget ? withoutDot(name) : name
}

/**
 * Why a typed name cannot be given, as the prompt says it under the field, or undefined when it
 * can: the name the Listing gave the label always can, which resets it (decision 10).
 */
export function renameProblem(target: RenameTarget, typed: string): string | undefined {
    if (target.refusal) return target.refusal
    const name = typedName(target, typed)
    if (name === target.raw) return undefined
    return globalNameProblem(name, target.labels, target.runTimeAddress, {
        jumpTarget: target.jumpTarget
    })
}

/** What a comment is kept on: a line, by the address it is at, or a function, by its own. */
export type CommentTarget = {
    kind: 'comment' | 'function comment'
    /** Link-time. */
    address: number
    /** The function a function comment is for, when one starts at the address. */
    function?: ListingFunction
}

function functionComment(listing: Listing, address: number): CommentTarget {
    const fn = listing.functions.find((each) => each.address === address)
    return { kind: 'function comment', address, ...(fn ? { function: fn } : {}) }
}

/**
 * What Comment… on a line edits (decisions 11 and 12): a line holding a person's comment, the
 * comment it holds, by the address it is kept at, a function comment's line the function
 * comment; a function's label line its function comment; any other line with an address the
 * comment at it, or one kept at an address inside its bytes, which shows on it (decision 4).
 * Undefined for a line with none: a blank, a section, the header.
 */
export function commentTarget(listing: Listing, line: number): CommentTarget | undefined {
    const { kinds, addresses, sizes } = listing.lines
    if (line < 0 || line >= kinds.length) return undefined
    const comments = listing.comments
    const at = personCommentIndex(listing, line)
    if (at >= 0 && comments)
        return comments.kinds[at] === PERSON_COMMENT.function
            ? functionComment(listing, comments.addresses[at])
            : { kind: 'comment', address: comments.addresses[at] }
    const kind = kinds[line]
    const address = addresses[line]
    if (!(address >= 0) || kind === LINE_KIND.section || kind === LINE_KIND.blank) return undefined
    if (kind === LINE_KIND.label) {
        const fn = functionAtLine(listing, line)
        if (fn?.address === address) return functionComment(listing, address)
        return { kind: 'comment', address }
    }
    if (kind !== LINE_KIND.instruction && kind !== LINE_KIND.data) return undefined
    //a comment kept inside the line's bytes is the one it shows, above it or at its end
    const end = address + sizes[line]
    if (comments)
        for (let k = 0; k < comments.addresses.length; k++) {
            const kept = comments.addresses[k]
            if (comments.kinds[k] !== PERSON_COMMENT.function && kept > address && kept < end)
                return { kind: 'comment', address: kept }
        }
    return { kind: 'comment', address }
}

/**
 * What Function comment… on a line edits: the comment of the function the line is in, unless
 * Comment… on the line edits it already (its label's line, or its comment's own).
 */
export function functionCommentTarget(listing: Listing, line: number): CommentTarget | undefined {
    if (commentTarget(listing, line)?.kind === 'function comment') return undefined
    const fn = functionAtLine(listing, line)
    return fn && functionComment(listing, fn.address)
}

/**
 * The name Rename… at a line and column of a function's Pseudocode renames: a function's or a
 * global's, which refers to its `target`, or one of the function's variables, by its `variable`
 * id; a position just after one is on it, as for Go to Definition. Never a string, whose text is
 * no name, a `goto` label (a renamed jump target shows in the Listing only), or a comment's word.
 */
export function pseudocodeNameToRename(
    lines: readonly DecompiledLine[],
    firstLine: number,
    line: number,
    column: number
): DecompiledToken | undefined {
    const named = (lines[line - firstLine]?.tokens ?? []).filter(
        (token) =>
            token.kind !== 'comment' &&
            (token.variable !== undefined ||
                (token.target !== undefined &&
                    (token.kind === 'function' || token.kind === 'variable')))
    )
    return (
        named.find((token) => token.start <= column && column < token.end) ??
        named.find((token) => token.end === column)
    )
}

/**
 * The label of the Listing a function or global named at a line and column of its Pseudocode
 * stands for, which Rename… there renames as the Listing's would: the name operands use at its
 * address. Undefined for a variable, or a name of no label.
 */
export function pseudocodeLabelToRename(
    listing: Listing,
    lines: readonly DecompiledLine[],
    firstLine: number,
    line: number,
    column: number
): ListingLabel | undefined {
    const target = pseudocodeNameToRename(lines, firstLine, line, column)?.target
    const label = target === undefined ? undefined : listingLabelOfTarget(listing, target)
    return label && label.kind !== 'block' ? renamedLabelAt(listing, label) : undefined
}

/**
 * What a rename of one of a function's variables or parameters needs (decisions 6, 7, 10 and 16):
 * the names it has and had, the names it may not take, and why it cannot be renamed at all.
 */
export type VariableRenameTarget = {
    /** The function's link-time address, under which its variables' names are kept. */
    functionAddress: number
    /** The decompiler's id for the variable (decision 15). */
    id: string
    parameter: boolean
    /** The name the Pseudocode prints for it now. */
    current: string
    /**
     * The name the decompiler gives it, where known: the one printed, before the person named it,
     * or as an earlier decompilation printed it. Typing it resets the variable's name.
     */
    raw?: string
    /**
     * Why it cannot be renamed at all: a parameter a C declaration names, which the decompiler
     * keeps (`puts(char *s)`).
     */
    refusal?: string
    /** The names of the function's other variables, as printed, which it must differ from. */
    variables: readonly string[]
    /** Every label name of the Listing, which a variable must not hide. */
    globals: readonly string[]
}

/**
 * The rename of variable `id` of the function `fn` of a Pseudocode: its name as `variables`
 * reports it (`printed` when the decompiler reports none), the decompiler's own name for it when
 * `raw` knows it, refused for a parameter the function's declaration names.
 */
export function variableRenameTarget(
    listing: Listing,
    fn: Pick<ListingFunction, 'address' | 'name' | 'list'>,
    variables: readonly DecompiledVariable[],
    id: string,
    { printed, raw }: { printed: string; raw?: string }
): VariableRenameTarget {
    const variable = variables.find((each) => each.id === id)
    const current = variable?.name ?? printed
    return {
        functionAddress: fn.address,
        id,
        parameter: variable?.kind === 'parameter',
        current,
        ...(raw !== undefined ? { raw } : {}),
        ...(variable?.locked
            ? {
                  refusal: `${current} is named by the C declaration of ${fn.list ?? fn.name}, so it keeps that name`
              }
            : {}),
        variables: variables.filter((each) => each.id !== id).map((each) => each.name),
        globals: listing.labels.map((label) => label.name)
    }
}

/**
 * Why a typed name cannot be a variable's, as the prompt says it under the field, or undefined
 * when it can: the decompiler's own name for it always can, which resets it.
 */
export function variableRenameProblem(
    target: VariableRenameTarget,
    typed: string
): string | undefined {
    if (target.refusal) return target.refusal
    const name = typed.trim()
    if (target.raw !== undefined && name === target.raw) return undefined
    return localNameProblem(name, target.variables, target.globals)
}
