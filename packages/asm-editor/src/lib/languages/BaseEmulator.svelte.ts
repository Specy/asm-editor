import {
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorNote,
    type ExecutionStep,
    type RegisterFileDescriptor,
    RegisterSize,
    type SourceBreakpoint,
    type StackFrame
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { ExecutionSlice, ExecutionSliceRequest } from '#lib/languages/ExecutionSlice.ts'
import type { Termination } from '#lib/languages/termination.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'

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
    | {
          ok: true
          diagnostics?: Diagnostic[]
          /**
           * The executable the Build linked, for a Target whose Builds link one (x86): the Build
           * output, at the path the Command line names ([ADR 0050](../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)).
           * None for a Build that loaded an Executable, which is a File already.
           */
          program?: Uint8Array
          /**
           * The Runtime library members or the start code the program was linked with, which the
           * debugger opens as `buildLibraryFiles`.
           */
          libraryFiles?: ProjectFiles
          /** What the Log should say about the program built, such as a library it lacks. */
          notes?: Omit<EmulatorNote, 'id'>[]
      }
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

/**
 * Thrown by `compile()` when the Build could not download something it needs, such as one of the
 * x86 Core's Bundled libraries or its assembler: the request failed, or nothing arrived for a while.
 * Nothing is wrong with the program, so its message names what could not be downloaded and says
 * to Build again ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decision 2), in the Terminal, the Log and the toast alike. When the server `refused` it, with a
 * status such as 404, the connection is fine and the same request fails again: the site has most
 * likely been updated since the page loaded, its files renamed, and reloading the page fetches the
 * new names.
 */
export class BuildDownloadError extends Error {
    constructor(problem: string, options?: ErrorOptions & { refused?: boolean }) {
        super(
            `${problem}. ${options?.refused ? 'Reload the page' : 'Check the connection'} and Build again.`,
            options
        )
        this.name = 'BuildDownloadError'
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

    /**
     * Loads what checking and building these sources needs besides the Files, such as a Runtime
     * library, before any Core is touched: live checking calls it before it waits for an idle Core
     * and Build before `_compile`, so `_checkCode` and `_compile` stay synchronous from creating a
     * Core to assembling it, which the MARS and RARS derived Cores' module globals require.
     */
    _prepareBuild?(sources: BuildSources): Promise<void>

    /** Restores one CPU instruction and its associated peripheral effects. */
    abstract _undo(): void

    /**
     * How many entries (instructions or Pokes) the Core's history holds now, for Undo of a Step that
     * ran through library code: it is undone whole or not at all.
     */
    _undoDepth?(): number

    /** Monotone completed guest/tool instruction count; callers measure guest deltas. */
    _getInstructionsExecuted?(): bigint

    /**
     * Pauses and resumes the Core's Undo history, so that what runs in between can never be undone:
     * the Runtime library's start code, which a Build runs up to the program's own first
     * instruction. Resuming leaves the history off when the Build asked for none. Without it, the
     * start code is recorded like any instruction and GenericEmulator keeps it behind a floor of its
     * Undo ledger instead.
     */
    _setUndoRecording?(recording: boolean): void

    /** Runs after the fresh FileSystem session exists, before any guest inspection or presets. */
    _beginExecutionSession?(): void

    /**
     * Gives the program these Arguments at the start `_compile` prepares, after `argv[0]`, its name
     * as a shell would start it ([binary-import.md](../../../../../docs/design/binary-import.md),
     * decision 12). Only a Target whose programs take Arguments has it; it throws when its Core
     * refuses them, too many or too long, with a message for the person.
     */
    _setProgramArguments?(sources: BuildSources, args: string[]): void

    /**
     * What the Log should add about how the program just ended, read once when it ends: an
     * instruction the Core cannot run, say, which only the end's reason and its bytes tell.
     */
    _terminationNotes?(): Omit<EmulatorNote, 'id'>[]

    /** Detaches native execution before the host ends its FileSystem capability. */
    _clearExecution?(): void

    /** Preflights a complete grouped rollback before changing any CPU or peripheral state. */
    _canUndoSteps?(count: number): boolean

    /** Reversibility metadata for a displayed group, without loading its mutation payloads. */
    _canUndoHistoryRange?(skip: number, count: number): boolean

    /** Preflights both the CPU record and every peripheral effect belonging to it. */
    abstract _canUndo(): boolean

    abstract _step(): Promise<{ terminated: boolean }>

    abstract _getStatus(): EmulatorStatus

    abstract _writeMemoryBytes(address: bigint, data: Uint8Array): void

    abstract _readMemoryBytes(address: bigint, length: bigint): Uint8Array

    abstract _getNextInstruction(): Instruction | null

    _getLastInstruction?(): Instruction | null

    /**
     * Whether the instruction about to run is library code, which a Step runs through: answered
     * from what the adapter knows without reading the instruction, such as the objects a loaded
     * Executable's run has mapped, so that a Step through thousands of library instructions never
     * makes the library's Listing. Undefined leaves it to the instruction's File (`@runtime/`,
     * `@lib/`).
     */
    _nextInLibraryCode?(): boolean | undefined

    /**
     * Whether a path is the Listing of a library the running program loaded (`@lib/libc.so.6`),
     * which is library code. Undefined, or false, for every other path: a Project may hold Files
     * under `@lib/` too, and on Targets that load no Executable every such path is one of them.
     */
    _isLibraryListing?(path: string): boolean

    /**
     * Where the program's own code begins, for a Build and a Testcase to run to with the Undo
     * history paused before they start ([binary-import.md](../../../../../docs/design/binary-import.md),
     * decision 11): a loaded Executable's `main`, or its entry point when the Listing knows no
     * `main`, as a temporary Breakpoint and the name a message gives it. Undefined for a program
     * whose start is stepped through instead (`@runtime/` start code) or that starts in its own
     * code.
     */
    _programStart?(): { breakpoint: SourceBreakpoint; name: string } | undefined

    /**
     * The program's own call into the library code it is stopped in: the call instruction of the
     * innermost Call stack frame that returns to program code. What a stop inside library code
     * shows when Steps do not enter it; null when no frame returns to program code.
     */
    _libraryCallSite?(): Instruction | null

    /**
     * Whether the program that just ended is shown on no line, so that what the person reads stays
     * where it is: a loaded Executable that exited, rather than ended on a signal
     * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
     * 3). Undefined, or false, shows where the program ended.
     */
    _keepsPlaceAtExit?(): boolean

    /**
     * What the History calls a Step's stretch of library code, from the first library instruction
     * it ran (`puts in libc.so.6`); undefined to name it after that instruction's File.
     */
    _libraryStretchName?(entered: ExecutionStep): string | undefined

    abstract _getUndoHistory(max: number): ExecutionStep[]

    /** `max` entries of `_getUndoHistory` after the newest `skip`, for a history with library stretches. */
    _getUndoHistoryRange?(skip: number, max: number): ExecutionStep[]

    abstract _getPc(): bigint

    /** Static layout is read once after Build; moving bounds are read at panel refresh. */
    _getMemoryLayout?(): import('./commonLanguageFeatures.svelte').MemoryLayout
    _getHeapBounds?(): import('./commonLanguageFeatures.svelte').HeapBounds | undefined
    _getStackTop?(): bigint
    /**
     * Where the Core stored the program's Arguments at its start, read until it answers once per
     * Build: an x86 program starts only when it first runs or is asked where it is.
     */
    _getArgumentsArea?(): import('./commonLanguageFeatures.svelte').ArgumentsArea | undefined
    _getDeviceRegions?(): import('./commonLanguageFeatures.svelte').DeviceRegion[]
    _resolveMemoryLabel?(name: string): bigint | undefined

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
     * ([ADR 0021](../../../../../docs/adr/0021-register-files-from-core-exports.md)) instead of a call
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
     * Opens the Core's Poke transaction ([ADR 0022](../../../../../docs/adr/0022-core-native-poke-records.md)):
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
     * How the program ended, read from the Core, while `_hasTerminated()` answers true; undefined
     * while it has not ended. A runtime error is not reported here: the Core throws it, and
     * `GenericEmulator` records it as the termination from what was thrown.
     */
    abstract _getTermination(): Termination | undefined

    /**
     * Runs one scheduling slice ([ADR 0007](../../../../../docs/adr/0007-generic-emulator-run-scheduling.md)):
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
     * ([ADR 0005](../../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    _resyncScreenFromMemory?(): void
}
