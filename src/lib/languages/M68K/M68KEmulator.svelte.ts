import {
    ccrToFlagsArray,
    type ExecutionStep as CoreExecutionStep,
    type FileDialogMode,
    type InputSettings,
    type InstructionLine,
    Interpreter,
    InterpreterStatus as CoreInterpreterStatus,
    type Interrupt,
    type OpenedFile,
    type PokeWrite as CorePokeWrite,
    type RegisterOperand,
    type Program,
    S68k,
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
    sliceDeadline,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'
import {
    type BuildArtifact,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    makeLabelColor,
    type MutationOperation,
    type PokeWrite,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import type { Termination } from '$lib/languages/termination'
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
import {
    type FileDescriptorOptions,
    FileSystemGuestError,
    type FileSystemSession
} from '$lib/languages/peripherals/FileSystem'
import type { MouseSnapshot } from '$lib/languages/peripherals/Mouse'
import type { TerminalReadOptions } from '$lib/languages/peripherals/Terminal.svelte'
import { echoToScreen } from '$lib/languages/peripherals/screen/textEcho'
import { ScreenInstructionHistory } from '$lib/languages/peripherals/screen/ScreenInstructionHistory'
import type { Testcase } from '$lib/Project.svelte'
import type { BuildInput, BuildSources } from '$lib/projectFiles'
import { m68kAssemblyFiles } from './m68kAssemblyFiles'
import { s68kDiagnosticToDiagnostic } from './m68kDiagnostics'

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
 * budget into a halt limit. Measured in phase 8 on a compute-only loop under node, which came to
 * about eighteen thousand; the estimate is rounded down because every other program is slower, and
 * a trap-heavy one is bounded by the slice's deadline instead (see `_runSlice`).
 */
const M68K_INSTRUCTIONS_PER_MS = 15_000

const READ_CHAR_QUESTION = 'Enter a character'
const READ_NUMBER_QUESTION = 'Enter a number'
const READ_STRING_QUESTION = 'Enter a string'
const FILE_DIALOG_QUESTION = 'Choose a File'

const INTERRUPT_INPUT_QUESTIONS: Partial<Record<Interrupt['type'], string>> = {
    ReadChar: READ_CHAR_QUESTION,
    ReadNumber: READ_NUMBER_QUESTION,
    ReadKeyboardString: READ_STRING_QUESTION,
    DisplayStringAndReadNumber: READ_NUMBER_QUESTION,
    FileDialog: FILE_DIALOG_QUESTION
}

/**
 * EASy68K's file numbers, which the FileSystem session hands out: the lowest free one from 0, and
 * at most eight open at once (`MAXFILES`, `SIMOPS2.CPP`), so a ninth open is answered with null.
 */
const EASY68K_FILE_DESCRIPTORS: FileDescriptorOptions = { firstDescriptor: 0, maxOpen: 8 }

/**
 * The sound tasks, by the interrupt the Core raises for each. Nothing can play them until the
 * Audio Peripheral exists ([the plan](../../../../docs/design/environment-library-plan.md), Later),
 * so each one ends the program with the reason from the trap table.
 */
const SOUND_TASKS = {
    PlaySound: 70,
    LoadSound: 71,
    PlayLoadedSound: 72,
    PlaySoundDirectX: 73,
    LoadSoundDirectX: 74,
    PlayLoadedSoundDirectX: 75,
    ControlSound: 76,
    ControlSoundDirectX: 77
} as const satisfies Partial<Record<Interrupt['type'], number>>

/**
 * How the program ended when the editor answered a task with `Terminate`, which it does only for a
 * task it cannot carry out (sound). The run ends on the error that names the task, which is what the
 * Log and the console show; this is the Core's own account of the same end.
 */
const ENDED_BY_THE_EDITOR = 'The editor ended the program at a trap #15 task it cannot carry out'

const sizeMap = {
    [Size.Byte]: RegisterSize.Byte,
    [Size.Word]: RegisterSize.Word,
    [Size.Long]: RegisterSize.Long
} satisfies Record<Size, RegisterSize>

/**
 * The width a mutation names, as the panels count it. The Core's types declare the numeric `Size`
 * enum, but a step crosses the wasm boundary through serde, which spells the variant by name
 * (`"Long"`), so the name is looked up through the enum's reverse mapping before the table; a
 * history row would otherwise carry no width at all and read as "undefined bytes".
 */
function mutationSize(size: Size | keyof typeof Size): RegisterSize {
    return sizeMap[typeof size === 'string' ? Size[size] : size]
}

export function M68KEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorM68KEmulator(source, options)
}

class AsmEditorM68KEmulator extends GenericEmulator<Interpreter, M68KRegisterName> {
    private program: Program | null = null
    private interpreter: Interpreter | null = null
    private screenInstructions: ScreenInstructionHistory | null = null
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

    constructor(source: BuildInput, options: EmulatorSettings) {
        super(
            source,
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
        this.screenInstructions?.clear()
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
        if (stackTab && !stackTab.userPlaced) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
    }

    _beginPoke(): void {
        this.requireInterpreter().beginPoke()
    }

    _endPoke(): boolean {
        return this.requireInterpreter().endPoke()
    }

    _canUndo(): boolean {
        const interpreter = this.interpreter
        if (!interpreter?.canUndo()) return false
        //a Poke on top is the Core's alone to roll back: it drew nothing, touched no File, and it
        //holds a step id of its own that neither journal ever hung an effect on
        //([ADR 0022](../../../../docs/adr/0022-core-native-poke-records.md))
        if (interpreter.getUndoHistory(1)[0]?.kind === 'poke') return true
        const step = interpreter.getLastStepId()
        //both journals are asked before anything rolls back: one whose inverse is gone under its
        //budget stops Undo before this instruction ([ADR 0015](../../../../docs/adr/0015-restore-file-operations-on-undo.md))
        return (
            (this.screenInstructions?.canUndoAfter(step - 1) ?? true) &&
            (this.fileSystemSession?.canUndoAfter(step) ?? true)
        )
    }

    /** EASy68K's eight file numbers, from 0, rather than the 3 upward of MARS, RARS and Linux. */
    protected fileDescriptorOptions(): FileDescriptorOptions {
        return EASY68K_FILE_DESCRIPTORS
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
        result.program?.dispose()
        return result.diagnostics.map((diagnostic) =>
            s68kDiagnosticToDiagnostic(diagnostic, sources)
        )
    }

    _compile(sources: BuildSources): CompileResult {
        //Both hold WebAssembly memory the host never reclaims on its own, so the Interpreter is
        //disposed here as well as in `_dispose`: a Build replaces it, and the edit/Build loop would
        //otherwise abandon one interpreter's linear memory per Build.
        this.interpreter?.dispose()
        this.program?.dispose()
        this.program = null
        this.interpreter = null
        const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
        const diagnostics = result.diagnostics.map((diagnostic) =>
            s68kDiagnosticToDiagnostic(diagnostic, sources)
        )
        if (!result.program) {
            return {
                ok: false,
                diagnostics,
                report: diagnostics.map((diagnostic) => diagnostic.formatted).join('\n')
            }
        }
        this.program = result.program
        return { ok: true, diagnostics }
    }

    _initialize(undoSize: number): void {
        const program = this.program
        if (!program) throw new Error('Interpreter not initialized')
        //a run starts reading what is typed in the Terminal; the first graphics, keyboard or mouse
        //task moves input to the focused Screen instead (see `useScreenInput`)
        this._peripherals.terminal.useTerminalInput((text) =>
            echoToScreen(this._peripherals.screen, text)
        )
        this.interpreter = new Interpreter(program, {
            history_size: undoSize,
            keep_history: undoSize > 0
        })
        this.screenInstructions = new ScreenInstructionHistory(this._peripherals.screen, undoSize)
    }

    _dispose(): void {
        this.interpreter?.dispose()
        this.program?.dispose()
        this.interpreter = null
        this.program = null
    }

    _getCallStack(): StackFrame[] {
        return (
            this.interpreter?.getCallStack().map((frame, i) => ({
                address: BigInt(frame.address),
                name: frame.label_name,
                line: frame.label_location?.line ?? -1,
                file: frame.label_location?.file,
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

    protected _getBuildArtifacts(): BuildArtifact[] {
        const interpreter = this.interpreter
        const program = this.program
        if (!interpreter || !program) return []
        const result: BuildArtifact[] = []
        for (const address of program.getInstructionAddresses()) {
            const instruction = interpreter.getInstructionAt(address)
            if (!instruction || instruction.size <= 0) continue
            result.push({
                file: instruction.location.file,
                line: instruction.location.line,
                address: BigInt(address)
            })
        }
        return result
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
        const last = interpreter.getUndoHistory(1)[0]
        if (last) {
            const old = ccrToFlagsArray(last.old_ccr.bits).reverse()
            return M68K_FLAG_NAMES.map((name, i) => ({
                name,
                value: flags[i],
                prev: Number(old[i])
            }))
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
            this.interpreter?.getUndoHistory(max).map((step): ExecutionStep => {
                if (step.kind === 'poke') {
                    //a Poke ran no instruction, so it has no line to go to and no mutations of its
                    //own: its row is what it wrote
                    const writes = step.writes.map(convertPokeWrite)
                    return {
                        kind: 'poke',
                        pc: step.pc,
                        old_ccr: step.old_ccr,
                        new_ccr: step.new_ccr,
                        line: -1,
                        writes,
                        mutations: writes.map(pokeWriteToMutation)
                    }
                }
                return {
                    kind: 'instruction',
                    pc: step.pc,
                    old_ccr: step.old_ccr,
                    new_ccr: step.new_ccr,
                    line: step.location?.line ?? -1,
                    file: step.location?.file,
                    mutations: step.mutations.map(convertMutation)
                }
            }) ?? []
        )
    }

    _hasTerminated(): boolean {
        return this.interpreter?.hasTerminated() ?? false
    }

    /**
     * Why the Core says the program ended, which Undo takes back with the step that ended it: task
     * 9 is an exit, which EASy68K gives no status; running past the last instruction is the end;
     * a runtime error is an error. `Terminate` from the editor, its answer to a sound task, is an
     * error too, since the program asked for something that did not happen. The Core also throws
     * every error it ends on, and `GenericEmulator` reports what was thrown, with the line, so this
     * says the same thing for a reader that only asks the Core. `simhalt` only pauses the program.
     */
    _getTermination(): Termination | undefined {
        const interpreter = this.interpreter
        const termination = interpreter?.getTermination()
        if (!interpreter || !termination) return undefined
        switch (termination.type) {
            case 'TerminateTask':
                return { kind: 'exit' }
            case 'EndOfProgram':
                return { kind: 'end' }
            case 'TerminatedByHost':
                return { kind: 'error', message: ENDED_BY_THE_EDITOR }
            case 'Exception': {
                const line = interpreter.getLastInstruction()?.location.line
                return {
                    kind: 'error',
                    message: this._stringifyError(
                        termination.value,
                        line === undefined ? undefined : line + 1
                    )
                }
            }
        }
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
        return getM68kErrorMessage(error, line)
    }

    _undo(): void {
        const interpreter = this.requireInterpreter()
        //the FileSystem cannot refuse half way through, so the step about to be rolled back is
        //checked first, as `_canUndo` checked it; a Poke never touched a File
        if (interpreter.getUndoHistory(1)[0]?.kind === 'instruction') {
            const id = interpreter.getLastStepId()
            if (!(this.screenInstructions?.canUndoAfter(id - 1) ?? true)) {
                throw new Error('Screen Undo history exhausted')
            }
            if (!(this.fileSystemSession?.canUndoAfter(id) ?? true)) {
                throw new Error('FileSystem Undo history exhausted')
            }
        }
        const step = interpreter.undo()
        //a Poke has no instruction identity, so neither journal hung anything on it and both must
        //be left where they are ([ADR 0022](../../../../docs/adr/0022-core-native-poke-records.md))
        if (step.kind === 'poke') return
        this.screenInstructions?.undoAfter(step.id - 1)
        this.fileSystemSession?.undoAfter(step.id)
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
        const parsedBreakpoints = request.breakpoints
        const hasBreakpoints = parsedBreakpoints.length > 0
        const execution = this.executionController.capture()
        //a trap is one instruction of progress but can be a whole screen of work, so the budget says
        //nothing about how long this slice will hold the host: a program that clears and repaints in
        //a loop charged five instructions a frame and ran for minutes on the budget alone. The clock
        //is looked at once per trap, which is this loop's own granularity (phase 8)
        const deadline = sliceDeadline(request)
        let instructions = 0
        //every call below the first resumes the program with the program counter on an instruction
        //that has not run, so only the first may be told to skip a breakpoint on it: the Core's
        //`runWithBreakpoints` skips the instruction it starts on, and re-entering after a trap with
        //that skip on is what made the instruction after every trap unbreakable
        let startsTheRun = request.skipBreakpointAtPc
        while (!interpreter.hasTerminated()) {
            const remaining = budget - instructions
            if (remaining <= 0) return { reason: 'budget', instructions }
            //never without progress: a slice that ran nothing ends the whole run
            if (instructions > 0 && performance.now() >= deadline) {
                return { reason: 'budget', instructions }
            }
            try {
                if (hasBreakpoints) {
                    interpreter.runWithBreakpoints(parsedBreakpoints, remaining, {
                        skipBreakpointAtPc: startsTheRun
                    })
                    startsTheRun = false
                    //here we might have reached a breakpoint. It is paused if the status is running
                    if (interpreter.getStatus() === CoreInterpreterStatus.Running) {
                        return { reason: 'breakpoint', instructions }
                    }
                } else {
                    interpreter.runWithLimit(remaining)
                }
            } catch (error) {
                if (!isExecutionLimitError(error)) throw error
                if (!isLastSlice) return { reason: 'budget', instructions: budget }
                //the Core names the halt limit it was given, which is this slice's share of the
                //run; the user set the whole run's limit and that is the number they recognize
                throw { type: 'ExecutionLimit', value: request.runInstructionLimit }
            }
            //an interrupt is one instruction of progress: without it a program that does nothing but
            //trap would never reach the run's limit, which is what the old unaccounted loop did
            instructions += 1
            //`simhalt` is a resumable program pause. End this Run here; the Core advances past the
            //directive before pausing, so a later Run or Step continues with the next instruction.
            if (interpreter.getStatus() === CoreInterpreterStatus.Paused) {
                return { reason: 'paused', instructions }
            }
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
            //`simhalt` pauses rather than terminating, and that is where an interactive Run stops.
            //A Testcase has to observe the same state: resuming past it ran whatever follows the
            //halt — a subroutine in the usual EASy68K layout — and asserted against registers the
            //program never produced.
            if (interpreter.getStatus() === CoreInterpreterStatus.Paused) return
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
                //not marked terminated here: the run that ends says so once it is over, with how
                //the program ended and its running time, which the Log reads together
                const ins = interpreter.getLastInstruction()
                this.state.line = ins?.location.line ?? -1
                if (ins) this.state.currentFile = ins.location.file
                break
            }
            case CoreInterpreterStatus.Interrupt: {
                if (this.state.terminated || !this.state.canExecute) break
                const ins = interpreter.getLastInstruction()
                this.state.line = ins?.location.line ?? -1
                if (ins) this.state.currentFile = ins.location.file
                const interrupt = interpreter.getCurrentInterrupt()
                //a trap is not a display frame: a graphical program reaches this a few hundred
                //times a second and the panels can only be seen sixty times a second. The traps
                //that stop and ask the user something are refreshed whatever the rate limit says
                this.refreshRunningPanels(
                    interrupt !== null && INTERRUPT_INPUT_QUESTIONS[interrupt.type] !== undefined
                )
                return await this.handleInterrupt(interrupt, interpreter, execution)
            }
        }
        return undefined
    }

    /**
     * The whole `trap #15` interface, task by task: EASy68K's tasks as the Core decodes them, each
     * routed to the peripheral that owns it
     * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)). The Core
     * owns what a task means: a display task hands over finished text, a read task takes what was
     * typed as it was typed, a file task what the FileSystem did, and the Core formats, parses and
     * writes EASy68K's results itself ([ADR 0035](../../../../docs/adr/0035-environments-match-their-reference.md)).
     * Answering is what resumes the Core, so every branch ends in `answerInterrupt`, with the answer
     * of the interrupt's own type; the Delay branch answers first and returns its wait, because the
     * program is not blocked on the trap any more, only on time passing.
     *
     * The whole task is associated with this trap's execution ID, including tasks like 18 that
     * print a prompt and then echo every character the user types. The compound journal makes
     * eviction of those effects atomic (ADR 0005), and a file task's changes are one FileSystem
     * frame under the same ID (ADR 0015).
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
        const before = screen.history.sequence
        const penOnlyBefore = this.penOnly
        const { type } = interrupt
        const question = INTERRUPT_INPUT_QUESTIONS[type]
        this.state.interrupt = question ? { type, message: question } : { type }
        screen.beginCompoundOperation()
        try {
            switch (type) {
                // ------------------------------------------------------------- text
                case 'DisplayStringWithCRLF': {
                    this.print(`${interrupt.value}\n`)
                    interpreter.answerInterrupt({ type })
                    break
                }
                //finished text: decoded from Windows-1252 and, for a number, formatted the way
                //EASy68K formats it (task 15 in upper case, task 20 in its signed field)
                case 'DisplayStringWithoutCRLF':
                case 'DisplayChar':
                case 'DisplayNumber':
                case 'DisplayNumberInBase':
                case 'DisplaySignedNumberInField':
                case 'DisplayStringAndNumber': {
                    this.print(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                //the line as it was typed: the Core reads it with EASy68K's `atoi` (task 18 shows
                //its prompt first) and stores task 2's first 79 characters
                case 'DisplayStringAndReadNumber':
                case 'ReadNumber':
                case 'ReadKeyboardString': {
                    if (type === 'DisplayStringAndReadNumber') this.print(interrupt.value)
                    const line = await this.requestInput(
                        type === 'ReadKeyboardString' ? READ_STRING_QUESTION : READ_NUMBER_QUESTION,
                        execution,
                        this.readOptions(interpreter)
                    )
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: line })
                    break
                }
                case 'ReadChar': {
                    //one keystroke, from the Terminal or, once the Screen's Keyboard is the source,
                    //from the Screen (ADR 0009); Enter is EASy68K's $0D, the Terminal's Enter code
                    //for this Target (ADR 0036), which the Core also takes as a line feed
                    const char = await this.requestCharacter(
                        READ_CHAR_QUESTION,
                        execution,
                        this.readOptions(interpreter)
                    )
                    if (!char) throw new Error(`Expected a character, got "${char}"`)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: char })
                    break
                }
                case 'Terminate': {
                    //task 9 ends the program in the Core without waiting for an answer; any other
                    //interrupt of this type is answered in kind, which also ends the program
                    interpreter.answerInterrupt({ type })
                    break
                }

                // ------------------------------------------------------------ files
                case 'CloseAllFiles': {
                    const closed = this.fileTask(interpreter, false, (files) => {
                        files.closeAll()
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: closed })
                    break
                }
                case 'OpenFile': {
                    const path = interrupt.value
                    const opened = this.fileTask(interpreter, null, (files) =>
                        openExistingFile(files, path)
                    )
                    interpreter.answerInterrupt({ type, value: opened })
                    break
                }
                case 'NewFile': {
                    const path = interrupt.value
                    //`fopen(name, "w+b")`: created, or emptied, and open for reading and writing
                    const handle = this.fileTask(interpreter, null, (files) =>
                        files.open(path, { access: 'read-write', create: true, truncate: true })
                    )
                    interpreter.answerInterrupt({ type, value: handle })
                    break
                }
                case 'ReadFile': {
                    const { handle, count } = interrupt.value
                    //no bytes is the end of the file, which the Core reports as 1 in D0.W
                    const bytes = this.fileTask(interpreter, null, (files) =>
                        files.read(handle, count)
                    )
                    interpreter.answerInterrupt({ type, value: bytes })
                    break
                }
                case 'WriteFile': {
                    const { handle, bytes } = interrupt.value
                    //a full FileSystem is an error the program sees as 2, like any other
                    const written = this.fileTask(interpreter, false, (files) => {
                        files.write(handle, bytes)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: written })
                    break
                }
                case 'PositionFile': {
                    const { handle, offset } = interrupt.value
                    const moved = this.fileTask(interpreter, false, (files) => {
                        files.seek(handle, offset, 0)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: moved })
                    break
                }
                case 'CloseFile': {
                    const handle = interrupt.value
                    const closed = this.fileTask(interpreter, false, (files) => {
                        files.close(handle)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: closed })
                    break
                }
                case 'DeleteFile': {
                    const path = interrupt.value
                    const deleted = this.fileTask(interpreter, false, (files) => {
                        files.remove(path)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: deleted })
                    break
                }
                case 'FileExists': {
                    const path = interrupt.value
                    //every File of a Project can be written, and a Directory is not a File
                    const found = this.fileTask(interpreter, 'Missing' as const, (files) =>
                        files.stat(path)?.kind === 'file' ? 'Writable' : 'Missing'
                    )
                    interpreter.answerInterrupt({ type, value: found })
                    break
                }
                case 'FileDialog': {
                    //modal in its reference, so it is the app's Prompt rather than the console
                    const { mode, title, filter, path } = interrupt.value
                    const answer = await this._peripherals.terminal.inputDialog(
                        fileDialogQuestion(mode, title, filter),
                        execution,
                        path
                    )
                    this.executionController.ensureCurrent(execution)
                    //an empty answer cancels, as the dialog's Cancel does
                    interpreter.answerInterrupt({ type, value: answer || null })
                    break
                }

                // ------------------------------------------------------------ sound
                case 'PlaySound':
                case 'LoadSound':
                case 'PlayLoadedSound':
                case 'PlaySoundDirectX':
                case 'LoadSoundDirectX':
                case 'PlayLoadedSoundDirectX':
                case 'ControlSound':
                case 'ControlSoundDirectX': {
                    //nothing can play them until the Audio Peripheral exists. `Terminate` is the
                    //Core's answer for a host without sound, and the run ends on an error saying so
                    //rather than as though the program had finished
                    interpreter.answerInterrupt({ type: 'Terminate' })
                    throw new Error(describeUnsupportedTrapTask(SOUND_TASKS[type]))
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
                    return unknownInterrupt(type)
            }
        } finally {
            screen.endCompoundOperation()
            if (this.executionController.isCurrent(execution)) {
                this.screenInstructions?.record(
                    interpreter.getLastStepId(),
                    before,
                    this.penOnly === penOnlyBefore
                        ? undefined
                        : () => {
                              this.penOnly = penOnlyBefore
                          }
                )
            }
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

    /**
     * How the program set its reads to show what is typed: task 12's echo and task 16's prompt and
     * line feed. The Core keeps them and Undo puts them back, so they are asked for at each read.
     */
    private readOptions(interpreter: Interpreter): TerminalReadOptions {
        const { echo, prompt, line_feed } = interpreter.getInputSettings()
        return { echo, prompt, lineFeed: line_feed }
    }

    /**
     * One file task on the Build's FileSystem session, inside the Undo frame of the trap that asked
     * for it. The frame is keyed by the Core's step id, as the Screen journal's records are, so Undo
     * of that step puts back the Files, the open files and their positions with the registers
     * ([ADR 0015](../../../../docs/adr/0015-restore-file-operations-on-undo.md)). A failure the
     * program can be told about answers `failed`, which the Core turns into EASy68K's 2 in D0.W;
     * anything else, such as a session that has ended, ends the run.
     */
    private fileTask<T>(
        interpreter: Interpreter,
        failed: T,
        operation: (files: FileSystemSession) => T
    ): T {
        const files = this.fileSystemSession
        if (!files) throw new Error('The FileSystem is not running')
        return files.performInstruction(interpreter.getLastStepId(), () => {
            try {
                return operation(files)
            } catch (error) {
                if (error instanceof FileSystemGuestError) return failed
                throw error
            }
        })
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
     * that only prints reads what is typed in the Terminal, and the first graphics, keyboard or
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
 * Task 51 as EASy68K does it (`openFile`, `SIMOPS2.CPP`): for reading and writing, and failing that
 * for reading only, which the program learns as 3 in D0.W. Every File of a Project can be written
 * today, so the second open fails for the reason the first did; it is there for a File that cannot.
 */
function openExistingFile(files: FileSystemSession, path: string): OpenedFile {
    try {
        return { handle: files.open(path, { access: 'read-write' }), read_only: false }
    } catch (error) {
        if (!(error instanceof FileSystemGuestError)) throw error
        return { handle: files.open(path, { access: 'read' }), read_only: true }
    }
}

/**
 * Task 58's dialog as the Prompt asks it: whether it opens or saves, with the program's title and
 * filter, for a path from the Project root.
 */
function fileDialogQuestion(mode: FileDialogMode, title: string, filter: string): string {
    const action = mode === 'Open' ? 'The File to open' : 'The File to save to'
    const kinds = filter ? ` (${filter})` : ''
    const question = `${action}${kinds}, as a path from the Project root`
    return title ? `${title}: ${question.charAt(0).toLowerCase()}${question.slice(1)}` : question
}

/** A Core interrupt this adapter does not know, which the type checker says cannot happen. */
function unknownInterrupt(type: never): never {
    throw new Error(`Unknown interrupt type "${type}"`)
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
    if (!instruction) return null
    return {
        address: BigInt(instruction.address),
        lineNumber: instruction.location.line,
        file: instruction.location.file,
        code: instruction.source
    }
}

function convertMutation(mutation: CoreExecutionStep['mutations'][number]): MutationOperation {
    switch (mutation.type) {
        case 'WriteRegister':
            return {
                type: 'WriteRegister',
                value: {
                    old: BigInt(mutation.value.old),
                    new: BigInt(mutation.value.new),
                    size: mutationSize(mutation.value.size),
                    register: registerOperandToString(mutation.value.register)
                }
            }
        case 'WriteMemoryBytes':
            return {
                type: 'WriteMemoryBytes',
                value: {
                    address: BigInt(mutation.value.address),
                    old: mutation.value.old,
                    new: mutation.value.new
                }
            }
        case 'WriteMemory':
            return {
                type: 'WriteMemory',
                value: {
                    address: BigInt(mutation.value.address),
                    old: BigInt(mutation.value.old),
                    new: BigInt(mutation.value.new),
                    size: mutationSize(mutation.value.size)
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
        case 'SetInputSettings':
            return {
                type: 'Other',
                value: inputSettingsChange(mutation.value.old, mutation.value.new)
            }
        default:
            return unsupportedMutation(mutation)
    }
}

/**
 * What task 12 or 16 changed, as the History names it: "Turned the echo off". The Core journals a
 * change only, so at least one of the three differs.
 */
function inputSettingsChange(old: InputSettings, next: InputSettings): string {
    const turned = (name: string, on: boolean) => `turned ${name} ${on ? 'on' : 'off'}`
    const changes = [
        old.echo !== next.echo ? turned('the echo', next.echo) : '',
        old.prompt !== next.prompt ? turned('the input prompt', next.prompt) : '',
        old.line_feed !== next.line_feed ? turned('the line feed after Enter', next.line_feed) : ''
    ].filter(Boolean)
    const text = changes.join(', ') || 'set the input settings'
    return text[0].toUpperCase() + text.slice(1)
}

/**
 * One value a Poke wrote, as the panels show it: unsigned bit patterns, and the register named the
 * way the Register file draws it (`D0`) rather than the way the Core spells it (`d0`).
 */
function convertPokeWrite(write: CorePokeWrite): PokeWrite {
    if (write.type === 'register') {
        return {
            type: 'register',
            name: pokeRegisterName(write.name),
            old: BigInt(write.old >>> 0),
            new: BigInt(write.new >>> 0)
        }
    }
    return {
        type: 'memory',
        address: BigInt(write.address),
        old: [...write.old],
        new: [...write.new]
    }
}

/** The mutation list a poked value reads as, so the coding agent sees a Poke as it sees a write. */
function pokeWriteToMutation(write: PokeWrite): MutationOperation {
    if (write.type === 'register') {
        return {
            type: 'WriteRegister',
            //a Poke writes the whole register, which is what `pokeRegisters` hands the Core
            value: { register: write.name, old: write.old, new: write.new, size: RegisterSize.Long }
        }
    }
    return {
        type: 'WriteMemoryBytes',
        value: { address: write.address, old: write.old, new: write.new }
    }
}

/** The Core names a register the way the assembler does; the Register file draws it `D0`, `A7`. */
function pokeRegisterName(name: string): string {
    const upper = name.toUpperCase()
    return (registerName as readonly string[]).includes(upper) ? upper : name
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
