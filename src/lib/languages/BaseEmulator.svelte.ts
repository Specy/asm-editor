import {
    type Diagnostic,
    type EmulatorDecoration,
    type ExecutionStep,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import type { ExecutionSlice, ExecutionSliceRequest } from '$lib/languages/ExecutionSlice'
import type { Testcase } from '$lib/Project.svelte'
import type { BuildSources } from '$lib/projectFiles'

type MaybePromise<T> = T | PromiseLike<T>

export type CompilationError = {
    type: 'raw'
    message: string
}

/**
 * A successful assembly may still carry warnings/suggestions, a failed one carries the whole list
 * (errors *and* warnings) so nothing the assembler said is lost.
 */
export type CompileResult =
    | { ok: true; diagnostics?: Diagnostic[] }
    | { ok: false; diagnostics: Diagnostic[]; report: string }

/**
 * Thrown by `compile()` when the assembler reported error-severity diagnostics (as opposed to the
 * emulator itself blowing up). These already live in `state.compilerDiagnostics` and are rendered
 * from there, so they must NOT also be pushed into `state.errors` — the legacy emulators rejected
 * the compile promise without ever touching `state.errors`.
 */
export class CompilationFailedError extends Error {
    readonly diagnostics: Diagnostic[]

    constructor(report: string, diagnostics: Diagnostic[]) {
        super(report)
        this.name = 'CompilationFailedError'
        this.diagnostics = diagnostics
    }
}

export enum EmulatorStatus {
    Terminated = 0,
    Running = 1
}

export type Instruction = {
    address: bigint
    lineNumber: number
    file: string
    code: string
}

export type EmulatorConfig<R extends string> = {
    systemSize: RegisterSize
    registerNames: R[]
    endianness?: 'little' | 'big'
    hiddenRegisters?: R[]
}

export abstract class BaseEmulator<R extends string> {
    protected _registerNames: R[]
    protected _systemSize: RegisterSize
    protected _endianness: 'little' | 'big'

    constructor(options: EmulatorConfig<R>) {
        this._registerNames = options.registerNames
        this._systemSize = options.systemSize
        this._endianness = options.endianness ?? 'little'
    }

    getSystemSize(): RegisterSize {
        return this._systemSize
    }

    getEndianness(): 'little' | 'big' {
        return this._endianness
    }

    getRegisterNames(): R[] {
        return this._registerNames
    }

    abstract _initialize(undoSize: number): void

    abstract _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string }

    abstract _runTestcase(testcase: Testcase, haltLimit: number): MaybePromise<void>

    abstract _dispose(): void

    abstract _stringifyError(error: unknown, line?: number): string

    /**
     * `undoSize` is the requested undo-history depth for the program being assembled. It is passed
     * here (and not only to `_initialize`) because some cores allocate their backstep buffer during
     * assembly and therefore have to be told the depth *before* the code is assembled (MIPS).
     * Languages whose core does not care can ignore the parameter.
     */
    abstract _compile(sources: BuildSources, undoSize: number): MaybePromise<CompileResult>

    abstract _checkCode(sources: BuildSources): MaybePromise<Diagnostic[]>

    /** Restores one CPU instruction and its associated peripheral effects. */
    abstract _undo(): void

    /** Preflights both the CPU record and every peripheral effect belonging to it. */
    abstract _canUndo(): boolean

    abstract _step(): Promise<{ terminated: boolean }>

    abstract _getStatus(): EmulatorStatus

    abstract _writeMemoryBytes(address: bigint, data: Uint8Array): void

    abstract _readMemoryBytes(address: bigint, length: bigint): Uint8Array

    abstract _getNextInstruction(): Instruction | null

    _getLastInstruction?(): Instruction | null

    abstract _getUndoHistory(max: number): ExecutionStep[]

    abstract _getPc(): bigint

    abstract _getSp(): bigint

    abstract _getFlags(): { name: string; value: number; prev?: number }[]

    abstract _getCallStack(): StackFrame[]

    abstract _getInstructionAt(address: bigint): Instruction | null

    abstract _getRegisterValues(): bigint[]

    abstract _getRegisterValuesRecord(): Record<R, bigint>

    abstract _getRegisterValue(register: R, size?: RegisterSize): bigint

    abstract _setRegisterValue(register: R, value: bigint, size?: RegisterSize): void

    abstract _hasTerminated(): boolean

    /**
     * Runs one scheduling slice ([ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)):
     * the Core executes at most `instructionBudget` instructions, aiming to come back within
     * `timeBudgetMs`, and the answer says why it stopped and how much it ran. `GenericEmulator`
     * loops over slices, yields to the host between them and keeps the overall limit across them,
     * so an adapter must never run a whole program here.
     */
    abstract _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice>

    /**
     * Called after the Core has been rolled back by `undo`, for adapters whose Screen image lives in
     * Core memory: the Core's own rollback already restored the pixels, so the Screen re-reads the
     * mapped region instead of journaling them
     * ([ADR 0005](../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    _resyncScreenFromMemory?(): void
}
