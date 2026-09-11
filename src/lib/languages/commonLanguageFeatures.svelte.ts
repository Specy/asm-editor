import { numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'
import type { MarsDisplayConfiguration, ProjectDisplay } from '$lib/languages/mars/marsDisplay'
import type { InjectedPeripheralOptions } from '$lib/languages/peripherals/peripheralSet'
import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
import { unsignedBigIntToSigned } from '$lib/utils'
import type { BuildInput, BuildSources } from '$lib/projectFiles'

export type StatusRegister = {
    name: string
    value: number
    prev: number
}
export type DiagnosticSeverity = 'error' | 'warning' | 'suggestion'
export type SourceBreakpoint = { file: string; line: number }

type DiagnosticBase = {
    file?: string
    lineIndex: number
    /** One-based UTF-16 column, matching Monaco. */
    column: number
    /** One-based, exclusive UTF-16 column. */
    endColumn?: number
    source?: string
    code?: string
    related?: {
        file: string
        lineIndex: number
        column: number
        endColumn: number
        message: string
    }[]
    line: {
        line: string
        line_index: number
    }
    message: string
    /** Actionable help supplied by the Core, shown directly after the message when present. */
    hint?: string
    formatted: string
}

/**
 * A compile/check-time finding. Only `error` severity blocks compilation, the other severities are
 * reported but let the program build and run.
 */
export type Diagnostic =
    | (DiagnosticBase & { severity: 'error' })
    | (DiagnosticBase & { severity: 'warning' })
    | (DiagnosticBase & { severity: 'suggestion' })

export type StackFrame = {
    name: string
    address: bigint
    destination: bigint
    sp: bigint
    line: number
    file?: string
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

export function makeGenericDiagnostic(error: string): Diagnostic {
    return {
        severity: 'error',
        lineIndex: 0,
        column: 0,
        line: {
            line: '',
            line_index: 0
        },
        message: error,
        formatted: error
    }
}
const DIAGNOSTIC_PREFIXES = {
    error: '',
    warning: 'Warning: ',
    suggestion: 'Suggestion: '
} satisfies Record<DiagnosticSeverity, string>

/**
 * Renders a diagnostic as a line of text. Errors stay bare, which is what the panels have always
 * shown, the other severities are announced unless the core already spelled the severity out.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
    const prefix = DIAGNOSTIC_PREFIXES[diagnostic.severity]
    if (!prefix) return diagnostic.formatted
    if (diagnostic.formatted.toLowerCase().startsWith(diagnostic.severity)) {
        return diagnostic.formatted
    }
    return `${prefix}${diagnostic.formatted}`
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
    file?: string
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
    file?: string
    md: string
    /** Generated instructions shown below one original source line, in assembly-address order. */
    instructions?: { address: bigint; code: string }[]
}

export type BuildArtifact = {
    file: string
    /** Zero-based source line. */
    line: number
    address: bigint
    /** Emitted instruction bytes or machine word, written in hexadecimal, when the Core exposes it. */
    opcode?: string
}

export type EmulatorInterrupt = {
    type: string
    message?: string
}

export type BaseEmulatorState = {
    code: string
    systemSize: RegisterSize
    compiledCode?: string
    registers: Register[]
    startingRegisterNames: string[]
    hiddenRegisters: string[]
    decorations: EmulatorDecoration[]
    buildArtifacts: BuildArtifact[]
    statusRegisters: StatusRegister[]
    errors: string[]
    compilerDiagnostics: Diagnostic[]
    terminated: boolean
    latestSteps: ExecutionStep[]
    callStack: StackFrame[]
    line: number
    currentFile: string
    executionTime: number
    sp: bigint
    pc: bigint
    stdOut: string
    canExecute: boolean
    canUndo: boolean
    /**
     * Whether the last Run returned because Pause was requested. The Core is idle and available
     * for Step, Undo or another Run, as after a breakpoint.
     */
    paused: boolean
    breakpoints: SourceBreakpoint[]
    interrupt?: EmulatorInterrupt
    memory: {
        global: MemoryTab
        tabs: MemoryTab[]
    }
}

/**
 * Values `GenericEmulator` derives from `BaseEmulatorState` instead of storing: `compilerErrors` is
 * the error-severity subset of `compilerDiagnostics`, so anything gating on "the code does not
 * compile" stays correct without having to filter by severity itself.
 */
export type BaseEmulatorDerivedState = {
    readonly compilerErrors: Diagnostic[]
    /** Immutable Files and Entry used by the current executable, retained until Stop. */
    readonly buildSources?: BuildSources
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

export function makeLabelColor(index: number, _address: number) {
    return `hsl(${(index * 137) % 360}, 40%, 60%)`
}

export function makeColorizedLabels(labels: StackFrame[]): ColorizedLabel[] {
    //same address and index should always be the same color
    return labels.map((address) => ({
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
    language?: AvailableLanguages
    /** False when a Project-scoped Worker owns live diagnostics for this Emulator. */
    automaticChecking?: boolean
    globalPageSize?: number
    globalPageElementsPerRow?: number
    baseAddress?: bigint
    stackAddress?: bigint
    initialMemoryValue?: number
    /**
     * The Screen, Keyboard, Mouse and clock the Emulator runs on
     * ([ADR 0004](../../../docs/adr/0004-inject-screens-at-emulator-boundary.md)). The GUI creates
     * them so it can bind its widgets to the very instances the Core uses; anything left out is
     * built from the language defaults, which is what every caller that does not care gets.
     */
    peripherals?: InjectedPeripheralOptions
    /**
     * MIPS and RISC-V only: MARS's and RARS's five bitmap-display parameters, from the project the
     * Emulator was opened for. Every other language configures its Screen from the program itself,
     * and an Emulator that is given none starts from MARS's defaults.
     */
    display?: ProjectDisplay
    /**
     * The Screen undo journal's budget in megabytes, a Setting of the Project the Emulator was
     * opened for ([ADR 0014](../../../docs/adr/0014-settings-split-by-effect.md)); the language's
     * default when left out. Changed later with `setScreenHistoryBudgetMb`.
     */
    screenHistoryBudgetMb?: number
    /** FileSystem inverse-history budget in megabytes, applied at Build. */
    fileSystemHistoryBudgetMb?: number
}

export type BaseEmulatorActions = {
    compile: (historySize: number, sourceOverride?: BuildInput) => Promise<void>
    step: () => Promise<boolean>
    run: (haltLimit: number) => Promise<InterpreterStatus>
    setGlobalMemoryAddress: (address: bigint) => void
    setCode: (code: string) => void
    setSources: (sources: BuildInput) => void
    check: () => Promise<Diagnostic[]>
    clear: () => void
    setTabMemoryAddress: (address: bigint, tabId: number) => void
    toggleBreakpoint: (line: number, file?: string) => void
    /** Returns how many instructions were actually rolled back, which can be fewer than asked. */
    undo: (amount?: number) => number
    /**
     * Ends the current Run at its next slice boundary, preserving the program and undo history.
     * Does nothing when no run is in flight.
     */
    pause: () => void
    resetSelectedLine: () => void
    dispose: () => void
    test: (
        sources: BuildInput,
        testcases: Testcase[],
        haltLimit: number,
        historySize?: number
    ) => Promise<TestcaseResult[]>
    getLineFromAddress: (address: bigint) => number
    getSourceLocationFromAddress: (address: bigint) => { file: string; line: number } | null
    readMemoryBytes: (address: bigint, length: number) => Uint8Array
    /**
     * A new Screen undo budget, applied on the next clear, which is what a Build starts with: a
     * Setting takes effect at the next Build and never resizes anything under a running program.
     */
    /** The Entry path of the sources currently set. */
    entry: string
    setScreenHistoryBudgetMb: (megabytes: number) => void
    /** The same for the FileSystem's Undo budget, likewise read by the next Build's session. */
    setFileSystemHistoryBudgetMb: (megabytes: number) => void
    /**
     * MIPS and RISC-V only: applies MARS's five bitmap-display parameters, re-syncing the Screen
     * from memory at once as the tool does. Absent on every other Emulator, whose Screen is the
     * program's to configure.
     */
    setDisplay?: (display: ProjectDisplay) => void
    /**
     * MIPS and RISC-V only: the display the Screen is configured with right now, and whether the
     * last Build read it out of the program's own `@screen` comment directive rather than from the
     * user. The GUI pulls it after a Build so the popover shows what the source asked for.
     */
    getDisplay?: () => MarsDisplayConfiguration
}
