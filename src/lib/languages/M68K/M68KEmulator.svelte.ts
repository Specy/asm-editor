import {
    ccrToFlagsArray,
    type ExecutionStep as CoreExecutionStep,
    type InstructionLine,
    type Interpreter,
    InterpreterStatus as CoreInterpreterStatus,
    type Interrupt,
    type RegisterOperand,
    S68k,
    type SemanticError,
    Size
} from '@specy/s68k'
import {
    type CompileResult,
    EmulatorStatus,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'
import {
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    makeLabelColor,
    type MutationOperation,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import type { ExecutionGeneration } from '$lib/languages/ExecutionController'
import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
import type { Testcase } from '$lib/Project.svelte'
import { settingsStore } from '$stores/settingsStore.svelte'

export const registerName = [
    'D0',
    'D1',
    'D2',
    'D3',
    'D4',
    'D5',
    'D6',
    'D7',
    'A0',
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7'
] as const

export type M68KRegisterName = (typeof registerName)[number]

const M68K_FLAG_NAMES = ['X', 'N', 'Z', 'V', 'C']

/**
 * How many instructions the s68k interpreter runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Provisional, measured in phase 8.
 */
const M68K_INSTRUCTIONS_PER_MS = 20_000

const READ_CHAR_QUESTION = 'Enter a character'
const READ_NUMBER_QUESTION = 'Enter a number'
const READ_STRING_QUESTION = 'Enter a string'

const INTERRUPT_INPUT_QUESTIONS: Partial<Record<Interrupt['type'], string>> = {
    ReadChar: READ_CHAR_QUESTION,
    ReadNumber: READ_NUMBER_QUESTION,
    ReadKeyboardString: READ_STRING_QUESTION
}

const sizeMap = {
    [Size.Byte]: RegisterSize.Byte,
    [Size.Word]: RegisterSize.Word,
    [Size.Long]: RegisterSize.Long
} satisfies Record<Size, RegisterSize>

export function M68KEmulator(baseCode: string, options: EmulatorSettings = {}) {
    return new AsmEditorM68KEmulator(baseCode, options)
}

class AsmEditorM68KEmulator extends GenericEmulator<Interpreter, M68KRegisterName> {
    private s68k: S68k | null = null
    private interpreter: Interpreter | null = null

    constructor(code: string, options: EmulatorSettings) {
        super(
            code,
            {
                systemSize: RegisterSize.Long,
                registerNames: [...registerName],
                endianness: 'big'
            },
            {
                ...options,
                language: options.language ?? 'M68K',
                baseAddress: options.baseAddress ?? 0x1000n,
                stackAddress: options.stackAddress ?? 0x2000n,
                initialMemoryValue: options.initialMemoryValue ?? 0xff
            }
        )
    }

    protected getInstance(): Interpreter | null {
        return this.interpreter ?? null
    }

    clear(): void {
        super.clear()
        //the interpreter outlives clear(), so the flags have to be zeroed explicitly like the legacy emulator did
        this.state.statusRegisters = M68K_FLAG_NAMES.map((name) => ({
            name,
            value: 0,
            prev: 0
        }))
    }

    protected positionStackTabOnCompile(): void {
        //legacy parity: the Stack tab shows the page *below* SP, which is the region the stack
        //actually grows into. The M68K SP starts page-aligned (0x2000, tab page size 32), so
        //running scrollStackTab() here would snap the tab back onto SP and show unwritten memory
        //above the stack instead. It would also run an extra updateMemory(), collapsing the
        //post-compile memory diff highlighting.
        const stackTab = this.state.memory.tabs.find((e) => e.name === 'Stack')
        if (stackTab) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
    }

    _canUndo(): boolean {
        return this.interpreter?.canUndo() ?? false
    }

    _checkCode(code: string): Diagnostic[] {
        return S68k.semanticCheck(code).map(semanticErrorToDiagnostic)
    }

    _compile(code: string): CompileResult {
        this.s68k = null
        this.interpreter = null
        const s68k = new S68k(code)
        const diagnostics = s68k.semanticCheck().map(semanticErrorToDiagnostic)
        if (diagnostics.length > 0) {
            return {
                ok: false,
                diagnostics,
                report: diagnostics.map((diagnostic) => diagnostic.formatted).join('\n')
            }
        }
        this.s68k = s68k
        return { ok: true }
    }

    _initialize(undoSize: number): void {
        const s68k = this.s68k
        if (!s68k) throw new Error('Interpreter not initialized')
        this.interpreter = s68k.createInterpreter({
            history_size: undoSize,
            keep_history: undoSize > 0
        })
    }

    _dispose(): void {
        this.interpreter = null
        this.s68k = null
    }

    _getCallStack(): StackFrame[] {
        return (
            this.interpreter?.getCallStack().map((frame, i) => ({
                address: BigInt(frame.address),
                name: frame.label_name,
                line: frame.label_line,
                sp: BigInt(frame.registers[15]),
                destination: BigInt(frame.source_address),
                color: makeLabelColor(i, frame.address)
            })) ?? []
        )
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        //M68K has no pseudo instructions, so there is nothing to decorate nor any generated code to show
        return { decorations: [], code: '' }
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        const interpreter = this.interpreter
        if (!interpreter) {
            return M68K_FLAG_NAMES.map((name) => ({ name, value: 0, prev: 0 }))
        }
        const flags = interpreter
            .getFlagsAsArray()
            .map((flag) => (flag ? 1 : 0))
            .reverse()
        if (settingsStore.values.maxVisibleHistoryModifications.value > 0) {
            const last = interpreter.getUndoHistory(1)[0]
            if (last) {
                const old = ccrToFlagsArray(last.old_ccr.bits).reverse()
                return M68K_FLAG_NAMES.map((name, i) => ({
                    name,
                    value: flags[i],
                    prev: Number(old[i])
                }))
            }
        }
        return M68K_FLAG_NAMES.map((name, i) => ({ name, value: flags[i], prev: flags[i] }))
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.interpreter?.getInstructionAt(Number(address)))
    }

    _getNextInstruction(): Instruction | null {
        return toInstruction(this.interpreter?.getNextInstruction())
    }

    _getLastInstruction(): Instruction | null {
        return toInstruction(this.interpreter?.getLastInstruction())
    }

    _getPc(): bigint {
        return BigInt(this.interpreter?.getPc() ?? 0)
    }

    _getSp(): bigint {
        return BigInt(this.interpreter?.getSp() ?? 0)
    }

    _getRegisterValue(
        register: M68KRegisterName,
        size: RegisterSize | undefined = RegisterSize.Long
    ): bigint {
        return BigInt(
            this.requireInterpreter().getRegisterValue(
                registerNameToType(register),
                toCoreSize(size)
            )
        )
    }

    _getRegisterValues(): bigint[] {
        const interpreter = this.interpreter
        if (!interpreter) return new Array(this._registerNames.length).fill(0n)
        return interpreter
            .getCpuSnapshot()
            .getRegistersValues()
            .map((value) => BigInt(value))
    }

    _getRegisterValuesRecord(): Record<M68KRegisterName, bigint> {
        const values = this._getRegisterValues()
        return Object.fromEntries(
            this._registerNames.map((name, i) => [name, values[i] ?? 0n])
        ) as Record<M68KRegisterName, bigint>
    }

    _getStatus(): EmulatorStatus {
        return this._hasTerminated() ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        return (
            this.interpreter?.getUndoHistory(max).map((step) => ({
                ...step,
                mutations: step.mutations.map(convertMutation)
            })) ?? []
        )
    }

    _hasTerminated(): boolean {
        return this.interpreter?.hasTerminated() ?? false
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        return this.requireInterpreter().readMemoryBytes(Number(address), Number(length))
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireInterpreter().writeMemoryBytes(Number(address), data)
    }

    _setRegisterValue(
        register: M68KRegisterName,
        value: bigint,
        size: RegisterSize | undefined = RegisterSize.Long
    ): void {
        this.requireInterpreter().setRegisterValue(
            registerNameToType(register),
            Number(value),
            toCoreSize(size)
        )
    }

    async _step(): Promise<{ terminated: boolean }> {
        const interpreter = this.requireInterpreter()
        const execution = this.executionController.capture()
        interpreter.step()
        if (interpreter.getStatus() === CoreInterpreterStatus.Interrupt) {
            await this.handleInterrupt(interpreter.getCurrentInterrupt(), interpreter, execution)
        }
        this.executionController.ensureCurrent(execution)
        return { terminated: interpreter.hasTerminated() }
    }

    _stringifyError(error: unknown, line?: number): string {
        return getM68kErrorMessage(error, line)
    }

    _undo(): void {
        this.requireInterpreter().undo()
    }

    /**
     * The Core has no instruction counter and reports an exhausted limit by throwing, so the budget
     * is both the halt limit and the only exact progress report there is: a slice that came back
     * with `ExecutionLimit` ran all of it. Only the last slice of a run carries the user's own
     * instruction limit, and only that one lets the error through.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const interpreter = this.requireInterpreter()
        const budget = sliceInstructionBudget(request, M68K_INSTRUCTIONS_PER_MS)
        const isLastSlice = budget >= request.instructionBudget
        const parsedBreakpoints = new Uint32Array(request.breakpoints)
        const hasBreakpoints = parsedBreakpoints.length > 0
        const execution = this.executionController.capture()
        let instructions = 0
        while (!interpreter.hasTerminated()) {
            const remaining = budget - instructions
            if (remaining <= 0) return { reason: 'budget', instructions }
            try {
                if (hasBreakpoints) {
                    interpreter.runWithBreakpoints(parsedBreakpoints, remaining)
                    //here we might have reached a breakpoint. It is paused if the status is running
                    if (interpreter.getStatus() === CoreInterpreterStatus.Running) {
                        return { reason: 'breakpoint', instructions }
                    }
                } else {
                    interpreter.runWithLimit(remaining)
                }
            } catch (error) {
                if (isLastSlice || !isExecutionLimitError(error)) throw error
                return { reason: 'budget', instructions: budget }
            }
            //an interrupt is one instruction of progress: without it a program that does nothing but
            //trap would never reach the run's limit, which is what the old unaccounted loop did
            instructions += 1
            await this.handleInterpreterInterruption(interpreter, execution)
        }
        return { reason: 'terminated', instructions }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const interpreter = this.requireInterpreter()
        const limit = toHaltLimit(haltLimit)
        const execution = this.executionController.capture()
        while (!interpreter.hasTerminated()) {
            interpreter.runWithLimit(limit)
            await this.handleInterpreterInterruption(interpreter, execution)
        }
    }

    private async handleInterpreterInterruption(
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ) {
        switch (interpreter.getStatus()) {
            case CoreInterpreterStatus.Terminated: {
                const ins = interpreter.getLastInstruction()
                this.state.terminated = true
                this.state.line = ins?.parsed_line?.line_index ?? -1
                break
            }
            case CoreInterpreterStatus.TerminatedWithException: {
                const ins = interpreter.getLastInstruction()
                this.state.terminated = true
                this.state.line = ins?.parsed_line?.line_index ?? -1
                this.state.canUndo = false
                this.addError('Program terminated with errors')
                break
            }
            case CoreInterpreterStatus.Interrupt: {
                if (this.state.terminated || !this.state.canExecute) break
                const ins = interpreter.getLastInstruction()
                this.state.line = ins?.parsed_line?.line_index ?? -1
                this.updateRegisters()
                this.updateStatusRegisters()
                this.updateMemory()
                this.updateData()
                this.scrollStackTab()
                await this.handleInterrupt(
                    interpreter.getCurrentInterrupt(),
                    interpreter,
                    execution
                )
                break
            }
        }
    }

    private async handleInterrupt(
        interrupt: Interrupt | null,
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ) {
        if (!interrupt) throw new Error('Expected interrupt')
        this.executionController.ensureCurrent(execution)
        const terminal = this._peripherals.terminal
        const { type } = interrupt
        const question = INTERRUPT_INPUT_QUESTIONS[type]
        this.state.interrupt = question ? { type, message: question } : { type }
        try {
            switch (type) {
                case 'DisplayStringWithCRLF': {
                    terminal.write(`${interrupt.value}\n`)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayStringWithoutCRLF':
                case 'DisplayChar':
                case 'DisplayNumber': {
                    terminal.write(String(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayNumberInBase': {
                    const { value, base } = interrupt.value
                    terminal.write(value.toString(base))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'ReadChar': {
                    const char = (await terminal.readAsync(READ_CHAR_QUESTION, execution))[0]
                    if (!char) throw new Error(`Expected a character, got "${char}"`)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: char })
                    break
                }
                case 'ReadNumber': {
                    const answer = await terminal.readAsync(READ_NUMBER_QUESTION, execution)
                    const number = Number(answer)
                    if (Number.isNaN(number) || answer === '')
                        throw new Error(`Expected a number, got "${answer === '' ? '' : number}"`)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: number })
                    break
                }
                case 'ReadKeyboardString': {
                    const string = await terminal.readAsync(READ_STRING_QUESTION, execution)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: string })
                    break
                }
                case 'GetTime': {
                    const time = await this.executionController.waitFor(execution, () =>
                        Promise.resolve(Math.round(Date.now() / 1000))
                    )
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: time }) //unix seconds
                    break
                }
                case 'Terminate': {
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'Delay': {
                    //program time, not host sleep: a Testcase's virtual clock completes it at once
                    //and advances by the duration (ADR 0010)
                    await this.executionController.waitFor(execution, () =>
                        this._peripherals.clock.wait(interrupt.value)
                    )
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type })
                    break
                }
                default:
                    throw new Error(`Unknown interrupt type "${type}"`)
            }
        } finally {
            this.state.interrupt = undefined
        }
    }

    private requireInterpreter(): Interpreter {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        return this.interpreter
    }
}

/** The Core's way of saying "the limit I was given ran out": `{ type: 'ExecutionLimit', value }`. */
function isExecutionLimitError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { type?: unknown }).type === 'ExecutionLimit'
    )
}

function toHaltLimit(limit: number | undefined): number {
    return !limit || limit <= 0 ? Number.MAX_SAFE_INTEGER : limit
}

function toCoreSize(size: RegisterSize | undefined): Size {
    switch (size) {
        case RegisterSize.Byte:
            return Size.Byte
        case RegisterSize.Word:
            return Size.Word
        case RegisterSize.Long:
        default:
            return Size.Long
    }
}

function toInstruction(instruction: InstructionLine | null | undefined): Instruction | null {
    if (!instruction?.parsed_line) return null
    return {
        address: BigInt(instruction.address),
        lineNumber: instruction.parsed_line.line_index,
        code: instruction.parsed_line.line
    }
}

//s68k has no warnings concept, every semantic check finding is a hard error
function semanticErrorToDiagnostic(error: SemanticError): Diagnostic {
    const line = error.getLine()
    return {
        severity: 'error',
        line,
        column: line.line.length - line.line.trimStart().length + 1,
        lineIndex: error.getLineIndex(),
        message: error.getError(),
        formatted: error.getMessage()
    }
}

function convertMutation(mutation: CoreExecutionStep['mutations'][number]): MutationOperation {
    switch (mutation.type) {
        case 'WriteRegister':
            return {
                type: 'WriteRegister',
                value: {
                    old: BigInt(mutation.value.old),
                    size: sizeMap[mutation.value.size],
                    register: registerOperandToString(mutation.value.register)
                }
            }
        case 'WriteMemoryBytes':
            return {
                type: 'WriteMemoryBytes',
                value: {
                    address: BigInt(mutation.value.address),
                    old: mutation.value.old
                }
            }
        case 'WriteMemory':
            return {
                type: 'WriteMemory',
                value: {
                    address: BigInt(mutation.value.address),
                    old: BigInt(mutation.value.old),
                    size: sizeMap[mutation.value.size]
                }
            }
        case 'PushCall':
            return {
                type: 'PushCallStack',
                value: {
                    to: BigInt(mutation.value.to),
                    from: BigInt(mutation.value.from)
                }
            }
        case 'PopCall':
            return {
                type: 'PopCallStack',
                value: {
                    to: BigInt(mutation.value.to),
                    from: BigInt(mutation.value.from)
                }
            }
        default:
            return unsupportedMutation(mutation)
    }
}

function unsupportedMutation(mutation: never): never {
    throw new Error(`Unsupported mutation: ${JSON.stringify(mutation)}`)
}

function registerNameToType(name: string) {
    return {
        value: Number(name[1]),
        type: name[0] === 'A' ? 'Address' : 'Data'
    } satisfies RegisterOperand
}

function registerOperandToString(op: RegisterOperand) {
    return op.type === 'Address' ? `a${op.value}` : `d${op.value}`
}
