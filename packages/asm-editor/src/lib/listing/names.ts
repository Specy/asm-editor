import type { ListingNameVersion } from './listing'
import { ADJECTIVES_V1, ANIMALS_V1 } from './words-v1'

/**
 * How the Listing names what the binary leaves unnamed
 * ([ADR 0045](../../../../../docs/adr/0045-invented-names-are-frozen-words-from-file-addresses.md)).
 * The derivation is part of the frozen version, like the word lists:
 *
 * - `h` is FNV-1a 64 over the 8 little-endian bytes of the link-time address.
 * - The name is `<prefix><adjectives[h mod 256]>_<animals[(h >> 8) mod 256]>`.
 * - Names are given in ascending address order. When the name is already taken (by a symbol or an
 *   earlier invented name), `h` becomes FNV-1a 64 over `h`'s own 8 little-endian bytes followed by
 *   a counter byte, 1 on the first retry, 2 on the second, and so on, until a free name comes up.
 * - Only after 255 retries, which needs nearly all 65,536 names taken, the address in hex is
 *   appended to the last name tried.
 */

const WORDS: Record<
    ListingNameVersion,
    { adjectives: readonly string[]; animals: readonly string[] }
> = { v1: { adjectives: ADJECTIVES_V1, animals: ANIMALS_V1 } }

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK = 0xffffffffffffffffn

/** FNV-1a 64 over bytes. */
export function fnv1a64(bytes: ArrayLike<number>): bigint {
    let hash = FNV_OFFSET
    for (let i = 0; i < bytes.length; ++i)
        hash = ((hash ^ BigInt(bytes[i] & 0xff)) * FNV_PRIME) & MASK
    return hash
}

function littleEndian(value: bigint, extra?: number): number[] {
    const bytes: number[] = []
    for (let i = 0n; i < 64n; i += 8n) bytes.push(Number((value >> i) & 0xffn))
    if (extra !== undefined) bytes.push(extra)
    return bytes
}

/**
 * The invented name for a link-time address: `FUN_brave_otter` or `DAT_calm_lynx`. `taken` says
 * whether a name is already in use; the caller asks in ascending address order and records the
 * result.
 */
export function inventName(
    prefix: string,
    address: number,
    taken: (name: string) => boolean,
    version: ListingNameVersion
): string {
    const { adjectives, animals } = WORDS[version]
    let hash = fnv1a64(littleEndian(BigInt(address)))
    let name = ''
    for (let retry = 0; retry <= 255; ++retry) {
        if (retry > 0) hash = fnv1a64(littleEndian(hash, retry))
        name = `${prefix}${adjectives[Number(hash & 0xffn)]}_${animals[Number((hash >> 8n) & 0xffn)]}`
        if (!taken(name)) return name
    }
    return `${name}_${address.toString(16)}`
}

/** What a string's label is made of: Ghidra's `s_` and its first 24 characters as a word. */
export function stringLabelBase(text: string): string {
    const word = text
        .slice(0, 24)
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    return word ? `s_${word}` : ''
}

/** The first of `base`, `base_2`, `base_3`, … that is not taken. */
export function numberedName(base: string, taken: (name: string) => boolean): string {
    if (!taken(base)) return base
    for (let n = 2; ; ++n) if (!taken(`${base}_${n}`)) return `${base}_${n}`
}

/**
 * A symbol's name as the Listing can print it: a name is any bytes in an ELF, and one holding a
 * space, a `;` or a line break would change what the line around it means. Characters outside the
 * ones a NASM identifier may hold become `_`, and a leading `.`, which would make it read as a
 * local label, becomes `_` too.
 */
export function printableSymbolName(name: string): string {
    return name.replace(/[^\w$#@~.?]/g, '_').replace(/^\./, '_')
}
