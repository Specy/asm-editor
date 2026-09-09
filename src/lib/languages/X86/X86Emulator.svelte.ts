import {
    EmulatorStatus,
    type CompileResult,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
import {
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    type MutationOperation,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'
import type { ExecutionGeneration } from '$lib/languages/ExecutionController'
import type { Testcase } from '$lib/Project.svelte'
import {
    BlinkState,
    createX86Emulator,
    EmulatorStatus as CoreEmulatorStatus,
    RegisterSize as CoreRegisterSize,
    X86_REGISTER_NAMES,
    type ExecutionStep as CoreExecutionStep,
    type MonacoError as CoreMonacoError,
    type MutationOperation as CoreMutationOperation,
    type X86CompilationDiagnostic,
    type X86Emulator as CoreX86Emulator,
    type X86RegisterName
} from '@specy/x86'
import structuredClone from '@ungap/structured-clone'
import { sourceText, type BuildInput, type BuildSources } from '$lib/projectFiles'

/**
 * How many instructions Blink runs in a millisecond, used to turn a slice's time budget into a run
 * limit. Measured in phase 8 on a compute-only loop under node: about 11, two hundred times slower
 * than the estimate this replaces, which held the host for nine tenths of a second per slice and
 * answered Stop seventeen seconds after it was pressed.
 */
const X86_INSTRUCTIONS_PER_MS = 10

export const DEFAULT_X86_FLAGS = [
    { name: 'CF', value: 0 },
    { name: 'PF', value: 0 },
    { name: 'AF', value: 0 },
    { name: 'ZF', value: 0 },
    { name: 'SF', value: 0 },
    { name: 'TF', value: 0 },
    { name: 'DF', value: 0 },
    { name: 'OF', value: 0 }
]

export async function X86Emulator(source: BuildInput, options: EmulatorSettings = {}) {
    let wrapper: AsmEditorX86Emulator | null = null
    const core = await createX86Emulator({
        mode: 'NASM_trunk',
        callbacks: {
            stdout: (charCode) => wrapper?.appendOutput(charCode),
            stderr: (charCode) => wrapper?.appendOutput(charCode)
        }
    })
    wrapper = new AsmEditorX86Emulator(source, options, core)
    return wrapper
}

class AsmEditorX86Emulator extends GenericEmulator<CoreX86Emulator, X86RegisterName> {
    private core: CoreX86Emulator | null = null
    private diagnosticCore: CoreX86Emulator | null = null
    private compileQueue: Promise<void> = Promise.resolve()
    private checkCodeQueue: Promise<void> = Promise.resolve()

    constructor(source: BuildInput, options: EmulatorSettings, core: CoreX86Emulator) {
        super(
            source,
            {
                systemSize: RegisterSize.Double,
                registerNames: [...X86_REGISTER_NAMES],
                endianness: 'little'
            },
            {
                ...options,
                language: options.language ?? 'X86',
                stackAddress: options.stackAddress ?? 0x4ffffffffff0n,
                baseAddress: options.baseAddress ?? 0x4ffffffffff0n,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        this.core = core
        void this.semanticCheck()
    }

    appendOutput(charCode: number): void {
        if (!this.isProgramOutput()) return
        this._peripherals.terminal.write(String.fromCharCode(charCode))
    }

    protected getInstance(): CoreX86Emulator | null {
        return this.core ?? null
    }

    async compile(historySize: number, sourceOverride?: BuildInput): Promise<void> {
        const currentCompile = this.compileQueue.then(() =>
            super.compile(historySize, sourceOverride)
        )
        this.compileQueue = currentCompile.catch(() => undefined)
        await currentCompile
    }

    _canUndo(): boolean {
        return this.core?.canUndo() ?? false
    }

    async _checkCode(sources: BuildSources): Promise<Diagnostic[]> {
        const code = sourceText(sources)
        if (!this.core && !this.diagnosticCore) return []
        const currentCheck = this.checkCodeQueue.then(async () => {
            const checker = await this.getDiagnosticCore()
            const errors = await checker.checkCode(code)
            return errors.map((error) => ({ ...mapCoreDiagnostic(error), file: sources.entry }))
        })
        this.checkCodeQueue = currentCheck.catch(() => undefined).then(() => undefined)
        return currentCheck
    }

    async _compile(sources: BuildSources): Promise<CompileResult> {
        const code = sourceText(sources)
        const result = await this.requireCore().compile(code)
        if (!('errors' in result)) return { ok: true }
        return {
            ok: false,
            diagnostics: result.errors.map((error) => ({
                ...coreDiagnosticToDiagnostic(code, error),
                file: sources.entry
            })),
            report: result.report
        }
    }

    _initialize(undoSize: number): void {
        const core = this.requireCore()
        core.initialize(undoSize)
        this.updateMemoryAddresses()
    }

    _dispose(): void {
        this.core?.dispose()
        this.diagnosticCore?.dispose()
        this.core = null
        this.diagnosticCore = null
    }

    _getCallStack(): StackFrame[] {
        const file = this.buildSources?.entry ?? this._sources.entry
        return this.core?.getCallStack().map((frame) => ({ ...frame, file })) ?? []
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        if (!this.core) return { decorations: [], code: '' }
        const compiled = this.core.getCompiledCode()
        const file = this.buildSources?.entry ?? this._sources.entry
        return {
            decorations: compiled.decorations.map((decoration) => ({ ...decoration, file })),
            code: compiled.code
        }
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        return (
            this.core?.getFlags().map((flag) => ({ ...flag })) ?? structuredClone(DEFAULT_X86_FLAGS)
        )
    }

    _getInstructionAt(address: bigint): Instruction | null {
        const instruction = this.core?.getInstructionAt(address)
        return instruction
            ? { ...instruction, file: this.buildSources?.entry ?? this._sources.entry }
            : null
    }

    _getNextInstruction(): Instruction | null {
        const instruction = this.core?.getNextInstruction()
        return instruction
            ? { ...instruction, file: this.buildSources?.entry ?? this._sources.entry }
            : null
    }

    _getPc(): bigint {
        return this.core?.getPc() ?? 0n
    }

    _getRegisterValue(
        register: X86RegisterName,
        size: RegisterSize | undefined = RegisterSize.Double
    ): bigint {
        return this.requireCore().getRegisterValue(
            normalizeRegisterName(register),
            toCoreRegisterSize(size)
        )
    }

    _getRegisterValues(): bigint[] {
        return this.core?.getRegisterValues() ?? new Array(this._registerNames.length).fill(0n)
    }

    _getRegisterValuesRecord(): Record<X86RegisterName, bigint> {
        if (!this.core) {
            return Object.fromEntries(
                this._registerNames.map((register) => [register, 0n])
            ) as Record<X86RegisterName, bigint>
        }
        return this.core.getRegisterValuesRecord()
    }

    _getSp(): bigint {
        return this.core?.getSp() ?? 0n
    }

    _getStatus(): EmulatorStatus {
        return toLocalStatus(this.core?.getStatus() ?? CoreEmulatorStatus.NotReady)
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const file = this.buildSources?.entry ?? this._sources.entry
        return (
            this.core?.getUndoHistory(max).map((step) => ({ ...mapExecutionStep(step), file })) ??
            []
        )
    }

    _hasTerminated(): boolean {
        return this.core?.hasTerminated() ?? true
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        try {
            return this.requireCore().readMemoryBytes(address, length)
        } catch (e) {
            if (String(e).includes('virtual address is not mapped')) {
                return new Uint8Array(Number(length)).fill(0)
            }
            throw e
        }
    }

    /**
     * Blink has no instruction counter and its `run` stops for input rather than for a clock, so a
     * slice is one `run` with the budget as its limit: exact when it comes back still running, which
     * is the compute-only case the budget exists for. x86 has no Screen, so it never sees the short
     * slice ([screen-peripherals.md](../../../../docs/design/screen-peripherals.md)).
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const budget = sliceInstructionBudget(request, X86_INSTRUCTIONS_PER_MS)
        const entry = this.buildSources?.entry ?? this._sources.entry
        const breakpoints = request.breakpoints
            .filter((breakpoint) => breakpoint.file === entry)
            .map((breakpoint) => breakpoint.line)
        const status = await this.runWithInput(budget, breakpoints)
        if (status === CoreEmulatorStatus.Running) {
            //still runnable: either the budget ran out or a breakpoint stopped it, and `run` does
            //not say which. The line the program is about to execute does: a run that stopped on a
            //breakpoint is parked on it
            const line = this._getNextInstruction()?.lineNumber ?? -1
            const onBreakpoint = line >= 0 && breakpoints.includes(line)
            return { reason: onBreakpoint ? 'breakpoint' : 'budget', instructions: budget }
        }
        return { reason: 'terminated', instructions: budget }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const limit = haltLimit <= 0 ? Number.MAX_SAFE_INTEGER : haltLimit
        await this.runWithInput(limit, [])
    }

    _setRegisterValue(
        register: X86RegisterName,
        value: bigint,
        size: RegisterSize | undefined = RegisterSize.Double
    ): void {
        this.requireCore().setRegisterValue(
            normalizeRegisterName(register),
            value,
            toCoreRegisterSize(size)
        )
    }

    async _step(): Promise<{ terminated: boolean }> {
        const core = this.requireCore()
        const execution = this.executionController.capture()
        const result = await this.executionController.waitFor(execution, () => core.step())
        if (core.getStatus() === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput(execution)
        }
        this.executionController.ensureCurrent(execution)
        return { terminated: result.terminated || core.hasTerminated() }
    }

    _stringifyError(error: unknown, _line?: number): string {
        if (error instanceof Error) return error.message
        return String(error)
    }

    _undo(): void {
        this.requireCore().undo()
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireCore().writeMemoryBytes(address, data)
    }

    private async runWithInput(
        limit: number | undefined,
        breakpoints: number[]
    ): Promise<CoreEmulatorStatus> {
        const core = this.requireCore()
        const execution = this.executionController.capture()
        let status = await this.executionController.waitFor(execution, () =>
            core.run(limit, breakpoints)
        )
        while (status === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput(execution)
            status = await this.executionController.waitFor(execution, () =>
                core.run(limit, breakpoints)
            )
        }
        return status
    }

    private async provideProgramInput(execution: ExecutionGeneration): Promise<void> {
        const core = this.requireCore()
        const value = await this.requestInput('Program input', execution)
        this.executionController.ensureCurrent(execution)
        core.provideInput(ensureLineInput(value))
    }

    private async getDiagnosticCore(): Promise<CoreX86Emulator> {
        this.diagnosticCore ??= await createX86Emulator({ mode: 'NASM_trunk' })
        return this.diagnosticCore
    }

    private requireCore(): CoreX86Emulator {
        if (!this.core) throw new Error('Interpreter not initialized')
        return this.core
    }

    private updateMemoryAddresses(): void {
        const pageSize = BigInt(this.state.memory.global.pageSize)
        this.state.memory.global.address = alignDown(this._getSp(), pageSize)
        const stackTab = this.state.memory.tabs.find((tab) => tab.name === 'Stack')
        if (stackTab) {
            const stackPageSize = BigInt(stackTab.pageSize)
            stackTab.address = alignDown(this._getSp(), stackPageSize)
        }
    }

    private isProgramOutput(): boolean {
        const state = this.core?.state
        return (
            state !== undefined && state !== BlinkState.Assembling && state !== BlinkState.Linking
        )
    }
}

function normalizeRegisterName(register: string): X86RegisterName {
    const normalized = register.toLowerCase()
    if (!isX86RegisterName(normalized)) throw new Error(`Unknown X86 register: ${register}`)
    return normalized
}

function isX86RegisterName(register: string): register is X86RegisterName {
    return X86_REGISTER_NAMES.some((candidate) => candidate === register)
}

function toCoreRegisterSize(size: RegisterSize | undefined): CoreRegisterSize {
    switch (size) {
        case RegisterSize.Byte:
            return CoreRegisterSize.Byte
        case RegisterSize.Word:
            return CoreRegisterSize.Word
        case RegisterSize.Long:
            return CoreRegisterSize.Long
        case RegisterSize.Double:
        default:
            return CoreRegisterSize.Double
    }
}

function toLocalRegisterSize(size: CoreRegisterSize): RegisterSize {
    switch (size) {
        case CoreRegisterSize.Byte:
            return RegisterSize.Byte
        case CoreRegisterSize.Word:
            return RegisterSize.Word
        case CoreRegisterSize.Long:
            return RegisterSize.Long
        case CoreRegisterSize.Double:
        default:
            return RegisterSize.Double
    }
}

function toLocalStatus(status: CoreEmulatorStatus): EmulatorStatus {
    if (status === CoreEmulatorStatus.Terminated) return EmulatorStatus.Terminated
    return EmulatorStatus.Running
}

//the core only parses its assembler logs when the assembler exits non-zero, and its NASM parser
//discards the "error:"/"warning:" marker it matched on, so nothing here can identify a warning
function mapCoreDiagnostic(error: CoreMonacoError): Diagnostic {
    return {
        severity: 'error',
        lineIndex: error.lineIndex,
        column: error.column,
        line: { ...error.line },
        message: error.message,
        formatted: error.formatted
    }
}

function coreDiagnosticToDiagnostic(
    code: string,
    diagnostic: X86CompilationDiagnostic
): Diagnostic {
    const lines = code.split('\n')
    const lineIndex = Math.max(0, diagnostic.line - 1)
    const line = lines[lineIndex] ?? ''
    return {
        severity: 'error',
        lineIndex,
        column: 0,
        line: {
            line,
            line_index: lineIndex
        },
        message: diagnostic.error,
        formatted: diagnostic.error
    }
}

function mapExecutionStep(step: CoreExecutionStep): ExecutionStep {
    return {
        mutations: step.mutations.map(mapMutationOperation),
        pc: step.pc,
        old_ccr: { ...step.old_ccr },
        new_ccr: { ...step.new_ccr },
        line: step.line
    }
}

function mapMutationOperation(operation: CoreMutationOperation): MutationOperation {
    if (operation.type === 'WriteRegister') {
        return {
            type: operation.type,
            value: {
                ...operation.value,
                size: toLocalRegisterSize(operation.value.size)
            }
        }
    }
    if (operation.type === 'WriteMemory') {
        return {
            type: operation.type,
            value: {
                ...operation.value,
                size: toLocalRegisterSize(operation.value.size)
            }
        }
    }
    if (operation.type === 'WriteMemoryBytes') {
        return {
            type: operation.type,
            value: {
                address: operation.value.address,
                old: [...operation.value.old]
            }
        }
    }
    return { ...operation }
}

function ensureLineInput(input: string): string {
    return input.endsWith('\n') ? input : `${input}\n`
}

function alignDown(value: bigint, size: bigint): bigint {
    if (size <= 0n) return value
    return value - (value % size)
}
