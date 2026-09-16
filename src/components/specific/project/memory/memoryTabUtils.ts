import { type DiffedMemory, RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

export function findElInTree(e: HTMLElement, baseId: string) {
    let el = e
    while (el.parentElement) {
        // @ts-ignore -- HTMLCollection is iterable in supported browsers
        for (const child of el.children) {
            if (child.id.startsWith(baseId)) {
                return child
            }
        }
        if (el.id.startsWith(baseId)) {
            return el
        }
        el = el.parentElement
    }
    return null
}

export function getGroupSignedValue(groupValue: bigint, groupLength: bigint, size: RegisterSize) {
    const bits = BigInt(size * 8)
    return (groupValue << (bits - groupLength * 4n)) >> (bits - groupLength * 4n)
}

export function inRange(value: number, start: number, len: number) {
    if (len < 0) {
        return value >= start + len && value <= start
    } else {
        return value >= start && value <= start + len
    }
}

export function byteSliceToNum(bytes: Uint8Array, endianess: 'big' | 'little' = 'big') {
    let num = 0n
    if (endianess === 'big') {
        for (let i = 0; i < bytes.length; i++) {
            num = (num << 8n) | BigInt(bytes[i])
        }
    } else {
        for (let i = bytes.length - 1; i >= 0; i--) {
            num = (num << 8n) | BigInt(bytes[i])
        }
    }
    return num
}
export function numberToByteSlice(
    num: bigint,
    bytes: number,
    endianess: 'big' | 'little' = 'big'
): number[] {
    const arr = new Array(bytes) as number[]
    if (endianess === 'big') {
        for (let i = bytes - 1; i >= 0; i--) {
            arr[i] = Number(num & 0xffn)
            num >>= 8n
        }
    } else {
        for (let i = 0; i < bytes; i++) {
            arr[i] = Number(num & 0xffn)
            num >>= 8n
        }
    }
    return arr
}

export function isMemoryChunkEqual(memory: number[] | Uint8Array, to: number[] | Uint8Array) {
    if (memory.length !== to.length) return false
    for (let i = 0; i < memory.length; i++) {
        if (memory[i] !== to[i]) {
            return false
        }
    }
    return true
}

export function getNumberInRange(
    memory: DiffedMemory,
    start: number,
    len: number,
    endianess: 'big' | 'little'
) {
    const num =
        len < 0
            ? memory.current.slice(start + len, start + 1)
            : memory.current.slice(start, start + len + 1)
    const prev =
        len < 0
            ? memory.prevState.slice(start + len, start + 1)
            : memory.prevState.slice(start, start + len + 1)
    return {
        current: byteSliceToNum(num, endianess),
        prev: byteSliceToNum(prev, endianess),
        len: num.length
    }
}

export function goesNextLineBy(index: number, length: number, rowLength: number) {
    index = index % rowLength
    if (length < 0) {
        return {
            overflows: index + length < 0,
            by: Math.abs(index + length)
        }
    }
    return {
        overflows: index + length >= rowLength,
        by: ((index + length) % rowLength) + 1
    }
}

/** How the memory panel is reading the selected bytes, which is how a Poke typed into it is read back. */
export type MemoryReading = 'hex' | 'char' | 'decimal'

export type ParsedMemoryPoke = { ok: true; bytes: Uint8Array } | { ok: false; reason: string }

/**
 * One commit of the selection popup, turned into the bytes of a Poke
 * ([the design record](../../../../../docs/design/pokes.md)): whatever the popup opened holding
 * reads back as itself, so a single byte is read in the reading its cell shows and a longer
 * selection as the number the popup shows for the run. `0x` is always hexadecimal, a leading `-`
 * is a two's complement value of the selected width, and a value wider than the selection is
 * refused rather than truncated.
 */
export function parseMemoryPoke(
    text: string,
    length: number,
    endianess: 'big' | 'little',
    reading: MemoryReading
): ParsedMemoryPoke {
    if (length <= 0) return { ok: false, reason: 'Nothing is selected' }
    //one character is one byte, and the raw text is read: a space is a character to poke, not
    //padding around a number
    if (reading === 'char' && length === 1) {
        const chars = [...text]
        if (chars.length !== 1) {
            return { ok: false, reason: 'A character Poke takes exactly one character' }
        }
        const code = chars[0].codePointAt(0) ?? 0
        if (code > 0xff) {
            return { ok: false, reason: `${chars[0]} is ${code}, which does not fit a byte` }
        }
        return { ok: true, bytes: Uint8Array.from([code]) }
    }
    const trimmed = text.trim()
    if (trimmed === '') return { ok: false, reason: 'A Poke needs a value' }
    let body = trimmed
    let negative = false
    if (body.startsWith('-')) {
        negative = true
        body = body.slice(1)
    } else if (body.startsWith('+')) {
        body = body.slice(1)
    }
    //a single byte drawn in hex is typed in hex, as it is shown; the number of a longer selection
    //is the decimal the popup shows, unless the value says otherwise with a `0x`
    let hexadecimal = reading === 'hex' && length === 1
    if (/^0x/i.test(body)) {
        hexadecimal = true
        body = body.slice(2)
    }
    const digits = hexadecimal ? /^[0-9a-f]+$/i : /^[0-9]+$/
    if (!digits.test(body)) {
        return {
            ok: false,
            reason: `${trimmed} is not a ${hexadecimal ? 'hexadecimal' : 'decimal'} number`
        }
    }
    let value = BigInt(hexadecimal ? `0x${body}` : body)
    if (negative) value = -value
    const bits = length * 8
    if (value > (1n << BigInt(bits)) - 1n || value < -(1n << BigInt(bits - 1))) {
        return {
            ok: false,
            reason: `${trimmed} does not fit ${length} byte${length === 1 ? '' : 's'}, which is ${bits} bits wide`
        }
    }
    return {
        ok: true,
        bytes: Uint8Array.from(numberToByteSlice(BigInt.asUintN(bits, value), length, endianess))
    }
}
