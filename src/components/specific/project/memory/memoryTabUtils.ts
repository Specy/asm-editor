import { type DiffedMemory, RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

export function findElInTree(e: HTMLElement, baseId: string) {
    let el = e
    while (el.parentElement) {
        // @ts-ignore
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
