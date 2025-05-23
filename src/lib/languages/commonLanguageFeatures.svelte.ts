import { numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'
import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
import type { Interrupt } from '@specy/s68k'
import { unsignedBigIntToSigned } from '$lib/utils'

export type StatusRegister = {
    name: string
    value: number
    prev: number
}
export type MonacoError = {
    lineIndex: number
    column: number
    line: {
        line: string
        line_index: number
    }
    message: string
    formatted: string
}

export type StackFrame = {
    name: string
    address: bigint
    destination: bigint
    sp: bigint
    line: number
    color: string
}

export type MemoryTab = {
    id: number
    name: string
    address: bigint
    rowSize: number
    pageSize: number
    endianess: 'big' | 'little'
    data: DiffedMemory
}

export type DiffedMemory = {
    current: Uint8Array
    prevState: Uint8Array
}

export type RegisterHex = [hi: string, lo: string]

export enum RegisterSize {
    Byte = 1,
    Word = 2,
    Long = 4,
    Double = 8
}

export type RegisterChunk = {
    hex: string
    value: bigint
    valueSigned: bigint
    groupSize: bigint
    prev: {
        hex: string
        value: bigint
    }
}

export function numbersOfSizeToSlice(
    numbers: bigint[],
    bytes: number,
    endianess: 'big' | 'little' = 'big'
) {
    return numbers.flatMap((v) => numberToByteSlice(v, bytes, endianess))
}

export function toHexString(_value: bigint | number, _size: bigint | number): string {
    const value = BigInt(_value)
    const size = BigInt(_size)
    const bits = size * 8n
    const mask = (1n << bits) - 1n
    const hexDigits = Number(size * 2n)
    return (value & mask).toString(16).padStart(hexDigits, '0')
}

export function makeRegister(name: string, v: bigint | number, _size: RegisterSize) {
    let value = $state(BigInt(v))
    let prev = $state(BigInt(v))
    let size = $state(BigInt(_size))
    let bits = $derived(size * 8n)

    function setValue(v: number | bigint) {
        prev = value
        value = BigInt(v)
    }

    function toHex() {
        return toHexString(value, size)
    }

    function setSize(newSize: RegisterSize) {
        size = BigInt(newSize)
    }

    function toSizedGroups(groupSize: RegisterSize): RegisterChunk[] {
        const groupLength = BigInt(groupSize) * 2n
        const hex = toHex()
        const prevHex = toHexString(prev, size)
        const chunks: RegisterChunk[] = []
        for (let i = 0n; i < hex.length; i += groupLength) {
            const index = Number(i)
            const offset = Number(i + groupLength)
            const groupValue = BigInt(`0x${hex.slice(index, offset)}`)
            chunks.push({
                hex: hex.slice(index, offset),
                value: groupValue,
                valueSigned: unsignedBigIntToSigned(groupValue, groupSize),
                groupSize: groupLength,
                prev: {
                    hex: prevHex.slice(index, offset),
                    value: BigInt(`0x${prevHex.slice(index, offset)}`)
                }
            })
        }
        return chunks
    }

    return {
        name,
        get value() {
            return value
        },
        get prev() {
            return prev
        },
        setSize,
        setValue,
        toHex,
        toSizedGroups
    }
}

export type ExecutionStep = {
    mutations: MutationOperation[]
    pc: number
    old_ccr: {
        bits: number
    }
    new_ccr: {
        bits: number
    }
    line: number
}

export type MutationOperation =
    | {
          type: 'WriteRegister'
          value: {
              register: string
              old: bigint
              size: RegisterSize
          }
      }
    | {
          type: 'WriteMemory'
          value: {
              address: bigint
              old: bigint
              size: RegisterSize
          }
      }
    | {
          type: 'WriteMemoryBytes'
          value: {
              address: bigint
              old: number[]
          }
      }
    | {
          type: 'PopCallStack'
          value: {
              to: bigint
              from: bigint
          }
      }
    | {
          type: 'PushCallStack'
          value: {
              to: bigint
              from: bigint
          }
      }
    | {
          type: 'Other'
          value: string
      }

export type Register = ReturnType<typeof makeRegister>

export type EmulatorDecoration = {
    type: 'below-line'
    note?: string
    belowLine: number
    md: string
}

export type BaseEmulatorState = {
    code: string
    systemSize: RegisterSize
    compiledCode?: string
    registers: Register[]
    hiddenRegisters: string[]
    decorations: EmulatorDecoration[]
    statusRegisters: StatusRegister[]
    errors: string[]
    compilerErrors: MonacoError[]
    terminated: boolean
    latestSteps: ExecutionStep[]
    callStack: StackFrame[]
    line: number
    executionTime: number
    sp: bigint
    pc: bigint
    stdOut: string
    canExecute: boolean
    canUndo: boolean
    breakpoints: number[]
    interrupt?: Interrupt
    memory: {
        global: MemoryTab
        tabs: MemoryTab[]
    }
}

export enum InterpreterStatus {
    Running = 0,
    Interrupt = 1,
    Terminated = 2,
    TerminatedWithException = 3
}

let currentTabId = 0

export function createMemoryTab(
    pageSize: number,
    name: string,
    address: bigint,
    rowSize: number,
    initialValue: number,
    endianess: 'big' | 'little'
): MemoryTab {
    return {
        name,
        address,
        id: currentTabId++,
        rowSize,
        pageSize,
        endianess,
        data: {
            current: new Uint8Array(pageSize).fill(initialValue),
            prevState: new Uint8Array(pageSize).fill(initialValue)
        }
    }
}

export function makeLabelColor(index: number, address: number) {
    return `hsl(${(index * 137) % 360}, 40%, 60%)`
}

export function makeColorizedLabels(labels: StackFrame[]): ColorizedLabel[] {
    //same address and index should always be the same color
    return labels.map((address, i) => ({
        address: address.address,
        sp: address.sp,
        color: address.color
    }))
}

export type ColorizedLabel = {
    address: bigint
    sp: bigint
    color: string
}

export type EmulatorSettings = {
    globalPageSize?: number
    globalPageElementsPerRow?: number
}

export type BaseEmulatorActions = {
    compile: (historySize: number, codeOverride?: string) => Promise<void>
    step: () => Promise<boolean>
    run: (haltLimit: number) => Promise<InterpreterStatus>
    setGlobalMemoryAddress: (address: bigint) => void
    setCode: (code: string) => void
    clear: () => void
    setTabMemoryAddress: (address: bigint, tabId: number) => void
    toggleBreakpoint: (line: number) => void
    undo: (amount?: number) => void
    resetSelectedLine: () => void
    dispose: () => void
    test: (
        code: string,
        testcases: Testcase[],
        haltLimit: number,
        historySize?: number
    ) => Promise<TestcaseResult[]>
    getLineFromAddress: (address: bigint) => number
}
