import { EmulatorStatus, type CompileResult, type Instruction } from '$lib/languages/BaseEmulator.svelte'
import {
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    type MonacoError,
    type MutationOperation,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import type { Testcase } from '$lib/Project.svelte'
import { Prompt } from '$stores/promptStore.svelte'
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
    type X86CompileResult,
    type X86Emulator as CoreX86Emulator,
    type X86RegisterName,
} from '@specy/x86'


export const DEFAULT_X86_FLAGS = [
    { name: 'CF', value: 0 },
    { name: 'PF', value: 0 },
    { name: 'AF', value: 0 },
    { name: 'ZF', value: 0 },
    { name: 'SF', value: 0 },
    { name: 'TF', value: 0 },
    { name: 'DF', value: 0 },
    { name: 'OF', value: 0 },
]

export async function X86Emulator(code: string, options: EmulatorSettings = {}) {
    let wrapper: AsmEditorX86Emulator | null = null
    const core = await createX86Emulator({
        mode: 'NASM_trunk',
        callbacks: {
            stdout: (charCode) => wrapper?.appendOutput(charCode),
            stderr: (charCode) => wrapper?.appendOutput(charCode)
        }
    })
    wrapper = new AsmEditorX86Emulator(code, options, core)
    return wrapper
}

class AsmEditorX86Emulator extends GenericEmulator<CoreX86Emulator, X86RegisterName> {
    private core: CoreX86Emulator | null = null
    private diagnosticCore: CoreX86Emulator | null = null
    private testcaseInput: string[] | null = null
    private compileQueue: Promise<void> = Promise.resolve()
    private checkCodeQueue: Promise<void> = Promise.resolve()

    constructor(code: string, options: EmulatorSettings, core: CoreX86Emulator) {
        super(
            code,
            {
                systemSize: RegisterSize.Double,
                registerNames: [...X86_REGISTER_NAMES],
                endianness: 'little'
            },
            {
                language: 'X86',
                stackAddress: 0x4FFFFFFFFFF0n,
                baseAddress: 0x4FFFFFFFFFF0n,
                initialMemoryValue: 0x0,
                ...options
            }
        )
        this.core = core
        void this.semanticCheck()
    }

    appendOutput(charCode: number): void {
        if (!this.isProgramOutput()) return
        this.state.stdOut += String.fromCharCode(charCode)
    }

    protected getInstance(): CoreX86Emulator | null {
        return this.core ?? null
    }

    async compile(historySize: number, codeOverride?: string): Promise<void> {
        const currentCompile = this.compileQueue.then(() => super.compile(historySize, codeOverride))
        this.compileQueue = currentCompile.catch(() => undefined)
        await currentCompile
    }

    _canUndo(): boolean {
        return this.core?.canUndo() ?? false
    }

    async _checkCode(code: string): Promise<MonacoError[]> {
        if (!this.core && !this.diagnosticCore) return []
        const currentCheck = this.checkCodeQueue.then(async () => {
            const checker = await this.getDiagnosticCore()
            const errors = await checker.checkCode(code)
            return errors.map(mapMonacoError)
        })
        this.checkCodeQueue = currentCheck.catch(() => undefined).then(() => undefined)
        return currentCheck
    }

    async _compile(code: string): Promise<CompileResult> {
        const result = await this.requireCore().compile(code)
        if (!('errors' in result)) return { ok: true }
        return {
            ok: false,
            errors: result.errors.map((error) => diagnosticToMonacoError(code, error)),
            report: result.report
        }
    }

    _initialize(undoSize: number): void {
        const core = this.requireCore()
        core.initialize(undoSize)
        this.updateMemoryAddresses()
    }

    _dispose(): void {
        Prompt.cancel()
        this.core?.dispose()
        this.diagnosticCore?.dispose()
        this.core = null
        this.diagnosticCore = null
    }

    _getCallStack(): StackFrame[] {
        return this.core?.getCallStack().map((frame) => ({ ...frame })) ?? []
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        if (!this.core) return { decorations: [], code: '' }
        const compiled = this.core.getCompiledCode()
        return {
            decorations: compiled.decorations.map((decoration) => ({ ...decoration })),
            code: compiled.code
        }
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        return this.core?.getFlags().map((flag) => ({ ...flag })) ?? structuredClone(DEFAULT_X86_FLAGS)
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return this.core?.getInstructionAt(address) ?? null
    }

    _getNextInstruction(): Instruction | null {
        return this.core?.getNextInstruction() ?? null
    }

    _getPc(): bigint {
        return this.core?.getPc() ?? 0n
    }

    _getRegisterValue(register: X86RegisterName, size: RegisterSize | undefined = RegisterSize.Double): bigint {
        return this.requireCore().getRegisterValue(normalizeRegisterName(register), toCoreRegisterSize(size))
    }

    _getRegisterValues(): bigint[] {
        return this.core?.getRegisterValues() ?? new Array(this._registerNames.length).fill(0n)
    }

    _getRegisterValuesRecord(): Record<X86RegisterName, bigint> {
        if (!this.core) {
            return Object.fromEntries(this._registerNames.map((register) => [register, 0n])) as Record<
                X86RegisterName,
                bigint
            >
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
        return this.core?.getUndoHistory(max).map(mapExecutionStep) ?? []
    }

    _hasTerminated(): boolean {
        return this.core?.hasTerminated() ?? true
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        try {
        return this.requireCore().readMemoryBytes(address, length)
        }catch(e){
            if(String(e).includes('virtual address is not mapped')) {
                return new Uint8Array(Number(length)).fill(0)
            }
            throw e
        }
    }

    async _run(limit: number | undefined, breakpoints: number[] | undefined): Promise<EmulatorStatus> {
        const status = await this.runWithInput(limit, breakpoints ?? [])
        return toLocalStatus(status)
    }

    async _runTestcase(testcase: Testcase, haltLimit: number): Promise<void> {
        const previousInput = this.testcaseInput
        this.testcaseInput = [...testcase.input]
        const limit = haltLimit <= 0 ? Number.MAX_SAFE_INTEGER : haltLimit
        try {
            await this.runWithInput(limit, [])
        } finally {
            this.testcaseInput = previousInput
        }
    }

    _setRegisterValue(register: X86RegisterName, value: bigint, size: RegisterSize | undefined = RegisterSize.Double): void {
        this.requireCore().setRegisterValue(normalizeRegisterName(register), value, toCoreRegisterSize(size))
    }

    async _step(): Promise<{ terminated: boolean }> {
        const core = this.requireCore()
        const result = await core.step()
        if (core.getStatus() === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput()
        }
        return { terminated: result.terminated || core.hasTerminated() }
    }

    _stringifyError(error: unknown): string {
        if (error instanceof Error) return error.message
        return String(error)
    }

    _undo(): void {
        this.requireCore().undo()
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireCore().writeMemoryBytes(address, data)
    }

    private async runWithInput(limit: number | undefined, breakpoints: number[]): Promise<CoreEmulatorStatus> {
        const core = this.requireCore()
        let status = await core.run(limit, breakpoints)
        while (status === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput()
            status = await core.run(limit, breakpoints)
        }
        return status
    }

    private async provideProgramInput(): Promise<void> {
        const core = this.requireCore()
        const value = this.testcaseInput ? (this.testcaseInput.shift() ?? '') : await Prompt.askText('Program input', true)
        if (value == null) throw new Error('Input cancelled')
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
        return state !== undefined && state !== BlinkState.Assembling && state !== BlinkState.Linking
    }
}

function normalizeRegisterName(register: string): X86RegisterName {
    const normalized = register.toLowerCase() as X86RegisterName
    if (!X86_REGISTER_NAMES.includes(normalized)) throw new Error(`Unknown X86 register: ${register}`)
    return normalized
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

function mapMonacoError(error: CoreMonacoError): MonacoError {
    return {
        lineIndex: error.lineIndex,
        column: error.column,
        line: { ...error.line },
        message: error.message,
        formatted: error.formatted
    }
}

function diagnosticToMonacoError(code: string, diagnostic: X86CompilationDiagnostic): MonacoError {
    const lines = code.split('\n')
    const lineIndex = Math.max(0, diagnostic.line - 1)
    const line = lines[lineIndex] ?? ''
    return {
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