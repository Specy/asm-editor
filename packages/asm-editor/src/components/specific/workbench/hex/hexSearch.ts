/**
 * Go to offset and Find in the Hex editor
 * ([file-views.md](../../../../../../../docs/design/file-views.md), decision 9): an offset typed in
 * hex or in decimal, and bytes looked for as hex with `??` wildcards or as text.
 */

export type ParsedOffset = { ok: true; offset: number } | { ok: false; reason: string }

/**
 * An offset as typed: hex, with or without `0x`, or decimal after a `#`, as HxD reads them; inside
 * a File of `size` bytes.
 */
export function parseOffset(text: string, size: number): ParsedOffset {
    const trimmed = text.trim()
    let offset: number
    if (/^#\d+$/.test(trimmed)) offset = Number(trimmed.slice(1))
    else if (/^(0x)?[0-9a-f]+$/i.test(trimmed)) offset = parseInt(trimmed.replace(/^0x/i, ''), 16)
    else return { ok: false, reason: 'Type an offset in hex, or in decimal after #' }
    if (!Number.isSafeInteger(offset) || offset >= size)
        return {
            ok: false,
            reason: size
                ? `${trimmed} is past the end, at 0x${(size - 1).toString(16)}`
                : 'The File is empty'
        }
    return { ok: true, offset }
}

/** Bytes to look for, -1 where any byte matches. */
export type BytePattern = Int16Array

export type ParsedPattern = { ok: true; pattern: BytePattern } | { ok: false; reason: string }

/** Hex bytes as typed, spaces optional (`7f 45 4c 46`, `7f454c46`), `??` matching any byte. */
export function parseHexPattern(text: string): ParsedPattern {
    const digits = text.replace(/[\s,]+/g, '')
    if (!digits) return { ok: false, reason: 'Type the bytes to find' }
    if (digits.length % 2) return { ok: false, reason: 'Each byte is two hex digits, or ??' }
    const pattern = new Int16Array(digits.length / 2)
    for (let index = 0; index < pattern.length; index++) {
        const pair = digits.slice(index * 2, index * 2 + 2)
        if (pair === '??') pattern[index] = -1
        else if (/^[0-9a-f]{2}$/i.test(pair)) pattern[index] = parseInt(pair, 16)
        else return { ok: false, reason: `${pair} is not a hex byte or ??` }
    }
    return { ok: true, pattern }
}

const encoder = new TextEncoder()

/** Text as the bytes it is stored as: its characters in ASCII, UTF-8 beyond it. */
export function textPattern(text: string): ParsedPattern {
    if (!text) return { ok: false, reason: 'Type the text to find' }
    return { ok: true, pattern: Int16Array.from(encoder.encode(text)) }
}

function matchesAt(bytes: Uint8Array, pattern: BytePattern, at: number) {
    if (at < 0 || at + pattern.length > bytes.length) return false
    for (let index = 0; index < pattern.length; index++)
        if (pattern[index] >= 0 && bytes[at + index] !== pattern[index]) return false
    return true
}

/** The first byte the pattern fixes, which the native `indexOf` can skip to. */
function anchorOf(pattern: BytePattern) {
    return pattern.findIndex((value) => value >= 0)
}

/** The first match starting in `[start, stop)`, or -1. */
function scanForward(bytes: Uint8Array, pattern: BytePattern, start: number, stop: number) {
    const anchor = anchorOf(pattern)
    if (anchor < 0) {
        for (let at = start; at < stop; at++) if (matchesAt(bytes, pattern, at)) return at
        return -1
    }
    const value = pattern[anchor]
    for (let found = bytes.indexOf(value, start + anchor); found !== -1;) {
        const at = found - anchor
        if (at >= stop) return -1
        if (matchesAt(bytes, pattern, at)) return at
        found = bytes.indexOf(value, found + 1)
    }
    return -1
}

/** The last match starting in `[stop, start]`, or -1. */
function scanBackward(bytes: Uint8Array, pattern: BytePattern, start: number, stop: number) {
    if (start < stop) return -1
    const anchor = anchorOf(pattern)
    if (anchor < 0) {
        for (let at = start; at >= stop; at--) if (matchesAt(bytes, pattern, at)) return at
        return -1
    }
    const value = pattern[anchor]
    for (let found = bytes.lastIndexOf(value, start + anchor); found !== -1;) {
        const at = found - anchor
        if (at < stop) return -1
        if (matchesAt(bytes, pattern, at)) return at
        if (found === 0) return -1
        found = bytes.lastIndexOf(value, found - 1)
    }
    return -1
}

export type Match = { offset: number; wrapped: boolean }

/** Count a range of match starts; a matching pattern may extend beyond that range. */
function countRange(
    bytes: Uint8Array,
    pattern: BytePattern,
    offset: number,
    start: number,
    stop: number,
    anchor: number
) {
    let index = 0
    let total = 0
    const value = pattern[anchor]
    const candidates = bytes.subarray(start + anchor, stop + anchor)
    for (let found = candidates.indexOf(value); found !== -1;) {
        const at = start + found
        if (matchesAt(bytes, pattern, at)) {
            total++
            if (at === offset) index = total
        }
        found = candidates.indexOf(value, found + 1)
    }
    return { index, total }
}

/** Count overlapping matches and the 1-based position of a known match, without keeping offsets. */
export function countMatches(bytes: Uint8Array, pattern: BytePattern, offset: number) {
    if (!pattern.length || pattern.length > bytes.length) return { index: 0, total: 0 }
    const limit = bytes.length - pattern.length + 1
    const anchor = anchorOf(pattern)
    // Every start fits an all-wildcard pattern; even a huge File needs no scan in this case.
    if (anchor < 0) return { index: offset >= 0 && offset < limit ? offset + 1 : 0, total: limit }
    return countRange(bytes, pattern, offset, 0, limit, anchor)
}

/** Large Files yield between chunks so typing, navigation and cancellation can still run. */
export async function countMatchesAsync(
    bytes: Uint8Array,
    pattern: BytePattern,
    offset: number,
    signal: AbortSignal
) {
    if (signal.aborted) return undefined
    const anchor = anchorOf(pattern)
    if (!pattern.length || pattern.length > bytes.length || anchor < 0)
        return countMatches(bytes, pattern, offset)
    const chunk = 256 * 1024
    const limit = bytes.length - pattern.length + 1
    let index = 0
    let total = 0
    for (let start = 0; start < limit; start += chunk) {
        // Yield before the first chunk too, so the found offset can paint immediately.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        if (signal.aborted) return undefined
        const counts = countRange(
            bytes,
            pattern,
            offset,
            start,
            Math.min(start + chunk, limit),
            anchor
        )
        if (counts.index) index = total + counts.index
        total += counts.total
    }
    return { index, total }
}

/** The first match at or after `from`, wrapping round to the start; undefined when there is none. */
export function findNext(bytes: Uint8Array, pattern: BytePattern, from: number): Match | undefined {
    if (!pattern.length || pattern.length > bytes.length) return undefined
    const start = Math.min(Math.max(0, from), bytes.length)
    const after = scanForward(bytes, pattern, start, bytes.length)
    if (after >= 0) return { offset: after, wrapped: false }
    const before = scanForward(bytes, pattern, 0, start)
    return before >= 0 ? { offset: before, wrapped: true } : undefined
}

/** The last match at or before `from`, wrapping round to the end; undefined when there is none. */
export function findPrevious(
    bytes: Uint8Array,
    pattern: BytePattern,
    from: number
): Match | undefined {
    if (!pattern.length || pattern.length > bytes.length) return undefined
    const last = bytes.length - pattern.length
    const start = Math.min(from, last)
    const before = start >= 0 ? scanBackward(bytes, pattern, start, 0) : -1
    if (before >= 0) return { offset: before, wrapped: false }
    const after = scanBackward(bytes, pattern, last, Math.max(0, start + 1))
    return after >= 0 ? { offset: after, wrapped: true } : undefined
}
