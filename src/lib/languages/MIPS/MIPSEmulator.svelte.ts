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
    type SourceBreakpoint,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import { type ExecutionSlice, type ExecutionSliceRequest } from '$lib/languages/ExecutionSlice'
import { MarsSlicePacer } from '$lib/languages/mars/marsSlice'
import type { ExecutionGeneration } from '$lib/languages/ExecutionController'
import type { Testcase } from '$lib/Project.svelte'
import { MarsDevices } from '$lib/languages/mars/MarsDevices'
import {
    type MarsDisplayConfiguration,
    type MarsDisplayOrigin,
    normalizeMarsDisplay,
    type ProjectDisplay
} from '$lib/languages/mars/marsDisplay'
import {
    applyScreenDirective,
    ignoredIncludedScreenDiagnostics,
    readScreenLabelProbe,
    SCREEN_LABEL_PROBE_ADDRESS,
    screenLabelProbeSource
} from '$lib/languages/mars/screenDirective'
import {
    sourceText,
    textAssemblyFiles,
    updateEntryText,
    type BuildInput,
    type BuildSources
} from '$lib/projectFiles'
import {
    MIPSNumericRegisterNames,
    MIPSRegisterNames,
    type MIPSRegisterName
} from './MIPS-registers'

export {
    MIPSNumericRegisterNames,
    MIPSRegisterNames,
    type MIPSRegisterName
} from './MIPS-registers'

const READ_CHAR_QUESTION = 'Enter a character'
const READ_DOUBLE_QUESTION = 'Enter a double'
const READ_FLOAT_QUESTION = 'Enter a float'
const READ_INT_QUESTION = 'Enter an integer'
const READ_STRING_QUESTION = 'Enter a string'

/**
 * How many instructions the TeaVM compiled Core runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured in phase 8 on a compute-only loop under node, built with the
 * shipped undo history: about 1 100 to 1 200, so the phase 7 estimate stands.
 */
const MIPS_INSTRUCTIONS_PER_MS = 1_000

/**
 * How much wall time one `simulate*` call aims at, which is also how far a chunk that turns out to
 * sleep can carry the slice past its deadline before the next check (`marsSlice.ts`). A millisecond
 * is about a thousand instructions of compute and fifty calls in a compute slice, which the call
 * overhead measured there puts at half a percent of throughput.
 */
const MIPS_CHUNK_TARGET_MS = 1

const INVALID_CHARACTER_ERROR = 'Invalid character'
const INVALID_NUMBER_ERROR = 'Invalid number'

export function MIPSEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorMIPSEmulator(source, options)
}

class AsmEditorMIPSEmulator extends GenericEmulator<JsMips, MIPSRegisterName> {
    private mips: JsMips | null = null
    /**
     * The bitmap display and the keyboard-and-display registers, the two MARS tools this editor
     * offers as devices the Core memory is observed through. Built once and pointed at each freshly
     * assembled Core, because the peripherals it drives live as long as the Emulator does.
     */
    private readonly devices: MarsDevices
    /** The chunking of a slice, which is what keeps a sleeping program's slice short (`marsSlice.ts`). */
    private readonly pacer = new MarsSlicePacer(MIPS_CHUNK_TARGET_MS)
    /** MARS's five display parameters, from the project and changed from the Screen panel. */
    private display: ProjectDisplay
    /** Whether the last Build read them out of a `@screen` comment instead. */
    private displayOrigin: MarsDisplayOrigin = 'user'
    /** The label such a directive named for its base address, for the Screen panel to show. */
    private displayBaseLabel: string | undefined
    /**
     * The generation the currently running `_run`/`_step`/`_runTestcase` belongs to. The IO handlers
     * are registered once (at `_initialize`) but every async read has to be tied to the execution
     * that is actually running, so they read this field instead of capturing a generation.
     */
    private currentExecution: ExecutionGeneration = this.executionController.capture()

    constructor(source: BuildInput, options: EmulatorSettings) {
        super(
            source,
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
        this.display = normalizeMarsDisplay(options.display)
        this.devices = new MarsDevices({
            screen: this._peripherals.screen,
            keyboard: this._peripherals.keyboard,
            terminal: this._peripherals.terminal
        })
        this.devices.setDisplay(this.display)
    }

    /**
     * The Screen panel's configuration popover, applied at once and with a re-sync from memory, as
     * MARS does. The caller stores the same value in the project so it comes back with it.
     */
    setDisplay(display: ProjectDisplay): void {
        this.display = normalizeMarsDisplay(display)
        //a hand edit wins until the next Build reads the directive again
        this.displayOrigin = 'user'
        this.displayBaseLabel = undefined
        this.devices.setDisplay(this.display)
    }

    /** What the Screen is configured with, and whether the program's source asked for it. */
    getDisplay(): MarsDisplayConfiguration {
        return {
            display: this.display,
            origin: this.displayOrigin,
            baseLabel: this.displayBaseLabel
        }
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
        const mips = this.mips
        if (!mips?.canUndo) return false
        const step = mips.getUndoStack()[0]
        return !step || (this.fileSystemSession?.canUndoAfter(step.pc) ?? true)
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        //the same warnings the Build reports, so the squiggle on a `@screen` line is there while it
        //is being typed and does not vanish half a second after a Build replaces this list
        const directive = this.readScreenDirective(sources).diagnostics
        const files = textAssemblyFiles(sources)
        const mips = MIPS.makeMipsFromFiles(files, sources.entry)
        const result = mips.assemble()
        return [
            ...directive,
            ...includedScreenDiagnostics(files, sources.entry, mips),
            ...result.errors.map(assembleErrorToDiagnostic)
        ]
    }

    _compile(sources: BuildSources, undoSize: number): CompileResult {
        this.mips = null
        //before the Core is built, so the first instruction and a Testcase alike run on the display
        //the source asked for; the label probe assembles a throwaway Core, which the real assembly
        //below then supersedes on the singletons both of them share
        const configured = this.readScreenDirective(sources)
        this.display = configured.display
        this.displayOrigin = configured.origin
        this.displayBaseLabel = configured.baseLabel
        //the build path, not `setDisplay`: the Core the devices still hold is the *previous* one, so
        //a re-sync here would repaint the Screen `clear()` has just blanked with the last program's
        //memory — and a build that then fails never reaches `_initialize` to put it right again
        this.devices.resetScreen(this.display)
        const files = textAssemblyFiles(sources)
        const mips = MIPS.makeMipsFromFiles(files, sources.entry)
        //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize` stored, so
        //the size has to be set *before* assembling: setting it afterwards would only size the next
        //compile's buffer (legacy ordering was setUndoSize -> assemble -> setUndoEnabled)
        mips.setUndoSize(Math.max(1, normalizeUndoSize(undoSize)))
        const result = mips.assemble()
        const diagnostics = [
            ...configured.diagnostics,
            ...includedScreenDiagnostics(files, sources.entry, mips),
            ...result.errors.map(assembleErrorToDiagnostic)
        ]
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
        this.pacer.reset()
        registerHandlers(mips, this.makeHandlers())
        //after `initialize`, so the observers see the program's writes and not the loading of `.data`
        this.devices.attach(mips, this.display)
    }

    _dispose(): void {
        this.devices.dispose()
        this.mips = null
    }

    /**
     * Build, Stop and dispose reset the Screen to the language default, but the bitmap display's
     * geometry belongs to the user rather than to a program, so it comes straight back — blank,
     * because the picture is memory that the next build clears.
     *
     * Guarded: the base constructor clears before this subclass's fields exist.
     */
    clear(): void {
        super.clear()
        this.devices?.resetScreen(this.display)
    }

    /**
     * What the program's `@screen` comment asks for, on top of the display the Screen has now.
     *
     * `normalizeMarsDisplay` also covers the semantic check the base constructor starts before this
     * subclass's fields exist, when there is no current display to layer onto yet.
     */
    private readScreenDirective(sources: BuildSources) {
        const code = sourceText(sources)
        const configured = applyScreenDirective(code, normalizeMarsDisplay(this.display), (label) =>
            this.resolveLabelAddress(sources, label)
        )
        return {
            ...configured,
            diagnostics: configured.diagnostics.map((diagnostic) => ({
                ...diagnostic,
                file: sources.entry
            }))
        }
    }

    /**
     * The address a `@screen base=<label>` names. The Core has no lookup by name — `getLabelAtAddress`
     * only goes the other way — so the program is assembled once more with one extra `.word <label>`
     * at a fixed address and that word is read back: the assembler itself resolves the name, which is
     * what makes `.eqv` names, forward references and text labels all work.
     */
    private resolveLabelAddress(sources: BuildSources, label: string): number | null {
        try {
            const probeSources = updateEntryText(
                sources,
                screenLabelProbeSource(sourceText(sources), label)
            )
            const probe = MIPS.makeMipsFromFiles(
                textAssemblyFiles(probeSources),
                probeSources.entry
            )
            const result = probe.assemble()
            //a program that does not assemble has no labels to resolve; its own errors are reported
            if (result.errors.some((error) => !error.isWarning)) return null
            return readScreenLabelProbe(probe.readMemoryBytes(SCREEN_LABEL_PROBE_ADDRESS, 4))
        } catch {
            return null
        }
    }

    /** Framebuffer mode journals nothing, so Undo restores the image from the rolled-back memory. */
    _resyncScreenFromMemory(): void {
        this.devices.resync()
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
                file: this.statementAtAddress(address)?.sourcePath,
                color: makeLabelColor(i, frame.sp)
            }
        })
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const mips = this.mips
        if (!mips) return { decorations: [], code: '' }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<string, JsProgramStatement[]>()
        for (const statement of mips.getCompiledStatements()) {
            const key = `${statement.sourcePath}:${statement.sourceLine}`
            const arr = joined.get(key)
            if (arr) {
                arr.push(statement)
            } else {
                joined.set(key, [statement])
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
                file: original.sourcePath,
                note: 'Assembled instructions',
                belowLine: original.sourceLine,
                md: `\`\`\`mips\n${lines.join('\n')}\n\`\`\``,
                instructions: statements.map((statement) => ({
                    address: BigInt(statement.address),
                    code: formatStatement(statement.assemblyStatement)
                }))
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
                file: this.statementAtAddress(step.pc)?.sourcePath,
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
        try {
            await mips.step()
        } finally {
            this.devices.flush()
        }
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
        const mips = this.requireMips()
        const step = mips.getUndoStack()[0]
        if (step && !(this.fileSystemSession?.canUndoAfter(step.pc) ?? true)) {
            throw new Error('FileSystem Undo history exhausted')
        }
        mips.undo()
        if (step) this.fileSystemSession?.undoAfter(step.pc)
    }

    /**
     * The Core stops for input by leaving the pending `simulate*` promise unsettled, and serves a
     * `sleep` the same way, so both are served inside the slice and only the budget, a breakpoint
     * or the end of the program end one. The budget is spent in chunks by the pacer, which is what
     * keeps the slice of a sleeping program, and the pause it holds off, to about one sleep
     * (`marsSlice.ts`). The Core reports no instruction count, so a chunk that came back still
     * runnable ran its whole limit, which is exact for the compute-only case the budget exists for.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const mips = this.requireMips()
        const breakpoints = calculateBreakpoints(mips, request.breakpoints)
        this.currentExecution = this.executionController.capture()
        try {
            return await this.pacer.run(
                request,
                MIPS_INSTRUCTIONS_PER_MS,
                this._peripherals.clock,
                async (limit) => {
                    const terminated = await mips.simulateWithBreakpointsAndLimit(
                        breakpoints,
                        limit
                    )
                    if (terminated || this._hasTerminated()) return 'terminated'
                    //`simulate*` does not say whether the limit or a breakpoint stopped it; the line
                    //the program is about to execute does, because a run stopped on a breakpoint is
                    //parked on it
                    const instruction = this._getNextInstruction()
                    return instruction &&
                        request.breakpoints.some(
                            (breakpoint) =>
                                breakpoint.file === instruction.file &&
                                breakpoint.line === instruction.lineNumber
                        )
                        ? 'breakpoint'
                        : 'ran'
                }
            )
        } finally {
            //the bitmap display catches up once per slice rather than once per stored word, which is
            //what keeps the observer cheap; a program that sleeps flushes from the handler too
            this.devices.flush()
        }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const mips = this.requireMips()
        this.currentExecution = this.executionController.capture()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller
        try {
            await mips.simulateWithLimit(toHaltLimit(haltLimit))
        } finally {
            this.devices.flush()
        }
    }

    /**
     * Syscall 32. Program time passes without the Core blocking the host: the handler's promise is
     * what suspends the pending `simulate` call, and the clock resolves it — immediately, on a
     * virtual clock, so a Testcase never sleeps
     * ([ADR 0010](../../../docs/adr/0010-program-time-without-clock-pacing.md)).
     *
     * The Screen catches up first: an animation draws a frame and then sleeps, and the frame has to
     * be on screen while the program waits, not at the end of the slice several frames later.
     */
    private async sleep(milliseconds: number): Promise<void> {
        const execution = this.currentExecution
        this.devices.flush()
        //read the clock at the point of use: a Testcase swaps a virtual one in and the injected one back
        const clock = this._peripherals.clock
        await this.executionController.waitFor(execution, () => clock.wait(milliseconds))
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
        const instructionOperation = <T>(operation: () => T): T => {
            const files = this.fileSystemSession
            if (!files) throw new Error('FileSystem is not running')
            //MARS advances PC before it invokes a syscall handler; the Core's backstep record is
            //keyed by the address of the syscall itself.
            return files.performInstruction(this.requireMips().programCounter - 4, operation)
        }
        const handlers: HandlerMapFns = {
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

            readFile: (descriptor, _destination, length) =>
                (() => {
                    const bytes = this.fileSystemSession!.read(descriptor, length)
                    return [bytes.length === 0 ? -1 : bytes.length, mipsReadBuffer(bytes)]
                })(),
            writeFile: (descriptor, buffer) =>
                void this.fileSystemSession!.write(descriptor, handlerBytes(buffer)),
            openFile: (path, flags, append) =>
                this.fileSystemSession!.open(
                    path,
                    flags === 0 ? 'read' : append ? 'append' : 'write'
                ),
            closeFile: (descriptor) => this.fileSystemSession!.close(descriptor),
            stdIn: unimplementedHandler('stdIn'),

            sleep: (milliseconds: number) => this.sleep(milliseconds),
            //syscall 30, elapsed program time. Host time in an interactive run and the virtual clock
            //of a Testcase, which starts at zero so elapsed-time output is reproducible (ADR 0010)
            time: () => this._peripherals.clock.now()
        }
        //The same syscall address can select a different service on a later iteration. Empty
        //markers for non-file handlers keep an older File diff from being paired only by equal PC.
        return Object.fromEntries(
            Object.entries(handlers).map(([name, handler]) => [
                name,
                (...args: unknown[]) =>
                    instructionOperation(() =>
                        (handler as (...parameters: unknown[]) => unknown)(...args)
                    )
            ])
        ) as HandlerMapFns
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
    return new TextDecoder().decode(handlerBytes(buffer))
}

/** TeaVM currently exposes a Java byte[] as either the promised array or one nested typed array. */
function handlerBytes(buffer: unknown): Uint8Array {
    const first = Array.isArray(buffer) && buffer.length === 1 ? buffer[0] : undefined
    const value =
        first && typeof first === 'object' && 'data' in first && ArrayBuffer.isView(first.data)
            ? first.data
            : Array.isArray(first) || ArrayBuffer.isView(first)
              ? first
              : buffer
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
    }
    if (Array.isArray(value)) return Uint8Array.from(value, (byte) => Number(byte) & 0xff)
    throw new Error('Core returned an invalid byte buffer')
}

/** @specy/mips 3.0 currently unboxes returned read bytes as TeaVM Byte objects. */
function mipsReadBuffer(bytes: Uint8Array): number[] {
    return Array.from(bytes, (byte) => ({
        $byteValue: () => (byte > 0x7f ? byte - 0x100 : byte)
    })) as unknown as number[]
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

function calculateBreakpoints(mips: JsMips, breakpoints: SourceBreakpoint[]): number[] {
    return breakpoints.flatMap((breakpoint) =>
        mips
            .getStatementsAtSourceLocation(breakpoint.file, breakpoint.line + 1)
            .map((statement) => statement.address)
    )
}

function includedScreenDiagnostics(
    files: Readonly<Record<string, string>>,
    entry: string,
    mips: JsMips
): Diagnostic[] {
    try {
        return ignoredIncludedScreenDiagnostics(
            files,
            entry,
            mips.getTokenizedLines().map((line) => line.sourcePath)
        )
    } catch {
        return []
    }
}

function toInstruction(statement: JsProgramStatement | null | undefined): Instruction | null {
    if (!statement) return null
    return {
        address: BigInt(statement.address),
        lineNumber: statement.sourceLine - 1,
        file: statement.sourcePath,
        code: statement.source
    }
}

function assembleErrorToDiagnostic(error: MIPSAssembleError): Diagnostic {
    return {
        severity: error.isWarning ? 'warning' : 'error',
        file: error.sourcePath,
        lineIndex: error.sourceLine - 1,
        column: error.sourceColumn,
        line: {
            line: '',
            line_index: error.sourceLine
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
