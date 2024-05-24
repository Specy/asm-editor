import type { DiffedMemory } from '$lib/languages/M68KEmulator'

export function findElInTree(e: HTMLElement, baseId: string) {
    let el = e
    while (el.parentElement) {
        if (el.id.startsWith(baseId)) {
            return el
        }
        el = el.parentElement
    }
    return el
}


export function inRange(value: number, start: number, len: number) {
    if (len < 0) {
        return value >= start + len && value <= start
    } else {
        return value >= start && value <= start + len
    }
}

export function byteSliceToNum(bytes: Uint8Array) {
    return parseInt(Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''), 16)
}

export function getNumberInRange(memory: DiffedMemory, start: number, len: number) {
    const num = len < 0
        ? memory.current.slice(start + len, start + 1)
        : memory.current.slice(start, start + len + 1)
    const prev = len < 0
        ? memory.prevState.slice(start + len, start + 1)
        : memory.prevState.slice(start, start + len + 1)
    return {
        current: byteSliceToNum(num),
        prev: byteSliceToNum(prev),
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
        by: (index + length) % rowLength + 1
    }
}