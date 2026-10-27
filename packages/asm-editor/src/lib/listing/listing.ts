import type { DemangledName } from '#lib/languages/demangle/demangledNames.ts'
import { partitionPoint } from '#lib/sorted.ts'
import type { ListingHolders } from './addressNames'

/**
 * What the Listing generator produces, and the lookups the editor needs on it. A Listing is
 * derived from an Executable's (or a library's) bytes whenever it is shown and never saved
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 5).
 */

/** The versions of the invented names' word lists and derivation; each is frozen once released. */
export const LISTING_NAME_VERSIONS = ['v1'] as const
export type ListingNameVersion = (typeof LISTING_NAME_VERSIONS)[number]

/** Indexed by the codes in {@link ListingLines.kinds}. */
export const LISTING_LINE_KINDS = [
    'comment',
    'blank',
    'section',
    'label',
    'instruction',
    'data'
] as const
export type ListingLineKind = (typeof LISTING_LINE_KINDS)[number]
export const LINE_KIND = {
    comment: 0,
    blank: 1,
    section: 2,
    label: 3,
    instruction: 4,
    data: 5
} as const satisfies Record<ListingLineKind, number>

/**
 * One entry per line of the text, in parallel arrays rather than an object per line: libc's
 * Listing has over half a million lines, which the worker posts to the editor's main thread.
 * Addresses are link-time ones, the same whatever the load base; add {@link Listing.base} for the
 * address at run time. Every x86-64 user-space address fits a double exactly.
 */
export type ListingLines = {
    /** Each line's {@link LINE_KIND}. */
    kinds: Uint8Array
    /**
     * Where the line starts: an instruction's or a data line's first byte, the address a label
     * names, a section's start; -1 for a header comment or a blank line.
     */
    addresses: Float64Array
    /** How many bytes the line covers: an instruction's length, a data line's size; 0 otherwise. */
    sizes: Float64Array
    /**
     * Where those bytes are in the file, so `bytes.subarray(offset, offset + size)` are the
     * line's bytes; -1 for a line without any, such as reserved space (`resb`).
     */
    offsets: Float64Array
    /** The lines that cover bytes, in ascending address order: what {@link lineOfAddress} searches. */
    byAddress: Int32Array
}

export type ListingLabelKind = 'function' | 'block' | 'data' | 'string'
/**
 * Where a name comes from: the symbol table, the dynamic symbol table, a PLT stub or a GOT slot
 * named after its relocation, the `__libc_start_main` pattern (`main`), the entry point
 * (`_start`), invented words (`FUN_`, `DAT_`), a string's text (`s_`), or a jump target's number.
 */
export type ListingNameOrigin =
    | 'symbol'
    | 'dynamic'
    | 'plt'
    | 'got'
    | 'main'
    | 'entry'
    | 'invented'
    | 'string'
    | 'block'

export type ListingLabel = {
    /** As defined: `main`, `.LAB_3`, `s_Enter_password`. */
    name: string
    /** As written from anywhere in the Listing: `FUN_brave_otter.LAB_3` for a block, else `name`. */
    fullName: string
    kind: ListingLabelKind
    origin: ListingNameOrigin
    /** Link-time. */
    address: number
    /** The 0-based line that defines it. */
    line: number
    /**
     * The readable forms of a C++ symbol's name, for a label whose raw name the demangler reads
     * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decisions 2 and 5): the
     * raw `name` stays the label, which the text, operands and every lookup use. Its `list` is the
     * function's {@link ListingFunction.list} for a function's label, else its short name. Absent
     * for a renamed label, whose name is the person's: its old forms are in {@link renamed}.
     */
    demangled?: DemangledName
    /**
     * For a label the person renamed
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
     * decisions 6 to 9): `name` is theirs (`.name` for a jump target), which the text, operands and
     * every lookup use, and `from` the name the Listing gave it (`FUN_brave_otter`, `.LAB_3`, a
     * mangled name), whose `origin` this label keeps, with that name's demangled forms, which the
     * hover still gives.
     */
    renamed?: { from: string; demangled?: DemangledName }
    /**
     * The person's name for this label when another label has it (decision 10), as the label
     * would have been named (`.name` for a jump target): it is not applied, and the label keeps
     * the Listing's name until one of the two changes.
     */
    renameConflict?: string
}

export type ListingFunction = {
    /** Its label, the name operands use; other names at the same address are aliases. */
    name: string
    /** Link-time start, and its end, exclusive: the next function's start or its section's end. */
    address: number
    end: number
    /** The 0-based line of its label, and the line after its last one. */
    line: number
    endLine: number
    /**
     * What a list names it by, for a function whose label is demangled: its short name, or where
     * another of the Listing's functions shares that, its signature, then its constructor's or
     * destructor's variant (`listForms`, cpp-demangling.md decision 7). Absent for a raw name and
     * a person's, which `name` is.
     */
    list?: string
}

/**
 * A File's Annotations as its Listing is generated with them
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 6
 * to 12), each kind by link-time address: the person's names for labels (a jump target's without
 * its dot), their line comments, and their function comments by the function's address.
 */
export type ListingAnnotations = {
    names?: ReadonlyMap<number, string>
    comments?: ReadonlyMap<number, string>
    functionComments?: ReadonlyMap<number, string>
}

/** Indexed by the codes in {@link ListingComments.kinds}. */
export const PERSON_COMMENT_KINDS = ['end', 'above', 'function'] as const
export type PersonCommentKind = (typeof PERSON_COMMENT_KINDS)[number]
export const PERSON_COMMENT = {
    /** A short line comment at the end of the line it annotates, after the Listing's own. */
    end: 0,
    /** A line of a longer line comment, above the line it annotates, after that address's labels. */
    above: 1,
    /**
     * A line of a function comment, between the blank line before the function and its labels,
     * or above the line holding its address when no function starts there.
     */
    function: 2
} as const satisfies Record<PersonCommentKind, number>

/**
 * The lines holding a person's comment (decisions 11 and 12), in parallel arrays as
 * {@link ListingLines} are, one entry per line, in ascending line order. A comment written above a
 * line takes lines of its own, of kind `comment` with the address it annotates, covering no bytes,
 * so `byAddress`, {@link lineOfAddress}, Breakpoints and the gutter pass over them.
 */
export type ListingComments = {
    /** The 0-based lines. */
    lines: Int32Array
    /** The link-time address each comment is kept at: a line comment's, a function's. */
    addresses: Float64Array
    /** Each one's {@link PERSON_COMMENT}. */
    kinds: Uint8Array
    /**
     * How many characters the person's part takes at the end of the line, from its semicolon: the
     * same on a line a Debug session patched, which keeps the comment at its end, so where it
     * starts is found from the end of whichever text the line has.
     */
    lengths: Int32Array
}

export type Listing = {
    version: ListingNameVersion
    /** The address the Listing's link-time addresses are shifted by when the program runs. */
    base: number
    text: string
    lines: ListingLines
    /** Every label, in line order. */
    labels: ListingLabel[]
    /** In address order. */
    functions: ListingFunction[]
    /**
     * The named objects and strings, which name an address inside one `name+0xN` and give an
     * operand reaching into a string its comment. Absent from a Listing made by hand.
     */
    holders?: ListingHolders
    /** Link-time entry point, 0 for a library without one. */
    entry: number
    /** Link-time address of `main`, from a symbol or the `__libc_start_main` pattern, if known. */
    main?: number
    /** The lines holding a person's comment, absent when it has none. */
    comments?: ListingComments
}

/**
 * Bytes the generator cannot make a Listing of, with the reason a person can read: the same bytes
 * would fail again. Any other failure, such as the Listing worker dying, may not.
 */
export class ListingError extends Error {
    override name = 'ListingError'
}

/** The line holding the byte at a link-time address, or -1 when no line covers it. */
export function lineOfAddress(listing: Listing, address: number): number {
    const { byAddress, addresses, sizes } = listing.lines
    // The first line ending after the address, if it starts at or below it.
    const at = partitionPoint(
        byAddress.length,
        (k) => addresses[byAddress[k]] + sizes[byAddress[k]] <= address
    )
    return at < byAddress.length && addresses[byAddress[at]] <= address ? byAddress[at] : -1
}

/**
 * The line whose bytes hold the byte at a file offset, through the offset each line keeps of its
 * bytes, or -1 when no line covers it: a header, a table, padding between sections.
 */
export function lineOfFileOffset(listing: Listing, offset: number): number {
    const { byAddress, offsets, sizes } = listing.lines
    for (const line of byAddress) {
        const start = offsets[line]
        if (start >= 0 && offset >= start && offset < start + sizes[line]) return line
    }
    return -1
}

/** The function a 0-based line belongs to, which is what a bare `.LAB_3` on that line means. */
export function functionAtLine(listing: Listing, line: number): ListingFunction | undefined {
    const { functions } = listing
    // Functions are in address order, and so in line order.
    const fn = functions[partitionPoint(functions.length, (i) => functions[i].endLine <= line)]
    return fn && fn.line <= line ? fn : undefined
}

/** The function whose range holds a link-time address, if any. */
export function functionContaining(listing: Listing, address: number): ListingFunction | undefined {
    const { functions } = listing
    const fn = functions[partitionPoint(functions.length, (i) => functions[i].end <= address)]
    return fn && fn.address <= address ? fn : undefined
}

/** The function starting at a link-time address, if any. */
export function functionStartingAt(listing: Listing, address: number): ListingFunction | undefined {
    const { functions } = listing
    const fn = functions[partitionPoint(functions.length, (i) => functions[i].address < address)]
    return fn?.address === address ? fn : undefined
}

/** The link-time address of the instruction on a 0-based line, or undefined for any other line. */
export function instructionAddressAt(listing: Listing, line: number): number | undefined {
    return listing.lines.kinds[line] === LINE_KIND.instruction
        ? listing.lines.addresses[line]
        : undefined
}

/** The index of a 0-based line's entry in {@link Listing.comments}, or -1 when it holds none. */
export function personCommentIndex(listing: Listing, line: number): number {
    const lines = listing.comments?.lines
    if (!lines) return -1
    const at = partitionPoint(lines.length, (i) => lines[i] < line)
    return lines[at] === line ? at : -1
}

/**
 * Where a line is, kept by address rather than by line number, so it is found again in another
 * Listing of the same bytes whose comment lines or names differ: the address the line stands for
 * (its bytes' start, the address its label names or its person's comment annotates), its
 * {@link LINE_KIND}, and which of that address's lines of that kind it is, from 0.
 */
export type ListingPlace = { address: number; kind: number; nth: number }

/**
 * The lines around the line holding an address, first to last: the labels and comments above it,
 * of its own address or of addresses it holds, then itself. For a name of an address no line
 * holds (past its region), its label lines. Empty when the Listing has no line for the address.
 */
function linesAround(listing: Listing, address: number): [first: number, last: number] {
    const { addresses, kinds, sizes } = listing.lines
    let last = lineOfAddress(listing, address)
    let start = address
    let end = address + 1
    if (last >= 0) {
        start = addresses[last]
        end = start + sizes[last]
    } else for (const label of listing.labels) if (label.address === address) last = label.line
    if (last < 0) return [0, -1]
    let first = last
    while (
        first > 0 &&
        (kinds[first - 1] === LINE_KIND.label || kinds[first - 1] === LINE_KIND.comment) &&
        addresses[first - 1] >= start &&
        addresses[first - 1] < end
    )
        --first
    return [first, last]
}

/** A 0-based line's {@link ListingPlace}, undefined for a line standing for no address. */
export function placeOfLine(listing: Listing, line: number): ListingPlace | undefined {
    const { addresses, kinds } = listing.lines
    const address = addresses[line]
    const kind = kinds[line]
    if (!(address >= 0) || kind === LINE_KIND.section || kind === LINE_KIND.blank) return undefined
    const [first] = linesAround(listing, address)
    let nth = 0
    for (let at = first; at < line; ++at) if (kinds[at] === kind && addresses[at] === address) ++nth
    return { address, kind, nth }
}

/**
 * The line of a {@link ListingPlace} in this Listing: the line of its address and kind, the last
 * of them where there are fewer, else the line holding the address; -1 when the Listing has no
 * line for the address.
 */
export function lineOfPlace(listing: Listing, place: ListingPlace): number {
    const { addresses, kinds } = listing.lines
    const [first, last] = linesAround(listing, place.address)
    let found = -1
    let nth = 0
    for (let at = first; at <= last; ++at)
        if (kinds[at] === place.kind && addresses[at] === place.address) {
            found = at
            if (nth++ === place.nth) break
        }
    return found >= 0 ? found : last
}
