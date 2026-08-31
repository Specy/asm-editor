import {
    BackStepAction,
    ConfirmResult,
    type HandlerMapFns,
    type JsBackStep,
    type JsMips,
    type JsProgramStatement,
    MIPS,
    type MIPSAssembleError,
    registerHandlers,
    type RegisterName,
    unimplementedHandler
} from '@specy/mips'
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

export const MIPSNumericRegisterNames: readonly RegisterName[] = [
    '$zero',
    '$at',
    '$v0',
    '$v1',
    '$a0',
    '$a1',
    '$a2',
    '$a3',
    '$t0',
    '$t1',
    '$t2',
    '$t3',
    '$t4',
    '$t5',
    '$t6',
    '$t7',
    '$s0',
    '$s1',
    '$s2',
    '$s3',
    '$s4',
    '$s5',
    '$s6',
    '$s7',
    '$t8',
    '$t9',
    '$k0',
    '$k1',
    '$gp',
    '$sp',
    '$fp',
    '$ra'
]

export type MIPSRegisterName = RegisterName | 'pc' | 'hi' | 'lo'

export const MIPSRegisterNames: MIPSRegisterName[] = [...MIPSNumericRegisterNames, 'pc', 'hi', 'lo']

const READ_CHAR_QUESTION = 'Enter a character'
const READ_DOUBLE_QUESTION = 'Enter a double'
const READ_FLOAT_QUESTION = 'Enter a float'
const READ_INT_QUESTION = 'Enter an integer'
const READ_STRING_QUESTION = 'Enter a string'

const INVALID_CHARACTER_ERROR = 'Invalid character'
const INVALID_NUMBER_ERROR = 'Invalid number'

export function MIPSEmulator(baseCode: string, options: EmulatorSettings = {}) {
    return new AsmEditorMIPSEmulator(baseCode, options)
}

class AsmEditorMIPSEmulator extends GenericEmulator<JsMips, MIPSRegisterName> {
    private mips: JsMips | null = null
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
                systemSize: RegisterSize.Long,
                registerNames: [...MIPSRegisterNames],
                hiddenRegisters: ['$zero'],
                endianness: 'little'
            },
            {
                ...options,
                language: options.language ?? 'MIPS',
                baseAddress: options.baseAddress ?? 0x10010000n,
                stackAddress: options.stackAddress ?? 0x7ffffffcn,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        //`pc`, `hi` and `lo` are readable in testcase expectations but the core has no setter for
        //them, so they must not be offered as starting registers (see `_setRegisterValue`)
        this.state.startingRegisterNames = [...MIPSNumericRegisterNames]
    }

    protected getInstance(): JsMips | null {
        return this.mips ?? null
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
        return this.mips?.canUndo ?? false
    }

    _checkCode(code: string): Diagnostic[] {
        const result = MIPS.makeMipsFromSource(code).assemble()
        return result.errors.map(assembleErrorToDiagnostic)
    }

    _compile(code: string, undoSize: number): CompileResult {
        this.mips = null
        const mips = MIPS.makeMipsFromSource(code)
        //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize` stored, so
        //the size has to be set *before* assembling: setting it afterwards would only size the next
        //compile's buffer (legacy ordering was setUndoSize -> assemble -> setUndoEnabled)
        mips.setUndoSize(Math.max(1, normalizeUndoSize(undoSize)))
        const result = mips.assemble()
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
        this.mips = mips
        return { ok: true, diagnostics }
    }

    _initialize(undoSize: number): void {
        const mips = this.requireMips()
        //the stack was already sized in `_compile`, `assemble()` engages the backstepper
        //unconditionally so this is what actually turns undo off when history is disabled
        mips.setUndoEnabled(normalizeUndoSize(undoSize) > 0)
        mips.initialize(true)
        registerHandlers(mips, this.makeHandlers())
    }

    _dispose(): void {
        this.mips = null
    }

    _getCallStack(): StackFrame[] {
        const mips = this.mips
        if (!mips) return []
        return mips.getCallStack().map((frame, i) => {
            const address = frame.toAddress
            return {
                address: BigInt(address),
                destination: BigInt(frame.pc),
                sp: BigInt(frame.sp),
                name:
                    mips.getLabelAtAddress(address) ?? `0x${address.toString(16).padStart(8, '0')}`,
                line: (this.statementAtAddress(address)?.sourceLine ?? 0) - 1,
                color: makeLabelColor(i, frame.sp)
            }
        })
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const mips = this.mips
        if (!mips) return { decorations: [], code: '' }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<number, JsProgramStatement[]>()
        for (const statement of mips.getCompiledStatements()) {
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
                md: `\`\`\`mips\n${lines.join('\n')}\n\`\`\``
            })
        }
        //MIPS has no generated code panel, only the per-line expansion decorations
        return { decorations, code: '' }
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        //MIPS has no status flags, the UI hides the whole section when this is empty
        return []
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.statementAtAddress(Number(address)))
    }

    _getNextInstruction(): Instruction | null {
        const mips = this.mips
        if (!mips) return null
        try {
            return toInstruction(mips.getNextStatement())
        } catch {
            //the core throws instead of returning null once there is no statement left to run
            return null
        }
    }

    _getPc(): bigint {
        return BigInt(this.mips?.programCounter ?? 0)
    }

    _getSp(): bigint {
        return BigInt(this.mips?.stackPointer ?? 0)
    }

    _getRegisterValue(register: MIPSRegisterName, _size?: RegisterSize): bigint {
        const name = toNumericRegisterName(register)
        return BigInt(this.requireMips().getRegisterValue(name))
    }

    _getRegisterValues(): bigint[] {
        const mips = this.mips
        if (!mips) return new Array(this._registerNames.length).fill(0n)
        return [...mips.getRegistersValues(), mips.programCounter, mips.getHi(), mips.getLo()].map(
            (value) => BigInt(value)
        )
    }

    _getRegisterValuesRecord(): Record<MIPSRegisterName, bigint> {
        const values = this._getRegisterValues()
        return Object.fromEntries(
            this._registerNames.map((name, i) => [name, values[i] ?? 0n])
        ) as Record<MIPSRegisterName, bigint>
    }

    _getStatus(): EmulatorStatus {
        return this._hasTerminated() ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const mips = this.mips
        if (!mips) return []
        return mips
            .getUndoStack()
            .slice(0, max)
            .map((step) => ({
                pc: step.pc,
                //MIPS has no condition code register, the UI reads these only for M68K
                old_ccr: { bits: 0 },
                new_ccr: { bits: 0 },
                line: (this.statementAtAddress(step.pc)?.sourceLine ?? 0) - 1,
                mutations: [backstepToMutation(step)]
            }))
    }

    _hasTerminated(): boolean {
        const mips = this.mips
        if (!mips) return false
        try {
            //legacy parity: termination is derived purely from there being no next statement. The
            //core's own `terminated` flag must NOT be consulted here because `undo()` does not reset
            //it, so stepping back out of a finished program would leave the emulator permanently
            //marked as terminated and every execution control disabled.
            mips.getNextStatement()
            return false
        } catch {
            return true
        }
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        return new Uint8Array(this.requireMips().readMemoryBytes(Number(address), Number(length)))
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireMips().setMemoryBytes(Number(address), Array.from(data))
    }

    _setRegisterValue(register: MIPSRegisterName, value: bigint, _size?: RegisterSize): void {
        const name = toNumericRegisterName(register)
        this.requireMips().setRegisterValue(name, Number(value))
    }

    async _step(): Promise<{ terminated: boolean }> {
        const mips = this.requireMips()
        this.currentExecution = this.executionController.capture()
        await mips.step()
        //`step()`'s own boolean cannot answer this: it is still `false` for the step that executes
        //the *last* instruction of the program (only the step after it reports `true`), which would
        //make the generic layer look for a next instruction, find none and clear the current line
        //marker. Legacy asked the same question the same way, by probing for a next statement.
        return { terminated: this._hasTerminated() }
    }

    _stringifyError(error: unknown, _line?: number): string {
        return getMIPSErrorMessage(error)
    }

    _undo(): void {
        this.requireMips().undo()
    }

    async _run(
        limit: number | undefined,
        breakpoints: number[] | undefined
    ): Promise<EmulatorStatus> {
        const mips = this.requireMips()
        this.currentExecution = this.executionController.capture()
        const terminated = await mips.simulateWithBreakpointsAndLimit(
            calculateBreakpoints(mips, breakpoints ?? []),
            toHaltLimit(limit)
        )
        return terminated ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const mips = this.requireMips()
        this.currentExecution = this.executionController.capture()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller
        await mips.simulateWithLimit(toHaltLimit(haltLimit))
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

    private statementAtAddress(address: number): JsProgramStatement | null {
        try {
            return this.mips?.getStatementAtAddress(address) ?? null
        } catch {
            return null
        }
    }

    private requireMips(): JsMips {
        if (!this.mips) throw new Error('Interpreter not initialized')
        return this.mips
    }
}

function getMIPSErrorMessage(error: unknown) {
    return String(error)
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

function decodeBuffer(buffer: number[]): string {
    return new TextDecoder().decode(new Uint8Array(buffer))
}

function isMIPSNumericRegisterName(register: string): register is RegisterName {
    return MIPSNumericRegisterNames.some((candidate) => candidate === register)
}

/**
 * `pc`, `hi` and `lo` are exposed as registers so they show up in the register list and in testcase
 * expectations, but the core only addresses the 32 general purpose ones.
 */
function toNumericRegisterName(register: MIPSRegisterName): RegisterName {
    if (!isMIPSNumericRegisterName(register)) {
        throw new Error(`Unsupported register: ${register}`)
    }
    return register
}

function calculateBreakpoints(mips: JsMips, breakpoints: number[]): number[] {
    return breakpoints
        .map((line) => {
            //`state.breakpoints` holds 0 based editor lines, the core indexes source lines from 1
            const statement = mips.getStatementAtSourceLine(line + 1)
            if (!statement) return -1
            return statement.address
        })
        .filter((address) => address !== -1)
}

function toInstruction(statement: JsProgramStatement | null | undefined): Instruction | null {
    if (!statement) return null
    return {
        address: BigInt(statement.address),
        lineNumber: statement.sourceLine - 1,
        code: statement.source
    }
}

function assembleErrorToDiagnostic(error: MIPSAssembleError): Diagnostic {
    return {
        severity: error.isWarning ? 'warning' : 'error',
        lineIndex: error.lineNumber - 1,
        column: error.columnNumber,
        line: {
            line: '',
            line_index: error.lineNumber
        },
        message: error.message,
        formatted: error.message
    }
}

function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ')
    for (let index = MIPSNumericRegisterNames.length - 1; index >= 0; index--) {
        const register = MIPSNumericRegisterNames[index]
        if (!register) continue
        statement = statement.replace(new RegExp(`\\$${index}\\b`, 'g'), register)
    }
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

function backstepToMutation(step: JsBackStep): MutationOperation {
    if (step.action === BackStepAction.REGISTER_RESTORE) {
        return makeRegisterBackstepMutation(getRegisterFileName(step.param1))
    }
    if (step.action === BackStepAction.COPROC0_REGISTER_RESTORE) {
        return makeRegisterBackstepMutation(getCP0RegisterName(step.param1))
    }
    if (step.action === BackStepAction.COPROC1_REGISTER_RESTORE) {
        return makeRegisterBackstepMutation(getCP1RegisterName(step.param1))
    }
    const memorySize = getMemoryBackstepSize(step.action)
    if (memorySize !== undefined) {
        return {
            type: 'WriteMemory',
            value: {
                address: BigInt(step.param1),
                size: memorySize,
                old: 0n
            }
        }
    }
    if (step.action === BackStepAction.PC_RESTORE) {
        return makeRegisterBackstepMutation('$pc')
    }
    if (step.action === BackStepAction.COPROC1_CONDITION_CLEAR) {
        return {
            type: 'Other',
            value: `CP1 condition flag ${step.param1} restore: clear`
        }
    }
    if (step.action === BackStepAction.COPROC1_CONDITION_SET) {
        return {
            type: 'Other',
            value: `CP1 condition flag ${step.param1} restore: set`
        }
    }
    return {
        type: 'Other',
        value: backStepActionMap[step.action]
    }
}

const backStepActionMap = {
    [BackStepAction.MEMORY_RESTORE_BYTE]: 'Memory restore byte',
    [BackStepAction.MEMORY_RESTORE_HALF]: 'Memory restore half',
    [BackStepAction.MEMORY_RESTORE_WORD]: 'Memory restore word',
    [BackStepAction.MEMORY_RESTORE_RAW_WORD]: 'Memory restore raw word',
    [BackStepAction.COPROC0_REGISTER_RESTORE]: 'Coproc0 register restore',
    [BackStepAction.COPROC1_REGISTER_RESTORE]: 'Coproc1 register restore',
    [BackStepAction.COPROC1_CONDITION_CLEAR]: 'Coproc1 condition clear',
    [BackStepAction.COPROC1_CONDITION_SET]: 'Coproc1 condition set',
    [BackStepAction.DO_NOTHING]: 'Do nothing',
    [BackStepAction.REGISTER_RESTORE]: 'Register restore',
    [BackStepAction.PC_RESTORE]: 'PC restore'
} satisfies Record<BackStepAction, string>

function makeRegisterBackstepMutation(register: string): MutationOperation {
    return {
        type: 'WriteRegister',
        value: {
            register,
            old: 0n,
            size: RegisterSize.Long
        }
    }
}

function getRegisterFileName(index: number) {
    const generalRegister = MIPSNumericRegisterNames[index]
    if (generalRegister) return generalRegister
    if (index === 33) return 'hi'
    if (index === 34) return 'lo'
    return `GPR[${index}]`
}

function getCP0RegisterName(index: number) {
    switch (index) {
        case 8:
            return 'CP0 $8 (vaddr)'
        case 12:
            return 'CP0 $12 (status)'
        case 13:
            return 'CP0 $13 (cause)'
        case 14:
            return 'CP0 $14 (epc)'
        default:
            return `CP0[${index}]`
    }
}

function getCP1RegisterName(index: number) {
    if (Number.isInteger(index) && index >= 0 && index < 32) return `$f${index}`
    return `CP1[${index}]`
}

function getMemoryBackstepSize(action: BackStepAction): RegisterSize | undefined {
    switch (action) {
        case BackStepAction.MEMORY_RESTORE_BYTE:
            return RegisterSize.Byte
        case BackStepAction.MEMORY_RESTORE_HALF:
            return RegisterSize.Word
        case BackStepAction.MEMORY_RESTORE_WORD:
        case BackStepAction.MEMORY_RESTORE_RAW_WORD:
            return RegisterSize.Long
        case BackStepAction.REGISTER_RESTORE:
        case BackStepAction.PC_RESTORE:
        case BackStepAction.COPROC0_REGISTER_RESTORE:
        case BackStepAction.COPROC1_REGISTER_RESTORE:
        case BackStepAction.COPROC1_CONDITION_CLEAR:
        case BackStepAction.COPROC1_CONDITION_SET:
        case BackStepAction.DO_NOTHING:
            return undefined
    }
    const exhaustiveAction: never = action
    return exhaustiveAction
}
