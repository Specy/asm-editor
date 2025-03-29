import { numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'
import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
import type { Interrupt } from '@specy/s68k'

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
    address: number
    sourceAddress: number
    sp: number
    line: number
    color: string
}

export type MemoryTab = {
    id: number
    name: string
    address: number
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
    Long = 4
}

export type RegisterChunk = {
    hex: string
    value: number
    valueSigned: number
    groupSize: number
    prev: {
        hex: string
        value: number
    }
}


export function numbersOfSizeToSlice(numbers: number[], bytes: number, endianess: 'big' | 'little' = 'big') {
    return numbers.flatMap(v => numberToByteSlice(v, bytes, endianess))
}

export function makeRegister(name: string, v: number) {
    let value = $state(v)
    let prev = $state(v)

    function setValue(v: number) {
        prev = value
        value = v
    }

    function toHex() {
        return (value >>> 0).toString(16).padStart(8, '0')
    }

    function toSizedGroups(size: RegisterSize): RegisterChunk[] {
        const groupLength = size === RegisterSize.Byte ? 2 : size === RegisterSize.Word ? 4 : 8
        const hex = toHex()
        const prevHex = (prev >>> 0).toString(16).padStart(8, '0')
        const chunks: RegisterChunk[] = []
        for (let i = 0; i < hex.length; i += groupLength) {
            const groupValue = parseInt(hex.slice(i, i + groupLength), 16)
            chunks.push({
                hex: hex.slice(i, i + groupLength),
                value: groupValue,
                valueSigned: (groupValue << (32 - groupLength * 4)) >> (32 - groupLength * 4),
                groupSize: groupLength,
                prev: {
                    hex: prevHex.slice(i, i + groupLength),
                    value: parseInt(prevHex.slice(i, i + groupLength), 16)
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
              old: number
              size: RegisterSize
          }
      }
    | {
          type: 'WriteMemory'
          value: {
              address: number
              old: number
              size: RegisterSize
          }
      }
    | {
          type: 'WriteMemoryBytes'
          value: {
              address: number
              old: number[]
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
    sp: number
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
    address: number,
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

export function makeLabelColor(index: number, address: number){
    return `hsl(${(index * 137) % 360}, 40%, 60%)`
}

export function makeColorizedLabels(labels: StackFrame[]): ColorizedLabel[]{
    //same address and index should always be the same color
    return labels.map((address, i) => ({
        address: address.address,
        sp: address.sp,
        color: address.color
    }))
}

export type ColorizedLabel = {
    address: number
    sp: number
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
    setGlobalMemoryAddress: (address: number) => void
    setCode: (code: string) => void
    clear: () => void
    setTabMemoryAddress: (address: number, tabId: number) => void
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
}
