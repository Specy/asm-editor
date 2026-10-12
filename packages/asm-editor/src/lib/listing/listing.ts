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
    /** Link-time entry point, 0 for a library without one. */
    entry: number
    /** Link-time address of `main`, from a symbol or the `__libc_start_main` pattern, if known. */
    main?: number
}

/** The line holding the byte at a link-time address, or -1 when no line covers it. */
export function lineOfAddress(listing: Listing, address: number): number {
    const { byAddress, addresses, sizes } = listing.lines
    let low = 0
    let high = byAddress.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const line = byAddress[middle]
        if (addresses[line] > address) high = middle - 1
        else if (addresses[line] + sizes[line] <= address) low = middle + 1
        else return line
    }
    return -1
}

/** The function a 0-based line belongs to, which is what a bare `.LAB_3` on that line means. */
export function functionAtLine(listing: Listing, line: number): ListingFunction | undefined {
    const { functions } = listing
    // Functions are in address order, and so in line order.
    let low = 0
    let high = functions.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const candidate = functions[middle]
        if (candidate.line > line) high = middle - 1
        else if (candidate.endLine <= line) low = middle + 1
        else return candidate
    }
    return undefined
}
