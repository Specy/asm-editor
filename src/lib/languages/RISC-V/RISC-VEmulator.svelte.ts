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

/**
 * How many instructions the TeaVM compiled Core runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured in phase 8 on a compute-only loop under node, built with the
 * shipped undo history: about 27, forty times slower than the phase 7 estimate this replaces, which
 * had a slice hold the host for three and a half seconds. RARS records a backstep entry per
 * instruction and that is what costs — the same loop runs at 460 with undo turned off — so the
 * estimate follows the shipped default, where undo is on.
 */
const RISCV_INSTRUCTIONS_PER_MS = 25

/**
 * How much wall time one `simulate*` call aims at, which is also how far a chunk that turns out to
 * sleep can carry the slice past its deadline before the next check (`marsSlice.ts`). Four
 * milliseconds is a hundred instructions of this Core's compute and a dozen calls in a compute
 * slice: the Core spends forty microseconds on each instruction, so a hundred of them hide the call.
 */
const RISCV_CHUNK_TARGET_MS = 4

const INVALID_CHARACTER_ERROR = 'Invalid character'
const INVALID_NUMBER_ERROR = 'Invalid number'

export function RISCVEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorRISCVEmulator(source, options)
}

class AsmEditorRISCVEmulator extends GenericEmulator<JsRiscV, RISCVRegisterName> {
    private riscv: JsRiscV | null = null
    /**
     * RARS's bitmap display and keyboard-and-display registers, ports of MARS's tools and driven by
     * the same module. Built once and pointed at each freshly assembled Core, because the
     * peripherals it drives live as long as the Emulator does.
     */
    private readonly devices: MarsDevices
    /** The chunking of a slice, which is what keeps a sleeping program's slice short (`marsSlice.ts`). */
    private readonly pacer = new MarsSlicePacer(RISCV_CHUNK_TARGET_MS)
    /** RARS's five display parameters, from the project and changed from the Screen panel. */
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
     * RARS's tool does. The caller stores the same value in the project so it comes back with it.
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
        const riscv = this.riscv
        if (!riscv?.canUndo) return false
        const step = riscv.getUndoStack()[0]
        return !step || (this.fileSystemSession?.canUndoAfter(step.pc) ?? true)
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        //the bitness decides which instructions assemble (`ld` is RV64 only), so pin the module
        //global before creating the throwaway instance, exactly like `_compile` does
        //the same warnings the Build reports, so the squiggle on a `@screen` line is there while it
        //is being typed and does not vanish half a second after a Build replaces this list
        const directive = this.readScreenDirective(sources).diagnostics
        RISCV.setIs64Bit(this.is64Bit)
        const files = textAssemblyFiles(sources)
        const riscv = RISCV.makeRiscVFromFiles(files, sources.entry)
        const result = riscv.assemble()
        return [
            ...directive,
            ...includedScreenDiagnostics(files, sources.entry, riscv),
            ...result.errors.map(assembleErrorToDiagnostic)
        ]
    }

    _compile(sources: BuildSources, undoSize: number): CompileResult {
        this.riscv = null
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
        //creation + assembly is synchronous, so pinning the module global here cannot be
        //interleaved with another instance's creation
        RISCV.setIs64Bit(this.is64Bit)
        const files = textAssemblyFiles(sources)
        const riscv = RISCV.makeRiscVFromFiles(files, sources.entry)
        //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize` stored, so
        //the size has to be set *before* assembling: setting it afterwards would only size the next
        //compile's buffer (legacy ordering was setUndoSize -> assemble -> setUndoEnabled)
        riscv.setUndoSize(Math.max(1, normalizeUndoSize(undoSize)))
        const result = riscv.assemble()
        const diagnostics = [
            ...configured.diagnostics,
            ...includedScreenDiagnostics(files, sources.entry, riscv),
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
        this.riscv = riscv
        return { ok: true, diagnostics }
    }

    _initialize(undoSize: number): void {
        const riscv = this.requireRiscV()
        //the stack was already sized in `_compile`, `assemble()` engages the backstepper
        //unconditionally so this is what actually turns undo off when history is disabled
        riscv.setUndoEnabled(normalizeUndoSize(undoSize) > 0)
        riscv.initialize(true)
        this.pacer.reset()
        registerHandlers(riscv, this.makeHandlers())
        //after `initialize`, so the observers see the program's writes and not the loading of `.data`
        this.devices.attach(riscv, this.display)
    }

    _dispose(): void {
        this.devices.dispose()
        this.riscv = null
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
            RISCV.setIs64Bit(this.is64Bit)
            const probeSources = updateEntryText(
                sources,
                screenLabelProbeSource(sourceText(sources), label)
            )
            const probe = RISCV.makeRiscVFromFiles(
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
                file: statement?.sourcePath,
                color: makeLabelColor(i, frame.sp)
            }
        })
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const riscv = this.riscv
        if (!riscv) return { decorations: [], code: '' }
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<string, JsProgramStatement[]>()
        for (const statement of riscv.getCompiledStatements()) {
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
                md: `\`\`\`riscv\n${lines.join('\n')}\n\`\`\``,
                instructions: statements.map((statement) => ({
                    address: BigInt(statement.address),
                    code: formatStatement(statement.assemblyStatement)
                }))
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
                file: statement?.sourcePath,
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
        try {
            await riscv.step()
        } finally {
            this.devices.flush()
        }
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
        const riscv = this.requireRiscV()
        const step = riscv.getUndoStack()[0]
        if (step && !(this.fileSystemSession?.canUndoAfter(step.pc) ?? true)) {
            throw new Error('FileSystem Undo history exhausted')
        }
        riscv.undo()
        if (step) this.fileSystemSession?.undoAfter(step.pc)
    }

    /**
     * The Core stops for input by leaving the pending `simulate*` promise unsettled, and serves a
     * `sleep` the same way, so both are served inside the slice and only the budget, a breakpoint
     * or the end of the program end one. The budget is spent in chunks by the pacer, which is what
     * keeps the slice of a sleeping program, and the pause it holds off, to about one sleep
     * (`marsSlice.ts`). Unlike MIPS the Core names its stop reason, but it still reports no
     * instruction count, so a chunk that came back runnable ran its whole limit.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const riscv = this.requireRiscV()
        const breakpoints = calculateBreakpoints(riscv, request.breakpoints)
        this.currentExecution = this.executionController.capture()
        try {
            return await this.pacer.run(
                request,
                RISCV_INSTRUCTIONS_PER_MS,
                this._peripherals.clock,
                async (limit) => {
                    const stopReason = await riscv.simulateWithBreakpointsAndLimit(
                        breakpoints,
                        limit
                    )
                    if (isTerminationStopReason(stopReason) || this._hasTerminated()) {
                        return 'terminated'
                    }
                    return stopReason === StopReason.BREAKPOINT ? 'breakpoint' : 'ran'
                }
            )
        } finally {
            //the bitmap display catches up once per slice rather than once per stored word, which is
            //what keeps the observer cheap; a program that sleeps flushes from the handler too
            this.devices.flush()
        }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const riscv = this.requireRiscV()
        this.currentExecution = this.executionController.capture()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller
        try {
            await riscv.simulateWithLimit(toHaltLimit(haltLimit))
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
            //RARS advances PC before it invokes an ecall handler; the Core's backstep record is
            //keyed by the address of the ecall itself.
            return files.performInstruction(this.requireRiscV().programCounter - 4, operation)
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
                    return [bytes.length === 0 ? -1 : bytes.length, Array.from(bytes)]
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
        //An ecall address may choose a different service on a later iteration. Empty markers for
        //non-file handlers prevent PC equality from associating that instruction with an old diff.
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

function calculateBreakpoints(riscv: JsRiscV, breakpoints: SourceBreakpoint[]): number[] {
    return breakpoints.flatMap((breakpoint) =>
        riscv
            .getStatementsAtSourceLocation(breakpoint.file, breakpoint.line + 1)
            .map((statement) => statement.address)
    )
}

function includedScreenDiagnostics(
    files: Readonly<Record<string, string>>,
    entry: string,
    riscv: JsRiscV
): Diagnostic[] {
    try {
        return ignoredIncludedScreenDiagnostics(
            files,
            entry,
            riscv.getTokenizedLines().map((line) => line.sourcePath)
        )
    } catch {
        return []
    }
}

function toInstruction(statement: JsProgramStatement | null | undefined): Instruction | null {
    if (!statement) return null
    return {
        address: BigInt(statement.address),
        lineNumber: sourceLineToIndex(statement.sourceLine),
        file: statement.sourcePath,
        code: statement.source
    }
}

function assembleErrorToDiagnostic(error: RISCVAssembleError): Diagnostic {
    const lineIndex = sourceLineToIndex(error.sourceLine)
    return {
        severity: error.isWarning ? 'warning' : 'error',
        file: error.sourcePath,
        lineIndex,
        column: error.sourceColumn,
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
