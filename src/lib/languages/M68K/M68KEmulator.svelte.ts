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
import {
    describeUnsupportedTrapTask,
    easy68kColorOf,
    M68K_DRAWING_MODES,
    M68K_MIN_SCREEN_HEIGHT,
    M68K_MIN_SCREEN_WIDTH,
    M68K_MOUSE_FLAGS,
    M68K_MOUSE_MODES,
    screenColorOf
} from '$lib/languages/M68K/M68K-traps'
import type { MouseSnapshot } from '$lib/languages/peripherals/Mouse'
import { echoToScreen } from '$lib/languages/peripherals/screen/textEcho'
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
    ReadKeyboardString: READ_STRING_QUESTION,
    DisplayStringAndReadNumber: READ_NUMBER_QUESTION
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
    /**
     * EASy68K's drawing mode 2, "move cursor but do not draw": the Windows GDI `R2_NOP` the
     * simulator sets, where a drawing operation leaves every pixel alone but still moves the drawing
     * point. Mode 4 puts it back; the other modes never reach the editor, the Core rejects them.
     */
    private penOnly = false
    /**
     * Whether the program has used the Screen, the Keyboard or the Mouse in this run. It is what
     * decides where the Terminal's interactive reads come from
     * ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)).
     */
    private graphical = false

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
        //the trap state of the run that just ended must not colour the next one: a program stopped
        //while drawing in mode 2 would otherwise start the next run unable to draw
        this.penOnly = false
        this.graphical = false
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
        //a run starts with the input prompt every M68K program has always had; the first graphics,
        //keyboard or mouse task moves input to the focused Screen instead (see `useScreenInput`)
        this._peripherals.terminal.usePromptInput()
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
            const wait = await this.handleInterrupt(
                interpreter.getCurrentInterrupt(),
                interpreter,
                execution
            )
            //a step has no scheduler to hand the wait to, so it is awaited here; a testcase's
            //virtual clock makes that immediate (ADR 0010)
            if (wait) await this.executionController.waitFor(execution, () => wait)
        }
        this.executionController.ensureCurrent(execution)
        return { terminated: interpreter.hasTerminated() }
    }

    _stringifyError(error: unknown, line?: number): string {
        return getM68kErrorMessage(withTrapTaskExplained(error), line)
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
            const wait = await this.handleInterpreterInterruption(interpreter, execution)
            //a Delay is program time, not execution: the scheduler awaits it between slices, so the
            //GUI keeps repainting and Stop still answers while it runs (ADR 0007, ADR 0010)
            if (wait) return { reason: 'wait', instructions, wait }
        }
        return { reason: 'terminated', instructions }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const interpreter = this.requireInterpreter()
        const limit = toHaltLimit(haltLimit)
        const execution = this.executionController.capture()
        while (!interpreter.hasTerminated()) {
            interpreter.runWithLimit(limit)
            //a testcase runs unsliced, so a wait is awaited here; its clock is the virtual one, on
            //which waits complete at once (ADR 0010)
            const wait = await this.handleInterpreterInterruption(interpreter, execution)
            if (wait) await this.executionController.waitFor(execution, () => wait)
        }
    }

    /**
     * Answers whatever the Core stopped for, and hands back the program-requested wait when the trap
     * was a Delay, for the caller to await where it belongs.
     */
    private async handleInterpreterInterruption(
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<Promise<void> | undefined> {
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
                return await this.handleInterrupt(
                    interpreter.getCurrentInterrupt(),
                    interpreter,
                    execution
                )
            }
        }
        return undefined
    }

    /**
     * The whole `trap #15` interface, task by task: EASy68K's tasks as the Core decodes them, each
     * routed to the peripheral that owns it
     * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)). Answering
     * is what resumes the Core, so every branch ends in `answerInterrupt`; the Delay branch answers
     * first and returns its wait, because the program is not blocked on the trap any more, only on
     * time passing.
     */
    private async handleInterrupt(
        interrupt: Interrupt | null,
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<Promise<void> | undefined> {
        if (!interrupt) throw new Error('Expected interrupt')
        this.executionController.ensureCurrent(execution)
        const terminal = this._peripherals.terminal
        const screen = this._peripherals.screen
        const { type } = interrupt
        const question = INTERRUPT_INPUT_QUESTIONS[type]
        this.state.interrupt = question ? { type, message: question } : { type }
        try {
            switch (type) {
                // ------------------------------------------------------------- text
                case 'DisplayStringWithCRLF': {
                    this.print(`${interrupt.value}\n`)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayStringWithoutCRLF':
                case 'DisplayChar':
                case 'DisplayNumber': {
                    this.print(String(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayNumberInBase': {
                    const { value, base } = interrupt.value
                    this.print(value.toString(base))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplaySignedNumberInField': {
                    const { value, width } = interrupt.value
                    //EASy68K right justifies in the field and lets a longer number overflow it
                    this.print(String(value).padStart(width))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayStringAndNumber': {
                    const { string, number } = interrupt.value
                    this.print(`${string}${number}`)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DisplayStringAndReadNumber': {
                    this.print(interrupt.value)
                    const number = await this.readNumber(execution)
                    interpreter.answerInterrupt({ type, value: number })
                    break
                }
                case 'ReadChar': {
                    //one keystroke at a time once the Screen's Keyboard is the source; with a prompt
                    //it is still the first character of the answered line (ADR 0009)
                    const char = await this.requestCharacter(READ_CHAR_QUESTION, execution)
                    if (!char) throw new Error(`Expected a character, got "${char}"`)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: char })
                    break
                }
                case 'ReadNumber': {
                    const number = await this.readNumber(execution)
                    interpreter.answerInterrupt({ type, value: number })
                    break
                }
                case 'ReadKeyboardString': {
                    const string = await this.requestInput(READ_STRING_QUESTION, execution)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: string })
                    break
                }
                case 'Terminate': {
                    interpreter.answerInterrupt({ type })
                    break
                }

                // --------------------------------------------------- keyboard and mouse
                case 'CheckKeyboardInput': {
                    this.useScreenInput()
                    //through the Terminal rather than straight to the Keyboard, so the poll and the
                    //read after it see the same pending input, scripted input included (ADR 0009)
                    interpreter.answerInterrupt({ type, value: terminal.hasPendingInput() })
                    break
                }
                case 'GetKeyState': {
                    this.useScreenInput()
                    const keyboard = this._peripherals.keyboard
                    const request = interrupt.value
                    if (request.type === 'Keys') {
                        const [first, second, third, fourth] = keyboard.areKeysDown(request.value)
                        interpreter.answerInterrupt({
                            type,
                            value: { type: 'Keys', value: [first, second, third, fourth] }
                        })
                        break
                    }
                    const { down, up } = keyboard.lastKeys()
                    interpreter.answerInterrupt({
                        type,
                        value: { type: 'LastKeys', value: { up, down } }
                    })
                    break
                }
                case 'ReadMouse': {
                    this.useScreenInput()
                    const mouse = this._peripherals.mouse
                    const mode = interrupt.value
                    const snapshot =
                        mode === M68K_MOUSE_MODES.LAST_UP
                            ? mouse.lastUp()
                            : mode === M68K_MOUSE_MODES.LAST_DOWN
                              ? mouse.lastDown()
                              : mouse.state()
                    interpreter.answerInterrupt({
                        type,
                        value: {
                            flags: mouseFlagsOf(snapshot),
                            x: snapshot.x,
                            y: snapshot.y
                        }
                    })
                    break
                }
                case 'SetSimulatorShortcuts': {
                    //nothing to give up: the Screen panel already hands every key it takes to the
                    //program, so enabling and disabling the shortcuts are both no-ops (ADR 0008)
                    interpreter.answerInterrupt({ type })
                    break
                }

                // ----------------------------------------------------------- the screen
                case 'SetPenColor': {
                    this.useScreenInput()
                    screen.setPenColor(screenColorOf(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetFillColor': {
                    this.useScreenInput()
                    screen.setFillColor(screenColorOf(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawPixel': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (!this.penOnly) screen.drawPixel(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetPixelColor': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    interpreter.answerInterrupt({
                        type,
                        value: easy68kColorOf(screen.getPixel(x, y))
                    })
                    break
                }
                case 'DrawLine': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    //mode 2 draws nothing but still moves the drawing point, which tasks 84 and 85
                    //leave at their end point
                    if (this.penOnly) screen.moveTo(x2, y2)
                    else screen.drawLine(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawLineTo': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (this.penOnly) screen.moveTo(x, y)
                    else screen.lineTo(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'MoveTo': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    screen.moveTo(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawRectangle': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawRectangle(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawUnfilledRectangle': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawUnfilledRectangle(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawEllipse': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawEllipse(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawUnfilledEllipse': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawUnfilledEllipse(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'FloodFill': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (!this.penOnly) screen.floodFill(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawText': {
                    this.useScreenInput()
                    const [x, y, text] = interrupt.value
                    if (!this.penOnly) screen.drawText(x, y, text)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetPenWidth': {
                    this.useScreenInput()
                    screen.setPenWidth(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetDrawingMode': {
                    this.useScreenInput()
                    this.setDrawingMode(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'Repaint': {
                    this.useScreenInput()
                    screen.present()
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetPenPosition': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({ type, value: [screen.penX, screen.penY] })
                    break
                }
                case 'SetScreenSize': {
                    this.useScreenInput()
                    const [width, height] = interrupt.value
                    //EASy68K's own minimum output window, which its help states for task 33
                    screen.resize(
                        Math.max(M68K_MIN_SCREEN_WIDTH, width),
                        Math.max(M68K_MIN_SCREEN_HEIGHT, height)
                    )
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetScreenSize': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({ type, value: [screen.width, screen.height] })
                    break
                }
                case 'SetScreenMode': {
                    //windowed and full screen are the simulator window's business; here the Screen
                    //is a panel the user sizes, so both requests are accepted and ignored
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'ClearScreen': {
                    this.useScreenInput()
                    //text and graphics share one image, so clearing clears both and homes the cursor
                    screen.clear()
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetTextCursorPosition': {
                    this.useScreenInput()
                    const [column, row] = interrupt.value
                    screen.setCursor(column, row)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetTextCursorPosition': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({
                        type,
                        value: [screen.cursorColumn, screen.cursorRow]
                    })
                    break
                }

                // ------------------------------------------------------- program time
                case 'GetTime': {
                    //hundredths of a second since the run started, from the clock a testcase swaps
                    //for a virtual one (ADR 0010); EASy68K counts from midnight instead
                    interpreter.answerInterrupt({
                        type,
                        value: this._peripherals.clock.nowHundredths()
                    })
                    break
                }
                case 'Delay': {
                    //answered before the wait: the program is no longer stopped on the trap, only on
                    //time passing, which the scheduler awaits between slices
                    interpreter.answerInterrupt({ type })
                    return this._peripherals.clock.waitHundredths(interrupt.value)
                }
                default:
                    throw new Error(`Unknown interrupt type "${type}"`)
            }
        } finally {
            this.state.interrupt = undefined
        }
        return undefined
    }

    /**
     * Console output goes to the Terminal transcript and to the Screen's text cursor at once:
     * EASy68K has one output window where text and graphics share the image, and the transcript is
     * what testcases assert on (ADR 0003).
     */
    private print(text: string): void {
        this._peripherals.terminal.write(text)
        this._peripherals.screen.writeText(text)
    }

    /** Tasks 4 and 18, which read the same line and reject the same answers. */
    private async readNumber(execution: ExecutionGeneration): Promise<number> {
        const answer = await this.requestInput(READ_NUMBER_QUESTION, execution)
        const number = Number(answer)
        if (Number.isNaN(number) || answer === '') {
            throw new Error(`Expected a number, got "${answer === '' ? '' : number}"`)
        }
        this.executionController.ensureCurrent(execution)
        return number
    }

    /** Task 92, of whose modes the Core only ever forwards these four. */
    private setDrawingMode(mode: number): void {
        switch (mode) {
            case M68K_DRAWING_MODES.MOVE_WITHOUT_DRAWING:
                this.penOnly = true
                return
            case M68K_DRAWING_MODES.DRAW:
                this.penOnly = false
                return
            case M68K_DRAWING_MODES.DOUBLE_BUFFERING_OFF:
                this._peripherals.screen.setDoubleBuffering(false)
                return
            case M68K_DRAWING_MODES.DOUBLE_BUFFERING_ON:
                this._peripherals.screen.setDoubleBuffering(true)
                return
        }
    }

    /**
     * The Terminal's interactive source is chosen by what the program does, once per run: a program
     * that only prints keeps the input prompt it has always had, and the first graphics, keyboard or
     * mouse task moves reads to the focused Screen's Keyboard, echoing what is typed at the text
     * cursor as well as into the transcript (ADR 0003, ADR 0009). The switch happens at most once
     * and never goes back, so the source is still fixed for the run.
     */
    private useScreenInput(): void {
        if (this.graphical) return
        this.graphical = true
        const { terminal, keyboard, screen } = this._peripherals
        terminal.useKeyboardInput(keyboard, (text) => echoToScreen(screen, text))
    }

    private requireInterpreter(): Interpreter {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        return this.interpreter
    }
}

/**
 * The Core knows a task it cannot decode only as a number, and says so; this says which task it was
 * and, for the ones this editor deliberately does not support, why. Anything else is passed through
 * untouched.
 */
function withTrapTaskExplained(error: unknown): unknown {
    if (typeof error !== 'object' || error === null) return error
    const raw = error as { type?: unknown; value?: unknown }
    if (raw.type !== 'Raw' || typeof raw.value !== 'string') return error
    const match = /^Unknown interrupt: (\d+)$/.exec(raw.value)
    if (!match) return error
    return { type: 'Raw', value: describeUnsupportedTrapTask(Number(match[1])) }
}

/** Task 61's flags byte: `Ctrl, Alt, Shift, Double, Middle, Right, Left` from bit 6 down. */
function mouseFlagsOf(snapshot: MouseSnapshot): number {
    return (
        (snapshot.left ? M68K_MOUSE_FLAGS.LEFT : 0) |
        (snapshot.right ? M68K_MOUSE_FLAGS.RIGHT : 0) |
        (snapshot.middle ? M68K_MOUSE_FLAGS.MIDDLE : 0) |
        (snapshot.double ? M68K_MOUSE_FLAGS.DOUBLE : 0) |
        (snapshot.shift ? M68K_MOUSE_FLAGS.SHIFT : 0) |
        (snapshot.alt ? M68K_MOUSE_FLAGS.ALT : 0) |
        (snapshot.ctrl ? M68K_MOUSE_FLAGS.CTRL : 0)
    )
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
