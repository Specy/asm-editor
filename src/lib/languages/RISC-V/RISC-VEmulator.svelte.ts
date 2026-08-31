import {
    BackStepAction,
    bigintToHighLow,
    ConfirmResult,
    type HandlerMapFns,
    type JsBackStep,
    type JsProgramStatement,
    type JsRiscV,
    registerHandlers,
    type RegisterName,
    RISCV,
    RISCV_REGISTERS,
    type RISCVAssembleError,
    StopReason,
    unimplementedHandler
} from '@specy/risc-v'
import {
    type CompileResult,
    EmulatorStatus,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
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
import type { Testcase } from '$lib/Project.svelte'

export type RISCVRegisterName = RegisterName | 'pc'

export const RISCVRegisterNames: RISCVRegisterName[] = [...RISCV_REGISTERS, 'pc']

export const ALTERNATIVE_RISCVRegister_NAMES = new Array(RISCV_REGISTERS.length)
    .fill(0)
    .map((_, i) => `x${i}`)

const READ_CHAR_QUESTION = 'Enter a character'
const READ_DOUBLE_QUESTION = 'Enter a double'
const READ_FLOAT_QUESTION = 'Enter a float'
const READ_INT_QUESTION = 'Enter an integer'
const READ_STRING_QUESTION = 'Enter a string'

const INVALID_CHARACTER_ERROR = 'Invalid character'
const INVALID_NUMBER_ERROR = 'Invalid number'

export function RISCVEmulator(baseCode: string, options: EmulatorSettings = {}) {
    return new AsmEditorRISCVEmulator(baseCode, options)
}

class AsmEditorRISCVEmulator extends GenericEmulator<JsRiscV, RISCVRegisterName> {
    private riscv: JsRiscV | null = null
    /**
     * The generation the currently running `_run`/`_step`/`_runTestcase` belongs to. The IO handlers
     * are registered once (at `_initialize`) but every async read has to be tied to the execution
     * that is actually running, so they read this field instead of capturing a generation.
     */
    private currentExecution: ExecutionGeneration = this.executionController.capture()

    constructor(code: string, options: EmulatorSettings) {
        super(
            code,
            {
                systemSize:
                    options.language === 'RISC-V-64' ? RegisterSize.Double : RegisterSize.Long,
                registerNames: [...RISCVRegisterNames],
                hiddenRegisters: ['zero'],
                endianness: 'little'
            },
            {
                ...options,
                language: options.language ?? 'RISC-V',
                baseAddress: options.baseAddress ?? 0x10010000n,
                stackAddress: options.stackAddress ?? 0x7ffffffcn,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        //`pc` is readable in testcase expectations but the core has no setter for it, so it must not
        //be offered as a starting register (see `_setRegisterValue`)
        this.state.startingRegisterNames = [...RISCV_REGISTERS]
    }

    /**
     * 32 vs 64 bit is a *module global* of the core (`RISCV.setIs64Bit`), not a per instance flag,
     * so it has to be pinned right before every core creation (see `_compile`/`_checkCode`).
     * This is a getter and not a field because the base constructor already runs `_checkCode`
     * (through `semanticCheck()`), which happens before subclass field initializers would run.
     */
    private get is64Bit(): boolean {
        return this._emulatorOptions.language === 'RISC-V-64'
    }

    protected getInstance(): JsRiscV | null {
        return this.riscv ?? null
    }

    protected positionStackTabOnCompile(): void {
        //legacy parity: the Stack tab shows the page *below* SP, which is the region the stack
        //actually grows into. Running scrollStackTab() here would snap the tab onto the page
        //containing SP (0x7ffffffc is not page aligned) and show unwritten memory above the stack.
        const stackTab = this.state.memory.tabs.find((e) => e.name === 'Stack')
        if (stackTab) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
    }

    _canUndo(): boolean {
        return this.riscv?.canUndo ?? false
    }

    _checkCode(code: string): Diagnostic[] {
        //the bitness decides which instructions assemble (`ld` is RV64 only), so pin the module
        //global before creating the throwaway instance, exactly like `_compile` does
        RISCV.setIs64Bit(this.is64Bit)
        const result = RISCV.makeRiscVFromSource(code).assemble()
        return result.errors.map(assembleErrorToDiagnostic)
    }

    _compile(code: string, undoSize: number): CompileResult {
        this.riscv = null
        //creation + assembly is synchronous, so pinning the module global here cannot be
        //interleaved with another instance's creation
        RISCV.setIs64Bit(this.is64Bit)
        const riscv = RISCV.makeRiscVFromSource(code)
        //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize` stored, so
        //the size has to be set *before* assembling: setting it afterwards would only size the next
        //compile's buffer (legacy ordering was setUndoSize -> assemble -> setUndoEnabled)
        riscv.setUndoSize(Math.max(1, normalizeUndoSize(undoSize)))
        const result = riscv.assemble()
        const diagnostics = result.errors.map(assembleErrorToDiagnostic)
        //`hasErrors` only means "the collection is non-empty", and warnings share that collection,
        //so a warnings-only program would be rejected despite having assembled fine
        if (diagnostics.some((d) => d.severity === 'error')) {
            return {
                ok: false,
                diagnostics,
                report: result.report
            }
        }
        this.riscv = riscv
        return { ok: true, diagnostics }
    }

    _initialize(undoSize: number): void {
        const riscv = this.requireRiscV()
        //the stack was already sized in `_compile`, `assemble()` engages the backstepper
        //unconditionally so this is what actually turns undo off when history is disabled
        riscv.setUndoEnabled(normalizeUndoSize(undoSize) > 0)
        riscv.initialize(true)
        registerHandlers(riscv, this.makeHandlers())
    }

    _dispose(): void {
        this.riscv = null
    }

    _getCallStack(): StackFrame[] {
        const riscv = this.riscv
        if (!riscv) return []
        return riscv.getCallStack().map((frame, i) => {
            const address = frame.toAddress
            const statement = this.statementAtAddress(address)
            return {
                address: BigInt(address),
                destination: BigInt(frame.pc),
                sp: BigInt(frame.sp),
                name:
                    riscv.getLabelAtAddress(address) ??
                    `0x${address.toString(16).padStart(8, '0')}`,
                line: statement ? sourceLineToIndex(statement.sourceLine) : -1,
                color: makeLabelColor(i, frame.sp)
            }
        })
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const riscv = this.riscv
        if (!riscv) return { decorations: [], code: '' }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<number, JsProgramStatement[]>()
        for (const statement of riscv.getCompiledStatements()) {
            const arr = joined.get(statement.sourceLine)
            if (arr) {
                arr.push(statement)
            } else {
                joined.set(statement.sourceLine, [statement])
            }
        }
        const decorations: EmulatorDecoration[] = []
        for (const statements of joined.values()) {
            //a single assembled statement is the source line itself, only expansions are worth showing
            if (statements.length <= 1) continue
            const original = statements[0]
            if (!original) continue
            const indent = original.source.length - original.source.trimStart().length
            const lines = statements.map(
                (statement) =>
                    `${' '.repeat(indent)}${formatStatement(statement.assemblyStatement)}`
            )
            decorations.push({
                type: 'below-line',
                note: 'Assembled instructions',
                belowLine: original.sourceLine,
                md: `\`\`\`riscv\n${lines.join('\n')}\n\`\`\``
            })
        }
        //RISC-V has no generated code panel, only the per-line expansion decorations
        return { decorations, code: '' }
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        //RISC-V has no status flags, the UI hides the whole section when this is empty
        return []
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.statementAtAddress(Number(address)))
    }

    _getNextInstruction(): Instruction | null {
        const riscv = this.riscv
        if (!riscv) return null
        try {
            return toInstruction(riscv.getNextStatement())
        } catch {
            //the core throws instead of returning null once there is no statement left to run
            return null
        }
    }

    _getPc(): bigint {
        const riscv = this.riscv
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.programCounterLong) : BigInt(riscv.programCounter)
    }

    _getSp(): bigint {
        const riscv = this.riscv
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.stackPointerLong) : BigInt(riscv.stackPointer)
    }

    _getRegisterValue(register: RISCVRegisterName, _size?: RegisterSize): bigint {
        const index = this._registerNames.indexOf(register)
        if (index === -1) throw new Error(`Unsupported register: ${register}`)
        //the core has no 64 bit safe single register getter (`getRegisterValueLong` returns the
        //core's internal BigInteger object), so read the whole file and index into it
        return this._getRegisterValues()[index] ?? 0n
    }

    _getRegisterValues(): bigint[] {
        const riscv = this.riscv
        if (!riscv) return new Array(this._registerNames.length).fill(0n)
        //`pc` is appended as the last register, mirroring `RISCVRegisterNames`.
        //`Array.from` and not `.map()`: the typings say `number[]` but `getRegistersValues()` hands
        //back an `Int32Array` (it was a plain array in v1), whose `map()` refuses a bigint result.
        if (this.is64Bit) {
            //the 64 bit values only survive as decimal strings, the number based getters truncate
            return [
                ...Array.from(riscv.getRegistersValuesLong(), (value) => BigInt(value)),
                BigInt(riscv.programCounterLong)
            ]
        }
        return [
            ...Array.from(riscv.getRegistersValues(), (value) => BigInt(value)),
            BigInt(riscv.programCounter)
        ]
    }

    _getRegisterValuesRecord(): Record<RISCVRegisterName, bigint> {
        const values = this._getRegisterValues()
        return Object.fromEntries(
            this._registerNames.map((name, i) => [name, values[i] ?? 0n])
        ) as Record<RISCVRegisterName, bigint>
    }

    _getStatus(): EmulatorStatus {
        return this._hasTerminated() ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const riscv = this.riscv
        if (!riscv) return []
        //the dropped entries have to be skipped *before* the `max` cut, not after: the core pushes
        //three control and status register backsteps (cycle, time, instret) on top of every executed
        //instruction, so slicing first hands back a window made almost entirely of entries that are
        //then filtered away — `_getUndoHistory(1)`, which `getLastExecutedLine()` uses to find the
        //instruction that just ran, would always come back empty.
        const steps: ExecutionStep[] = []
        for (const step of riscv.getUndoStack()) {
            if (steps.length >= max) break
            const mutation = this.backstepToMutation(step)
            //control and status register backsteps have no meaningful representation, legacy
            //dropped them from the list instead of rendering an empty row
            if (!mutation) continue
            const statement = this.statementAtAddress(step.pc)
            steps.push({
                pc: step.pc,
                //RISC-V has no condition code register, the UI reads these only for M68K
                old_ccr: { bits: 0 },
                new_ccr: { bits: 0 },
                line: statement ? sourceLineToIndex(statement.sourceLine) : -1,
                mutations: [mutation]
            })
        }
        return steps
    }

    _hasTerminated(): boolean {
        const riscv = this.riscv
        if (!riscv) return false
        try {
            //legacy parity: termination is derived purely from there being no next statement. The
            //core's own `terminated` flag must NOT be consulted here: it stays false after an exit
            //syscall and, once set by a cliff termination, `undo()` does not reset it, so stepping
            //back out of a finished program would leave the emulator permanently marked terminated.
            riscv.getNextStatement()
            return false
        } catch {
            return true
        }
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        return new Uint8Array(this.requireRiscV().readMemoryBytes(Number(address), Number(length)))
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireRiscV().setMemoryBytes(Number(address), Array.from(data))
    }

    _setRegisterValue(register: RISCVRegisterName, value: bigint, _size?: RegisterSize): void {
        const name = toCoreRegisterName(register)
        //the core takes 64 bit values as a high/low pair, which is also correct for RV32
        this.requireRiscV().setRegisterValue(name, ...bigintToHighLow(value))
    }

    async _step(): Promise<{ terminated: boolean }> {
        const riscv = this.requireRiscV()
        this.currentExecution = this.executionController.capture()
        await riscv.step()
        //the stop reason cannot answer this: the step that executes the *last* instruction reports
        //`MAX_STEPS` (only the step after it reports `CLIFF_TERMINATION`), and an `exit` ecall
        //reports `NORMAL_TERMINATION` while the core still has statements left to run. Legacy asked
        //the same question the same way, by probing for a next statement after the step.
        return { terminated: this._hasTerminated() }
    }

    _stringifyError(error: unknown, _line?: number): string {
        return getRISCVErrorMessage(error)
    }

    _undo(): void {
        this.requireRiscV().undo()
    }

    async _run(
        limit: number | undefined,
        breakpoints: number[] | undefined
    ): Promise<EmulatorStatus> {
        const riscv = this.requireRiscV()
        this.currentExecution = this.executionController.capture()
        const stopReason = await riscv.simulateWithBreakpointsAndLimit(
            calculateBreakpoints(riscv, breakpoints ?? []),
            toHaltLimit(limit)
        )
        return isTerminationStopReason(stopReason)
            ? EmulatorStatus.Terminated
            : EmulatorStatus.Running
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const riscv = this.requireRiscV()
        this.currentExecution = this.executionController.capture()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller
        await riscv.simulateWithLimit(toHaltLimit(haltLimit))
    }

    /**
     * The core suspends the pending `step`/`simulate*` call for as long as an IO handler's promise
     * is unsettled, so every input syscall goes through the terminal's async source. `type` mirrors
     * the handler name so the UI can tell which syscall is waiting.
     */
    private async read(type: string, question: string): Promise<string> {
        const execution = this.currentExecution
        this.state.interrupt = { type, message: question }
        try {
            return await this._peripherals.terminal.readAsync(question, execution)
        } finally {
            this.state.interrupt = undefined
        }
    }

    private async readNumber(type: string, question: string): Promise<number> {
        const answer = await this.read(type, question)
        const value = Number(answer)
        if (Number.isNaN(value)) throw new Error(INVALID_NUMBER_ERROR)
        return value
    }

    private async readCharacter(type: string, question: string): Promise<string> {
        const answer = await this.read(type, question)
        if (answer.length !== 1) throw new Error(INVALID_CHARACTER_ERROR)
        return answer
    }

    private async confirm(type: string, question: string): Promise<ConfirmResult> {
        const execution = this.currentExecution
        this.state.interrupt = { type, message: question }
        try {
            const answer = await this._peripherals.terminal.confirmAsync(question, execution)
            return answer ? ConfirmResult.YES : ConfirmResult.NO
        } finally {
            this.state.interrupt = undefined
        }
    }

    private makeHandlers(): HandlerMapFns {
        const terminal = this._peripherals.terminal
        return {
            readChar: () => this.readCharacter('ReadChar', READ_CHAR_QUESTION),
            readDouble: () => this.readNumber('ReadDouble', READ_DOUBLE_QUESTION),
            readFloat: () => this.readNumber('ReadFloat', READ_FLOAT_QUESTION),
            readInt: () => this.readNumber('ReadInt', READ_INT_QUESTION),
            readString: () => this.read('ReadString', READ_STRING_QUESTION),

            askDouble: (message: string) => this.readNumber('AskDouble', message),
            askFloat: (message: string) => this.readNumber('AskFloat', message),
            askInt: (message: string) => this.readNumber('AskInt', message),
            askString: (message: string) => this.read('AskString', message),

            confirm: (message: string) => this.confirm('Confirm', message),
            inputDialog: (message: string) => this.read('InputDialog', message),
            //output only, so it stays synchronous like the legacy emulator did. The terminal throws
            //instead of blocking when a scripted (testcase) run hits it, matching legacy which
            //registered `unimplementedHandler('outputDialog')` for testcases
            outputDialog: (message: string) => terminal.alertSync(message),

            printChar: (char: string) => terminal.write(char),
            printDouble: (value: number) => terminal.write(String(value)),
            printFloat: (value: number) => terminal.write(String(value)),
            printInt: (value: number) => terminal.write(String(value)),
            printString: (value: string) => terminal.write(value),
            log: (message: string) => terminal.write(message),
            logLine: (message: string) => terminal.write(`${message}\n`),
            stdOut: (buffer: number[]) => terminal.write(decodeBuffer(buffer)),
            stdErr: (buffer: number[]) => terminal.write(decodeBuffer(buffer)),

            readFile: unimplementedHandler('readFile'),
            writeFile: unimplementedHandler('writeFile'),
            openFile: unimplementedHandler('openFile'),
            closeFile: unimplementedHandler('closeFile'),
            stdIn: unimplementedHandler('stdIn'),
            sleep: unimplementedHandler('sleep')
        }
    }

    private backstepToMutation(step: JsBackStep): MutationOperation | null {
        switch (step.action) {
            case BackStepAction.REGISTER_RESTORE:
                return {
                    type: 'WriteRegister',
                    value: {
                        //`registers[i].name` is `_registerNames[i]` by construction, reading the
                        //names directly avoids depending on the register list being built already
                        register: this._registerNames[step.param1] ?? `x${step.param1}`,
                        old: 0n,
                        size: this._systemSize
                    }
                }
            case BackStepAction.FLOATING_POINT_REGISTER_RESTORE:
                return {
                    type: 'Other',
                    value: `Floating point register restore f${step.param1}`
                }
            case BackStepAction.MEMORY_RESTORE_BYTE:
                return makeMemoryBackstepMutation(step.param1, RegisterSize.Byte)
            case BackStepAction.MEMORY_RESTORE_HALF:
                return makeMemoryBackstepMutation(step.param1, RegisterSize.Word)
            case BackStepAction.MEMORY_RESTORE_WORD:
            case BackStepAction.MEMORY_RESTORE_RAW_WORD:
                return makeMemoryBackstepMutation(step.param1, RegisterSize.Long)
            case BackStepAction.MEMORY_RESTORE_DOUBLE_WORD:
                return makeMemoryBackstepMutation(step.param1, RegisterSize.Double)
            case BackStepAction.PC_RESTORE:
                return {
                    type: 'WriteRegister',
                    value: {
                        register: 'pc',
                        old: 0n,
                        size: this._systemSize
                    }
                }
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE:
                return null
            case BackStepAction.DO_NOTHING:
                return {
                    type: 'Other',
                    value: backStepActionMap[step.action]
                }
        }
        // The runtime uses -1 for a backstep without an action, although its type omits it.
        return null
    }

    private statementAtAddress(address: number): JsProgramStatement | null {
        try {
            //the core throws (instead of returning null) when no statement lives at the address
            return this.riscv?.getStatementAtAddress(address) ?? null
        } catch {
            return null
        }
    }

    private requireRiscV(): JsRiscV {
        if (!this.riscv) throw new Error('Interpreter not initialized')
        return this.riscv
    }
}

function getRISCVErrorMessage(error: unknown) {
    return String(error)
}

function sourceLineToIndex(sourceLine: number) {
    return sourceLine - 1
}

/**
 * The undo depth comes from a user setting, so it can be any number (or NaN). `0` means "no
 * history at all", which the core expresses as `setUndoEnabled(false)` rather than a zero sized
 * stack (a zero length backstep array makes the core throw on the first executed instruction).
 */
function normalizeUndoSize(undoSize: number): number {
    return Number.isFinite(undoSize) ? Math.max(0, Math.floor(undoSize)) : 0
}

function toHaltLimit(limit: number | undefined): number {
    return !limit || limit <= 0 ? Number.MAX_SAFE_INTEGER : limit
}

/**
 * The stop reasons that mean the program asked to stop or ran out of program:
 * - `CLIFF_TERMINATION`: ran off the bottom of the program (the only one legacy checked for)
 * - `NORMAL_TERMINATION`: an `exit` syscall
 *
 * The remaining ones leave the program runnable: `BREAKPOINT` (paused on a breakpoint), `MAX_STEPS`
 * (halt limit reached, also what a single `step()` returns), `NONE` (nothing ran yet) and
 * `PAUSE`/`STOP` (only reachable through core APIs this adapter does not use). `EXCEPTION` is never
 * observed as a value: a runtime exception rejects the pending `step`/`simulate*` promise instead.
 *
 * This is *not* the same question as "is there anything left to execute" (`_hasTerminated`), which
 * is what the emulator reports as terminated and what decides where the current line marker goes:
 * the core still has a next statement after an `exit` ecall, and it reports `MAX_STEPS`, not
 * `CLIFF_TERMINATION`, for the step that executes the last instruction of a program.
 */
function isTerminationStopReason(stopReason: StopReason): boolean {
    return (
        stopReason === StopReason.CLIFF_TERMINATION || stopReason === StopReason.NORMAL_TERMINATION
    )
}

function decodeBuffer(buffer: number[]): string {
    return new TextDecoder().decode(new Uint8Array(buffer))
}

function isRISCVCoreRegisterName(register: string): register is RegisterName {
    return RISCV_REGISTERS.some((candidate) => candidate === register)
}

/**
 * `pc` is exposed as a register so it shows up in the register list and in testcase expectations,
 * but the core only addresses the 32 general purpose ones.
 */
function toCoreRegisterName(register: RISCVRegisterName): RegisterName {
    if (!isRISCVCoreRegisterName(register)) {
        throw new Error(`Unsupported register: ${register}`)
    }
    return register
}

function calculateBreakpoints(riscv: JsRiscV, breakpoints: number[]): number[] {
    return breakpoints
        .map((line) => {
            //`state.breakpoints` holds 0 based editor lines, the core indexes source lines from 1
            const statement = riscv.getStatementAtSourceLine(line + 1)
            if (!statement) return -1
            return statement.address
        })
        .filter((address) => address !== -1)
}

function toInstruction(statement: JsProgramStatement | null | undefined): Instruction | null {
    if (!statement) return null
    return {
        address: BigInt(statement.address),
        lineNumber: sourceLineToIndex(statement.sourceLine),
        code: statement.source
    }
}

function assembleErrorToDiagnostic(error: RISCVAssembleError): Diagnostic {
    const lineIndex = sourceLineToIndex(error.lineNumber)
    return {
        severity: error.isWarning ? 'warning' : 'error',
        lineIndex,
        column: error.columnNumber,
        line: {
            line: '',
            line_index: lineIndex
        },
        message: error.message,
        formatted: error.message
    }
}

function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ')
    RISCV_REGISTERS.forEach((register, index) => {
        statement = statement.replace(new RegExp(`\\bx${index}\\b`, 'g'), register)
    })
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

function makeMemoryBackstepMutation(address: number, size: RegisterSize): MutationOperation {
    return {
        type: 'WriteMemory',
        value: {
            address: BigInt(address),
            size,
            old: 0n
        }
    }
}

const backStepActionMap = {
    [BackStepAction.MEMORY_RESTORE_RAW_WORD]: 'Memory restore raw word',
    [BackStepAction.MEMORY_RESTORE_DOUBLE_WORD]: 'Memory restore double word',
    [BackStepAction.MEMORY_RESTORE_WORD]: 'Memory restore word',
    [BackStepAction.MEMORY_RESTORE_HALF]: 'Memory restore half',
    [BackStepAction.MEMORY_RESTORE_BYTE]: 'Memory restore byte',
    [BackStepAction.REGISTER_RESTORE]: 'Register restore',
    [BackStepAction.PC_RESTORE]: 'PC restore',
    [BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE]: 'Control and status register restore',
    [BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR]: 'Control and status register backdoor',
    [BackStepAction.FLOATING_POINT_REGISTER_RESTORE]: 'Floating point register restore',
    [BackStepAction.DO_NOTHING]: 'Do nothing'
} satisfies Record<BackStepAction, string>
