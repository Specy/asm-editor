import {
    type Diagnostic,
    type EmulatorDecoration,
    type ExecutionStep,
    type RegisterFileDescriptor,
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
    /**
     * The Register files this adapter exposes *beyond* the CPU one, which `GenericEmulator` builds
     * from `registerNames` itself. An adapter that declares any must implement
     * `_getRegisterFileValues` (and `_getRegisterFileFlags` when a file names flags).
     */
    registerFiles?: RegisterFileDescriptor[]
}

export abstract class BaseEmulator<R extends string> {
    protected _registerNames: R[]
    protected _systemSize: RegisterSize
    protected _endianness: 'little' | 'big'
    protected _registerFiles: RegisterFileDescriptor[]

    constructor(options: EmulatorConfig<R>) {
        this._registerNames = options.registerNames
        this._systemSize = options.systemSize
        this._endianness = options.endianness ?? 'little'
        this._registerFiles = options.registerFiles ?? []
    }

    /** The declared Register files other than the CPU one, in the order the panel shows them. */
    getRegisterFileDescriptors(): RegisterFileDescriptor[] {
        return this._registerFiles
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

    /**
     * The values of one declared Register file, as unsigned bit patterns in the order the
     * descriptor lists its registers. Called once per file per panel refresh, so an adapter reads
     * the whole file out of its Core in one flat call
     * ([ADR 0021](../../../docs/adr/0021-register-files-from-core-exports.md)) instead of a call
     * per register. Required of any adapter that declares a file, and it has to be a method rather
     * than a field holding an arrow function: `GenericEmulator` builds the files from its own
     * constructor, which runs before a subclass's field initialisers, so a hook written as a
     * property is still undefined at the moment it is demanded.
     */
    _getRegisterFileValues?(id: string): bigint[]

    /**
     * The Status flags of one declared Register file, in `flagNames` order. `prev` is optional: a
     * Core that does not remember the previous value leaves it out and `GenericEmulator` diffs
     * against what the flag held at the last refresh, as it does for a register. Required of any
     * adapter whose files name flags, and refused at construction when one of them does not, so it
     * has to be a method and not an arrow-function field for the same reason as the one above.
     */
    _getRegisterFileFlags?(id: string): { name: string; value: number; prev?: number }[]

    /**
     * Which registers of one declared Register file hold no value at this refresh, in descriptor
     * order, for a file whose registers can be empty rather than zero: the x87 stack, whose tag
     * word says which slots are live. Optional; a file that never blanks needs nothing.
     */
    _getRegisterFileBlanks?(id: string): boolean[]

    /** Writes one register of a declared Register file, named as the descriptor names it. */
    _setRegisterFileValue?(id: string, register: string, value: bigint): void

    /**
     * Opens the Core's Poke transaction ([ADR 0022](../../../docs/adr/0022-core-native-poke-records.md)):
     * everything written through `_setRegisterValue`, `_setRegisterFileValue` and
     * `_writeMemoryBytes` until `_endPoke` is journaled as one entry of the Core's own Undo
     * history, instead of being the direct write those setters are outside a transaction, which is
     * what a Testcase's starting values rely on.
     */
    abstract _beginPoke(): void

    /** Closes it, answering whether the Core recorded an entry (a history of 0 records nothing). */
    abstract _endPoke(): boolean

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
