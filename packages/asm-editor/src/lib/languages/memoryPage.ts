import type { UnreadableBytes } from './commonLanguageFeatures.svelte'

/**
 * One read of the Core's memory. It throws, or comes back short, when any byte of the range cannot
 * be read: the Cores answer for the whole range at once and do not say which byte failed.
 */
export type MemoryRead = (address: bigint, length: number) => Uint8Array

export type MemoryPage = {
    bytes: Uint8Array
    /** Null when every byte of the page was read. */
    unreadable: UnreadableBytes | null
}

type Attempt = { ok: true; bytes: Uint8Array } | { ok: false; reason: string }

/**
 * A memory view's page, read around the bytes the Core refuses: a page that straddles the edge of
 * a segment, or lies outside memory altogether, shows what can be read and marks the rest, instead
 * of failing as a whole. A readable page is one read. Otherwise each readable run costs a binary
 * search for its length, and each byte that cannot be read one read of its own, since a failed
 * read does not say which byte failed or how far the gap goes: a page entirely outside memory is
 * a read per byte, which `previous` makes a one-off.
 *
 * `previous` is what the last read of this view found unreadable. At the same address, its
 * readable runs are read directly, a read per run, as the memory map does not change while a
 * program runs; if one of them fails after all, the page is searched again from scratch. The
 * unreadable bytes hold `fill`.
 */
export function readMemoryPage(
    read: MemoryRead,
    address: bigint,
    length: number,
    fill: number,
    describe: (error: unknown) => string,
    previous: UnreadableBytes | null = null
): MemoryPage {
    const attempt = (start: number, size: number): Attempt => {
        const at = address + BigInt(start)
        try {
            const bytes = read(at, size)
            if (bytes.length === size) return { ok: true, bytes }
            return { ok: false, reason: `0x${at.toString(16).toUpperCase()} is outside memory` }
        } catch (e) {
            return { ok: false, reason: describe(e) }
        }
    }
    const bytes = new Uint8Array(length).fill(fill)

    if (previous && previous.address === address && previous.mask.length === length) {
        if (readKnownRuns(previous.mask, bytes, attempt)) return { bytes, unreadable: previous }
        bytes.fill(fill)
    }

    if (length === 0) return { bytes, unreadable: null }
    const page = attempt(0, length)
    if (page.ok) return { bytes: page.bytes, unreadable: null }

    const mask = new Uint8Array(length)
    let reason: string | null = null
    let start = 0
    while (start < length) {
        //a byte at a time across what cannot be read, as a failed read does not say how far it goes
        const first = attempt(start, 1)
        if (!first.ok) {
            mask[start] = 1
            reason ??= first.reason
            start++
            continue
        }
        bytes.set(first.bytes, start)
        //a run that reads at a size also reads at every shorter one, so its length is searched for
        //between the longest known to read and the shortest known not to. The rest of the page is
        //tried first, as a run usually reaches the end of it, unless it is the whole page that
        //already failed
        let readable = 1
        let unreadable = start === 0 ? length : length - start + 1
        let size = start === 0 ? (readable + unreadable) >> 1 : length - start
        while (unreadable - readable > 1) {
            const result = attempt(start, size)
            if (result.ok) {
                readable = size
                bytes.set(result.bytes, start)
            } else {
                unreadable = size
            }
            size = (readable + unreadable) >> 1
        }
        start += readable
    }
    return { bytes, unreadable: reason === null ? null : { address, mask, reason } }
}

/** Reads each run of bytes `mask` holds as readable, and whether all of them still were. */
function readKnownRuns(
    mask: Uint8Array,
    bytes: Uint8Array,
    attempt: (start: number, size: number) => Attempt
): boolean {
    let start = 0
    while (start < mask.length) {
        if (mask[start]) {
            start++
            continue
        }
        let end = start
        while (end < mask.length && !mask[end]) end++
        const result = attempt(start, end - start)
        if (!result.ok) return false
        bytes.set(result.bytes, start)
        start = end
    }
    return true
}
