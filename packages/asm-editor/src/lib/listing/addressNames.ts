import { quotedString } from './listingText'

/**
 * How a Listing names an address an operand reaches, shared by the generator and by the lines a
 * patch rewrites, so a patched line names its targets as every other line does
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 7 and 13).
 */

/**
 * The named objects and strings of a Listing, which name an address inside one `name+0xN`: each
 * an ascending list of link-time `[start, end)` pairs, a string's end after its NUL.
 */
export type ListingHolders = { objects: Float64Array; strings: Float64Array }

/** No objects or strings: a Listing made without them names inside nothing. */
export const NO_HOLDERS: ListingHolders = {
    objects: new Float64Array(0),
    strings: new Float64Array(0)
}

/** `[start, end)` pairs, sorted by start, as a {@link ListingHolders} list holds them. */
export function holderRanges(ranges: Iterable<readonly [start: number, size: number]>) {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0])
    const pairs = new Float64Array(sorted.length * 2)
    sorted.forEach(([start, size], i) => {
        pairs[2 * i] = start
        pairs[2 * i + 1] = start + size
    })
    return pairs
}

/** The index of the pair holding an address: the last start at or below it, if it ends after it. */
function pairAt(pairs: Float64Array, address: number): number {
    let low = 0
    let high = pairs.length / 2 - 1
    let found = -1
    while (low <= high) {
        const middle = (low + high) >> 1
        if (pairs[2 * middle] <= address) {
            found = middle
            low = middle + 1
        } else high = middle - 1
    }
    return found >= 0 && address < pairs[2 * found + 1] ? found : -1
}

/** The start of the named object, else of the named string, that holds an address. */
export function holderAt(holders: ListingHolders, address: number): number | undefined {
    for (const pairs of [holders.objects, holders.strings]) {
        const index = pairAt(pairs, address)
        if (index >= 0) return pairs[2 * index]
    }
    return undefined
}

export function offsetName(name: string, offset: number): string {
    return offset ? `${name}+0x${offset.toString(16)}` : name
}

/**
 * What naming an address reads of a Listing, at link-time addresses; `from` is where the operand
 * is written, which decides how a block is named.
 */
export type AddressNaming<From> = {
    /** The name operands use for a label at exactly this address, a block's aside. */
    label(address: number): string | undefined
    /** A jump target's block: `.LAB_n` inside its own function, `FUN_x.LAB_n` from elsewhere. */
    block(address: number, from: From): string | undefined
    /** A name the text was written with, for an address no label names exactly: a patch's. */
    hint?(address: number): string | undefined
    /** The start of the named object or string that holds the address ({@link holderAt}). */
    holder(address: number): number | undefined
    /** The start of the function that holds the address. */
    owner(address: number): number | undefined
}

/**
 * The name of an address: a label at exactly that address, else its block, else a name the text
 * was written with, else `name+0xN` inside a named object or string, else inside a function.
 * Undefined when none applies, and the address is written as a number.
 */
export function nameAddress<From>(
    naming: AddressNaming<From>,
    address: number,
    from: From
): string | undefined {
    const label = naming.label(address)
    if (label !== undefined) return label
    const block = naming.block(address, from)
    if (block !== undefined) return block
    const hinted = naming.hint?.(address)
    if (hinted !== undefined) return hinted
    for (const start of [naming.holder(address), naming.owner(address)]) {
        const name = start === undefined ? undefined : naming.label(start)
        if (name !== undefined) return offsetName(name, address - start!)
    }
    return undefined
}

/**
 * The comment an operand reaching into a string gets: the string from there to its NUL, quoted.
 * `offsetOf` gives the file offset of a link-time address, -1 when the file holds none.
 */
export function stringComment(
    holders: ListingHolders,
    bytes: Uint8Array,
    address: number,
    offsetOf: (address: number) => number
): string | undefined {
    const index = pairAt(holders.strings, address)
    if (index < 0) return undefined
    const from = offsetOf(address)
    if (from < 0) return undefined
    const end = Math.min(bytes.length, from + holders.strings[2 * index + 1] - 1 - address)
    let text = ''
    for (let at = from; at < end; ++at) text += String.fromCharCode(bytes[at])
    return quotedString(text)
}
