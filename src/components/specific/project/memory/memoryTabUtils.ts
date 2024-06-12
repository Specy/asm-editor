import type { DiffedMemory } from '$lib/languages/M68KEmulator'
import { Size } from '@specy/s68k'

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



export function getGroupSignedValue(groupValue: number, groupLength: number) {
    return groupValue << (32 - groupLength * 4) >> (32 - groupLength * 4)
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
export function numberToByteSlice(num: number, bytes: number) {
    const hex = num.toString(16).padStart(bytes * 2, '0')
    const arr = []
    for (let i = 0; i < hex.length; i += 2) {
        arr.push(parseInt(hex.slice(i, i + 2), 16))
    }
    return arr

}


export function isMemoryChunkEqual(memory: number[] | Uint8Array, to: number[] | Uint8Array){
    if (memory.length !== to.length) return false
    for (let i = 0; i < memory.length; i++) {
        if (memory[i] !== to[i]) {
            return false
        }
    }
    return true

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