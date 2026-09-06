import {
    BaseEmulator,
    CompilationFailedError,
    type EmulatorConfig
} from '$lib/languages/BaseEmulator.svelte'
import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    createMemoryTab,
    type EmulatorSettings,
    InterpreterStatus,
    makeGenericDiagnostic,
    makeRegister,
    numbersOfSizeToSlice
} from '$lib/languages/commonLanguageFeatures.svelte'
import { Terminal } from '$lib/languages/peripherals/Terminal.svelte'
import {
    createInjectedPeripherals,
    type EmulatorPeripherals
} from '$lib/languages/peripherals/peripheralSet'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import {
    COMPUTE_SLICE_MS,
    nextSpeedCorrection,
    type ExecutionSlice,
    SCREEN_SLICE_MS,
    yieldToHost
} from '$lib/languages/ExecutionSlice'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { createDebouncer } from '$lib/utils'
import { settingsStore } from '$stores/settingsStore.svelte'
import {
    byteSliceToNum,
    isMemoryChunkEqual,
    numberToByteSlice
} from '$cmp/specific/project/memory/memoryTabUtils'
import { ExecutionController, type ExecutionGeneration } from '$lib/languages/ExecutionController'
import { Prompt } from '$stores/promptStore.svelte'
import structuredClone from '@ungap/structured-clone'

export abstract class GenericEmulator<T, R extends string>
    extends BaseEmulator<R>
    implements BaseEmulatorActions, BaseEmulatorState
{
    protected state: Omit<BaseEmulatorState, 'code' | 'stdOut'>
    protected _code: string
    protected _emulatorOptions: Required<Omit<EmulatorSettings, 'peripherals' | 'display'>>
    protected readonly _peripherals: EmulatorPeripherals
    /**
     * The host-time clock of interactive runs, kept because a Testcase swaps in a virtual one and a
     * clock's mode is fixed for its life. Adapters must therefore read `_peripherals.clock` when
     * they need it instead of caching it.
     */
    private readonly interactiveClock: ProgramClock
    private semanticCheckId = 0
    /**
     * What the slices of the current run have taught about how fast this program runs, multiplied
     * into the adapter's own throughput estimate. 1 until a slice says otherwise, and back to 1 on
     * every clear (`learnSliceSpeed`, [ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)).
     */
    private speedCorrection = 1
    /**
     * The pause the Run button turns into while a program is running. `pauseRequested` is set by
     * `pause()` and honored by `runSlices` at its next slice boundary; `resumePausedRun` settles the
     * promise the parked run is waiting on, and `runInFlight` is what makes a pause with no run a
     * no-op instead of a request the next run would trip over.
     */
    private pauseRequested = false
    private resumePausedRun: (() => void) | null = null
    private runInFlight = false
    /** How long the current run has spent parked, taken out of the execution time it reports. */
    private pausedMs = 0
    /** Number of core operations currently in flight, see `duringCoreOperation`. */
    private coreOperations = 0
    private coreIdleWaiters: (() => void)[] = []
    protected readonly executionController = new ExecutionController(() => Prompt.cancel())

    constructor(code: string, options: EmulatorConfig<R>, emulatorOptions: EmulatorSettings = {}) {
        super(options)
        this._emulatorOptions = {
            globalPageSize: emulatorOptions.globalPageSize ?? PAGE_SIZE,
            globalPageElementsPerRow:
                emulatorOptions.globalPageElementsPerRow ?? PAGE_ELEMENTS_PER_ROW,
            baseAddress: emulatorOptions.baseAddress ?? 0x1000n,
            stackAddress: emulatorOptions.stackAddress ?? 0x7ffffffcn,
            initialMemoryValue: emulatorOptions.initialMemoryValue ?? 0x0,
            language: emulatorOptions.language ?? 'M68K'
        }
        this._code = $state(code)
        this._peripherals = {
            ...createInjectedPeripherals(
                this._emulatorOptions.language,
                emulatorOptions.peripherals
            ),
            terminal: new Terminal({ executionController: this.executionController })
        }
        this.interactiveClock = this._peripherals.clock

        this.state = $state({
            systemSize: options.systemSize,
            registers: [],
            startingRegisterNames: [...options.registerNames],
            hiddenRegisters: options.hiddenRegisters ?? [], //TODO should this be state?
            pc: 0n,
            terminated: false,
            line: -1,
            decorations: [],
            statusRegisters: [],
            compilerDiagnostics: [],
            callStack: [],
            errors: [],
            sp: 0n,
            latestSteps: [],
            executionTime: -1,
            canUndo: false,
            canExecute: false,
            paused: false,
            breakpoints: [],
            interrupt: undefined,
            memory: {
                global: createMemoryTab(
                    this._emulatorOptions.globalPageSize,
                    'Global',
                    this._emulatorOptions.baseAddress,
                    this._emulatorOptions.globalPageElementsPerRow,
                    this._emulatorOptions.initialMemoryValue,
                    options.endianness ?? 'little'
                ),
                tabs: [
                    createMemoryTab(
                        8 * 4,
                        'Stack',
                        this._emulatorOptions.stackAddress,
                        4,
                        this._emulatorOptions.initialMemoryValue,
                        options.endianness ?? 'little'
                    )
                ]
            }
        })
        this.clear()
        void this.semanticCheck()
    }

    protected abstract getInstance(): T | null

    protected addDecorations() {
        if (!this.getInstance()) return
        const decorations = this._getCompiledCode()
        this.state.decorations = decorations.decorations
        this.state.compiledCode = decorations.code
    }

    protected addError(error: string) {
        this.state.errors.push(error)
    }

    protected scrollStackTab() {
        const settings = settingsStore
        const current = this.state
        if (!settings.values.autoScrollStackTab.value || !this.getInstance()) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = this._getSp()
        if (!stackTab) return
        const newAddress = sp - (sp % BigInt(stackTab.pageSize))
        if (stackTab.address !== newAddress) {
            stackTab.address = newAddress
            this.updateMemory()
            //reset the prevState as we don't know what the previous state was
            stackTab.data.prevState = stackTab.data.current
        }
    }

    /**
     * Places the Stack memory tab right after a successful compile.
     * The default points it one page below SP and then lets `scrollStackTab()` snap it to the
     * page containing SP. Languages whose legacy emulator did not auto-scroll on compile
     * (M68K) override this to keep the "page below SP" position.
     */
    protected positionStackTabOnCompile() {
        const stackTab = this.state.memory.tabs.find((e) => e.name === 'Stack')
        if (stackTab) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
        this.scrollStackTab()
    }

    /**
     * Serializes everything that touches the core against `_checkCode`'s throwaway assembly.
     *
     * The MARS/RARS derived cores (MIPS, RISC-V) keep the assembled program and the register file in
     * *module global* state, so assembling a second instance while one of them is executing hijacks
     * the run: the in flight `simulate*` carries on stepping the throwaway's program and then
     * reports a perfectly normal termination with the wrong registers and memory, no error raised.
     * Their `step`/`simulate*` yield to the event loop, so the debounced semantic check that
     * `setCode` arms on every keystroke can land inside a running program (a long run, or one
     * suspended on an input prompt) instead of safely between two of them.
     *
     * The whole public operation is held, not just the awaited core call: the epilogue that reads
     * registers and memory back out of the core must not be interleaved with a check either.
     */
    private async duringCoreOperation<T>(operation: () => Promise<T>): Promise<T> {
        this.coreOperations += 1
        try {
            return await operation()
        } finally {
            this.coreOperations -= 1
            if (this.coreOperations === 0) {
                const waiters = this.coreIdleWaiters
                this.coreIdleWaiters = []
                for (const resolve of waiters) resolve()
            }
        }
    }

    private waitForIdleCore(): Promise<void> {
        if (this.coreOperations === 0) return Promise.resolve()
        return new Promise<void>((resolve) => this.coreIdleWaiters.push(resolve))
    }

    protected async semanticCheck() {
        const checkId = ++this.semanticCheckId
        try {
            //`_checkCode` assembles a throwaway core, which for the MARS/RARS derived cores would
            //hijack a run that is still in flight (see `duringCoreOperation`), so wait it out. A
            //check that a newer one superseded in the meantime is dropped instead of assembling.
            await this.waitForIdleCore()
            if (checkId !== this.semanticCheckId) return []
            const diagnostics = await this._checkCode(this._code)
            if (checkId !== this.semanticCheckId) return diagnostics
            this.state.compilerDiagnostics = diagnostics
            this.state.errors = []
            return diagnostics
        } catch (e) {
            console.error(e)
            if (checkId !== this.semanticCheckId) return []
            const error = this._stringifyError(e)
            this.addError(error)
            return [makeGenericDiagnostic(error)]
        }
    }

    protected setRegisters(override?: bigint[]) {
        if (!this.getInstance() && !override) {
            override = new Array(this._registerNames.length).fill(0)
        }

        this.state.registers = (override ?? this._getRegisterValues()).map((reg, i) => {
            return makeRegister(this._registerNames[i], reg, this._systemSize)
        })
    }

    protected getRegistersValue() {
        if (!this.getInstance()) return []
        return this._getRegisterValues()
    }

    protected updateRegisters() {
        if (this.state.registers.length === 0) return
        this.getRegistersValue().forEach((reg, i) => {
            this.state.registers[i].setValue(reg)
        })
        this.state.sp = this._getSp()
    }

    protected updateMemory() {
        if (!this.getInstance()) return
        try {
            const temp = this.state.memory.global.data.current
            const memory = this._readMemoryBytes(
                this.state.memory.global.address,
                BigInt(this.state.memory.global.pageSize)
            )
            this.state.memory.global.data.current = new Uint8Array(memory)
            this.state.memory.global.data.prevState = temp
            this.state.memory.tabs.forEach((tab) => {
                const temp = tab.data.current
                const memory = this._readMemoryBytes(tab.address, BigInt(tab.pageSize))
                tab.data.current = new Uint8Array(memory)
                tab.data.prevState = temp
            })
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    protected async requestInput(question: string, execution: ExecutionGeneration) {
        this.state.interrupt = { type: 'ReadInput', message: question }
        try {
            return await this._peripherals.terminal.readAsync(question, execution)
        } finally {
            this.state.interrupt = undefined
        }
    }

    /**
     * One character rather than a line: with Screen keyboard input it is consumed as soon as it is
     * typed ([ADR 0009](../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)), and
     * with a prompt it is the first character of the answered line, as the adapters read it before.
     */
    protected async requestCharacter(question: string, execution: ExecutionGeneration) {
        this.state.interrupt = { type: 'ReadInput', message: question }
        try {
            return await this._peripherals.terminal.readCharAsync(question, execution)
        } finally {
            this.state.interrupt = undefined
        }
    }

    protected getLastExecutedLine(fallback = -1): number {
        try {
            const instruction = this._getLastInstruction?.()
            if (instruction) return instruction.lineNumber
            const [step] = this._getUndoHistory(1)
            return step?.line ?? fallback
        } catch (e) {
            console.error(e)
            return fallback
        }
    }

    protected updateData() {
        const settings = settingsStore
        if (!this.getInstance()) return
        this.state.terminated = this._hasTerminated()
        this.state.pc = this._getPc()
        this.state.callStack = this._getCallStack()
        this.state.latestSteps = this._getUndoHistory(
            settings.values.maxVisibleHistoryModifications.value
        )
    }

    /**
     * Everything a program left behind on its peripherals, on the Terminal's clear path: Build,
     * Stop, dispose and the start of each Testcase. The Screen keeps its last frame visible after a
     * termination and only loses it here, which is what the design record asks for.
     */
    private resetPeripherals(): void {
        const { terminal, screen, keyboard, mouse, clock } = this._peripherals
        terminal.clear()
        terminal.useInteractiveInput()
        this.applyScreenHistoryBudget()
        screen.reset()
        keyboard.reset()
        mouse.reset()
        clock.reset()
    }

    /**
     * The Screen history's byte budget is a user setting, because a clear, a present or a resize
     * journals a whole image ([ADR 0005](../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     * Applied on every clear, so changing the setting takes effect on the next Build without the
     * settings panel having to know about emulators.
     */
    private applyScreenHistoryBudget(): void {
        const megabytes = settingsStore.values.screenHistoryBudgetMb.value
        if (!Number.isFinite(megabytes) || megabytes < 0) return
        this._peripherals.screen.history.byteBudget = megabytes * 1024 * 1024
    }

    /**
     * The Undo depth is the smaller of the Core's instruction history and the Screen's history
     * within its byte budget ([ADR 0005](../../../docs/adr/0005-restore-screen-state-on-undo.md)):
     * both restore together or neither does, rather than the Core rolling back under an image it can
     * no longer recover. A Screen that recorded nothing (no graphics in the program, or a
     * memory-backed framebuffer, which journals nothing) never limits anything.
     */
    private canUndoStep(): boolean {
        if (!this._canUndo()) return false
        const history = this._peripherals.screen.history
        return history.sequence === 0 || history.depth > 0
    }

    /**
     * The run configuration of a Testcase: scripted answers and a virtual Time Source, chosen
     * together ([ADR 0010](../../../docs/adr/0010-program-time-without-clock-pacing.md)). Waits
     * complete immediately and advance a clock that starts at zero, so elapsed-time output is
     * reproducible and a sleeping program cannot stall a test.
     *
     * The clock instance is swapped, not switched: a clock's mode is fixed for its life, and an
     * adapter that captured the interactive one before the test would otherwise keep host time.
     */
    private useScriptedRun(input: string[]): void {
        this._peripherals.terminal.useScriptedInput(input)
        this._peripherals.clock.cancel()
        this._peripherals.clock = new ProgramClock({ mode: 'virtual' })
        this._peripherals.clock.start()
    }

    /**
     * Back to the interactive sources after a Testcase, including after one that threw. The
     * interactive clock is the instance the caller injected, so a GUI holding it keeps the one it
     * bound to.
     */
    private useInteractiveRun(): void {
        this._peripherals.terminal.useInteractiveInput()
        this._peripherals.clock.cancel()
        this._peripherals.clock = this.interactiveClock
        this._peripherals.clock.reset()
    }

    // ----- public api ----- //
    clear(): void {
        this.executionController.invalidate()
        //a paused run is parked on a promise of its own: let it go so it wakes up on the generation
        //this just invalidated and ends itself. Without this a Build or a Stop taken while paused
        //would leave the run parked forever, holding `duringCoreOperation` with it
        this.releasePause()
        //a new program is a new speed, and the estimates in the adapters are where it starts again
        this.speedCorrection = 1
        this.resetPeripherals()
        this.state = {
            ...this.state,
            terminated: false,
            compiledCode: undefined,
            pc: 0n,
            sp: 0n,
            decorations: [],
            line: -1,
            interrupt: undefined,
            errors: [],
            canUndo: false,
            paused: false,
            executionTime: -1,
            canExecute: false,
            latestSteps: [],
            callStack: [],
            //diagnostics describe the source, not the run — they survive a stop/clear and are
            //replaced by the next compile or semantic check
            memory: {
                global: createMemoryTab(
                    this._emulatorOptions.globalPageSize,
                    'Global',
                    this._emulatorOptions.baseAddress,
                    this._emulatorOptions.globalPageElementsPerRow,
                    this._emulatorOptions.initialMemoryValue,
                    this._endianness
                ),
                tabs: [
                    createMemoryTab(
                        8 * 4,
                        'Stack',
                        this._emulatorOptions.stackAddress,
                        4,
                        this._emulatorOptions.initialMemoryValue,
                        this._endianness
                    )
                ]
            }
        }
        this.setRegisters(new Array(this._registerNames.length).fill(0))
        this.updateStatusRegisters()
    }

    async compile(historySize: number, codeOverride: string | undefined): Promise<void> {
        return this.duringCoreOperation(() => this.compileInternal(historySize, codeOverride))
    }

    private async compileInternal(
        historySize: number,
        codeOverride: string | undefined
    ): Promise<void> {
        this.clear()
        const execution = this.executionController.capture()
        try {
            const result = await this._compile(codeOverride ?? this._code, historySize)
            this.executionController.ensureCurrent(execution)
            if (!result.ok) {
                this.state.compilerDiagnostics = result.diagnostics
                this.state.canExecute = false
                throw new CompilationFailedError(result.report, result.diagnostics)
            }
            //a successful build replaces the semantic check's list so stale squiggles drop and the
            //warnings the assembler emitted while succeeding are shown
            this.state.compilerDiagnostics = result.diagnostics ?? []
            this._initialize(historySize)
            this.addDecorations()
            this.state.canExecute = true
            this.state.canUndo = false
            this.state.line = this._getNextInstruction()?.lineNumber ?? -1
            this.updateRegisters()
            this.positionStackTabOnCompile()
            this.updateMemory()
            this.updateData()
            this.updateStatusRegisters()
        } catch (e) {
            if (!this.executionController.isCurrent(execution)) return
            //assembler errors already live in state.compilerDiagnostics and are rendered from there,
            //pushing them into state.errors too would render the whole list twice
            if (e instanceof CompilationFailedError) throw e
            this.addError(this._stringifyError(e))
            this.debouncer[1]()
            throw e
        }
    }

    dispose(): void {
        this.debouncer[1]()
        this.clear()
        this._dispose()
    }

    getLineFromAddress(address: bigint): number {
        if (!this.getInstance()) return -1
        const statement = this._getInstructionAt(address)
        if (!statement) return -1
        return statement.lineNumber
    }

    resetSelectedLine(): void {
        this.state.line = -1
    }

    updateStatusRegisters() {
        const flags = this._getFlags()

        this.state.statusRegisters = flags.map((s) => ({
            name: s.name,
            value: s.value ? 1 : 0,
            prev: (s.prev ?? s.value) ? 1 : 0
        }))
    }

    async run(haltLimit: number): Promise<InterpreterStatus> {
        return this.duringCoreOperation(() => this.runInternal(haltLimit))
    }

    /**
     * Asks the run in flight to park at its next slice boundary, where the program keeps its place,
     * its remaining instruction limit and its breakpoints — which is the whole difference between
     * this and Stop, which throws the program away.
     *
     * A pause with no run in flight does nothing: there is nothing to park, and remembering the
     * request would stop the *next* run before its first slice. A program suspended on input is not
     * executing either, and its slice has not returned, so the pause is taken once the input is
     * answered; the GUI disables the button while an input request is pending for that reason.
     */
    pause(): void {
        if (!this.runInFlight) return
        this.pauseRequested = true
    }

    /** Lets a paused run carry on from exactly where it parked. Harmless when nothing is paused. */
    resume(): void {
        this.releasePause()
    }

    /**
     * The run scheduler ([ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)):
     * the adapter never runs a whole program, it runs slices, and this loop decides how big each one
     * is, hands the host a turn between them, keeps the run's overall instruction limit across all
     * of them, and resumes a program that asked for time to pass.
     *
     * Every await goes through `execution`, so Stop answers during a slice boundary and during a
     * program-requested wait instead of only when the Core felt like returning, and so does the
     * pause `pause()` asks for.
     */
    private async runSlices(haltLimit: number, execution: ExecutionGeneration): Promise<void> {
        this.runInFlight = true
        try {
            await this.sliceLoop(haltLimit, execution)
        } finally {
            this.runInFlight = false
            //a pause asked for in the slice that ended the run is not inherited by the next one
            this.releasePause()
        }
    }

    /** The loop itself, so `runSlices` can own the flags a pause needs whichever way the run ends. */
    private async sliceLoop(haltLimit: number, execution: ExecutionGeneration): Promise<void> {
        let remaining = haltLimit
        while (remaining > 0) {
            //the slice boundary is the only place a pause can be taken: a slice is the Core running,
            //and nothing here can interrupt it once it has started
            if (this.pauseRequested) await this.pauseUntilResumed(execution)
            const targetMs = this.sliceTimeBudgetMs()
            const clock = this._peripherals.clock
            const startedAt = performance.now()
            const waitedAt = clock.waitedMs
            const slice: ExecutionSlice = await this._runSlice({
                //the whole rest of the limit, so an adapter can cap it with its own throughput
                //estimate of `timeBudgetMs` and never has to know how long the run has been going
                instructionBudget: remaining,
                timeBudgetMs: targetMs,
                breakpoints: this.state.breakpoints,
                runInstructionLimit: haltLimit,
                speedCorrection: this.speedCorrection
            })
            this.learnSliceSpeed(
                slice,
                targetMs,
                performance.now() - startedAt,
                clock.waitedMs - waitedAt
            )
            this.executionController.ensureCurrent(execution)
            const progress = Math.max(0, slice.instructions)
            remaining -= progress
            if (slice.reason === 'wait') {
                //a wait is not execution: it costs no instructions and the run continues after it.
                //`clear()` resets the clock, which resolves pending waits, and the generation check
                //that follows turns the resumed run into a superseded one. A wait without a promise
                //is a bare yield, so the loop can never spin without giving the host a turn
                const wait = slice.wait ?? yieldToHost()
                await this.executionController.waitFor(execution, () => wait)
                continue
            }
            if (slice.reason !== 'budget') return
            if (remaining <= 0) return
            //an adapter asking for another slice without having run anything would spin this loop
            //forever, so the run ends instead of hanging the host
            if (progress <= 0) return
            await this.executionController.waitFor(execution, () => yieldToHost())
        }
    }

    /**
     * What the last slice taught about how fast this program runs
     * ([ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)). Only a slice that came
     * back on its budget says anything — one cut short by a breakpoint, a wait or the end of the
     * program says nothing — and only the part of it that was compute: an adapter that serves a
     * program's `sleep` without leaving its slice would otherwise look like a Core a hundred times
     * slower than it is.
     */
    private learnSliceSpeed(
        slice: ExecutionSlice,
        targetMs: number,
        elapsedMs: number,
        waitedMs: number
    ): void {
        if (slice.reason !== 'budget' || slice.instructions <= 0) return
        const busyMs = Math.max(0, elapsedMs - Math.min(waitedMs, elapsedMs))
        this.speedCorrection = nextSpeedCorrection(this.speedCorrection, targetMs, busyMs)
    }

    /**
     * Parks the run between two slices until `resume()`, or until `clear()` (Build, Stop, dispose)
     * lets it go on an invalidated generation, which is how Stop tears a paused run down — the same
     * path a program-requested wait takes.
     *
     * Nothing about the run is touched here: the remaining instruction limit, the breakpoints and
     * the speed correction belong to the loop and are picked up again by the next slice, so
     * resuming carries on rather than starting the program over.
     */
    private async pauseUntilResumed(execution: ExecutionGeneration): Promise<void> {
        this.state.paused = true
        //a pause is only worth taking if the panels show where the program actually got to: without
        //this they would still hold whatever they showed when Run was pressed
        this.refreshVisibleState(false)
        const pausedAt = performance.now()
        const resumed = new Promise<void>((resolve) => {
            this.resumePausedRun = resolve
        })
        try {
            await this.executionController.waitFor(execution, () => resumed)
        } finally {
            this.pausedMs += performance.now() - pausedAt
            this.resumePausedRun = null
            this.pauseRequested = false
            this.state.paused = false
        }
    }

    /**
     * Settles the promise a parked run is waiting on and forgets the request. `resume()` calls it to
     * carry on; `clear()` calls it so a paused run cannot survive a Build, a Stop or a dispose.
     */
    private releasePause(): void {
        this.pauseRequested = false
        const resume = this.resumePausedRun
        this.resumePausedRun = null
        resume?.()
    }

    /**
     * How long the next slice should aim to run. A Screen with pixels the renderer has not painted
     * yet means an animating program, which needs to reach its next frame and its next input poll
     * soon; everything else is compute and yields only often enough to keep Stop answering. Measured
     * in phase 8; `speedCorrection` is what turns the target into instructions for this program.
     *
     * The Screen has to be watched as well as dirty: a Screen nobody paints — x86's, which has no
     * panel, or any surface whose Screen toggle is closed — never comes back from dirty, and would
     * otherwise hold every one of its programs at the animation budget for the whole run.
     */
    private sliceTimeBudgetMs(): number {
        const screen = this._peripherals.screen
        if (screen.watched && screen.dirty) return SCREEN_SLICE_MS
        return COMPUTE_SLICE_MS
    }

    /**
     * Everything the user inspects, read back out of the Core: the current line, whether Undo is
     * available, and the register, memory, status-register and program-counter views. The end of a
     * run does this, and so does a pause, which would otherwise leave every panel showing what it
     * held when Run was pressed.
     */
    private refreshVisibleState(terminated: boolean): void {
        try {
            const ins = this._getNextInstruction()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            if (!terminated) {
                this.state.line = ins?.lineNumber ?? -1
            } else {
                this.state.line = this.getLastExecutedLine()
            }
        } catch {
            this.state.line = terminated ? this.getLastExecutedLine() : -1
        }
        this.state.canUndo = this.canUndoStep()
        this.refreshCoreViews()
    }

    /** The half of `refreshVisibleState` a step shares; a step owns its own line and Undo handling. */
    private refreshCoreViews(): void {
        this.updateRegisters()
        this.scrollStackTab()
        this.updateMemory()
        this.updateData()
        this.updateStatusRegisters()
    }

    private async runInternal(haltLimit: number): Promise<InterpreterStatus> {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        this.pausedMs = 0
        const execution = this.executionController.capture()
        try {
            await this.runSlices(haltLimit, execution)
            this.executionController.ensureCurrent(execution)
            const terminated = this._hasTerminated()
            this.refreshVisibleState(terminated)
            //the time the user held the program in a pause is not time the program ran
            this.state.executionTime = performance.now() - start - this.pausedMs
            this.state.terminated = terminated
            //if it managed to run, it means it does not have valid errors
            this.state.errors = []
            return terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            if (!this.executionController.isCurrent(execution)) {
                return InterpreterStatus.Terminated
            }
            console.error(e)
            let line = -1
            try {
                //the failing instruction is the last one that was attempted, not the one after it
                line =
                    this._getLastInstruction?.()?.lineNumber ??
                    this._getNextInstruction()?.lineNumber ??
                    -1
            } catch (e) {
                console.error(e)
            }
            this.addError(this._stringifyError(e, line >= 0 ? line + 1 : undefined))
            this.state.terminated = true
            this.state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    protected debouncer = createDebouncer(500)

    setCode(code: string): void {
        this._code = code
        this.debouncer[0](() => void this.semanticCheck())
    }

    setGlobalMemoryAddress(address: bigint): void {
        try {
            const bytes = this.getInstance()
                ? this._readMemoryBytes(address, BigInt(this.state.memory.global.pageSize))
                : new Uint8Array(this.state.memory.global.pageSize).fill(
                      this._emulatorOptions.initialMemoryValue
                  )
            this.state.memory.global.address = address
            this.state.memory.global.data.current = bytes
            // Reset prevState as we don't know what the previous state was.
            this.state.memory.global.data.prevState = this.state.memory.global.data.current
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    setTabMemoryAddress(address: bigint, tabId: number): void {
        try {
            const tab = this.state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            const bytes = this.getInstance()
                ? this._readMemoryBytes(address, BigInt(tab.pageSize))
                : new Uint8Array(tab.pageSize).fill(this._emulatorOptions.initialMemoryValue)
            tab.address = address
            tab.data.current = bytes
            tab.data.prevState = tab.data.current
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    async validateTestcase(testcase: Testcase) {
        const errors: TestcaseValidationError[] = []
        if (!this.getInstance()) throw new Error('Interpreter not initialized')
        const registers = this._getRegisterValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = this._registerNames.findIndex(
                (r) => r.toUpperCase() === register.toUpperCase()
            )
            if (registerIndex === -1) {
                console.error(`Register ${register} not found`)
                continue
            }
            const registerValue = BigInt(registers[registerIndex])
            if (registerValue !== value) {
                errors.push({
                    type: 'wrong-register',
                    register,
                    expected: value,
                    got: registerValue
                })
            }
        }
        const stdOut = this.stdOut
        if (stdOut !== testcase.expectedOutput) {
            errors.push({
                type: 'wrong-output',
                expected: testcase.expectedOutput,
                got: stdOut
            })
        }
        for (const value of testcase.expectedMemory) {
            if (value.type === 'number') {
                const bytes = new Uint8Array(
                    this._readMemoryBytes(value.address, BigInt(value.bytes))
                )
                const num = byteSliceToNum(bytes, this._endianness)
                if (num !== value.expected) {
                    errors.push({
                        type: 'wrong-memory-number',
                        address: value.address,
                        bytes: value.bytes,
                        expected: value.expected,
                        got: num
                    })
                }
            } else if (value.type === 'number-chunk') {
                const bytes = this._readMemoryBytes(
                    value.address,
                    BigInt(value.expected.length * value.bytes)
                )
                const expected = numbersOfSizeToSlice(value.expected, value.bytes, this._endianness)
                if (!isMemoryChunkEqual(bytes, expected)) {
                    errors.push({
                        type: 'wrong-memory-chunk',
                        address: value.address,
                        expected: expected,
                        got: Array.from(bytes)
                    })
                }
            } else if (value.type === 'string-chunk') {
                const bytes = this._readMemoryBytes(value.address, BigInt(value.expected.length))
                const str = new TextDecoder().decode(new Uint8Array(bytes))
                if (str !== value.expected) {
                    errors.push({
                        type: 'wrong-memory-string',
                        address: value.address,
                        expected: value.expected,
                        got: str
                    })
                }
            }
        }
        return errors
    }

    async step(): Promise<boolean> {
        return this.duringCoreOperation(() => this.stepInternal())
    }

    private async stepInternal(): Promise<boolean> {
        let lastLine = -1
        const execution = this.executionController.capture()
        try {
            if (!this.getInstance()) throw new Error('Interpreter not initialized')
            lastLine = this._getNextInstruction()?.lineNumber ?? -1
            const result = await this._step()
            this.executionController.ensureCurrent(execution)
            this.state.terminated = result.terminated
            if (result.terminated) {
                this.state.line = this.getLastExecutedLine(lastLine)
            } else {
                try {
                    const ins = this._getNextInstruction()
                    this.state.line = ins?.lineNumber ?? -1
                } catch {}
            }

            this.state.canUndo = this.canUndoStep()
            //if it managed to step, it means it does not have valid errors
            this.state.errors = []
        } catch (e) {
            if (!this.executionController.isCurrent(execution)) return false
            console.error(e)
            this.addError(this._stringifyError(e, lastLine >= 0 ? lastLine + 1 : undefined))
            this.state.terminated = true
            this.state.line = lastLine
            throw e
        }
        this.refreshCoreViews()
        return this._hasTerminated()
    }

    async runTestcase(testcase: Testcase, haltLimit: number) {
        return this.duringCoreOperation(() => this.runTestcaseInternal(testcase, haltLimit))
    }

    private async runTestcaseInternal(testcase: Testcase, haltLimit: number) {
        const start = performance.now()
        const execution = this.executionController.capture()
        try {
            if (!this.getInstance()) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(testcase.startingRegisters)) {
                const registerName = this._registerNames.find(
                    (candidate) => candidate.toUpperCase() === register.toUpperCase()
                )
                if (!registerName) throw new Error(`Register ${register} not found`)
                this._setRegisterValue(registerName, value)
            }
            for (const value of testcase.startingMemory) {
                if (value.type === 'number') {
                    const slice = new Uint8Array(
                        numberToByteSlice(value.expected, value.bytes, this._endianness)
                    )
                    this._writeMemoryBytes(value.address, slice)
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(
                        value.expected,
                        value.bytes,
                        this._endianness
                    )
                    this._writeMemoryBytes(value.address, new Uint8Array(expected))
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    this._writeMemoryBytes(value.address, encoded)
                }
            }
            this.useScriptedRun(testcase.input)
            try {
                await this._runTestcase(testcase, haltLimit)
            } finally {
                this.useInteractiveRun()
            }
            const ins = this._getNextInstruction()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            this.state.line = ins?.lineNumber ?? this.getLastExecutedLine()
            this.state.canUndo = false

            this.updateRegisters()
            this.scrollStackTab()
            this.updateStatusRegisters()
            this.updateMemory()
            this.updateData()
            this.state.executionTime = performance.now() - start
        } catch (e) {
            //the run was superseded (clear/dispose/stop while an interrupt was pending), the state
            //has already been rebuilt by clear() and must not be written back over
            if (!this.executionController.isCurrent(execution)) {
                return InterpreterStatus.Terminated
            }
            console.error(e)
            let line = -1
            try {
                //the failing instruction is the last one that was attempted, not the one after it
                line =
                    this._getLastInstruction?.()?.lineNumber ??
                    this._getNextInstruction()?.lineNumber ??
                    -1
            } catch (e) {
                console.error(e)
            }
            this.addError(this._stringifyError(e, line >= 0 ? line + 1 : undefined))
            this.state.terminated = true
            this.state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    async test(code: string, testcases: Testcase[], haltLimit: number, historySize = 0) {
        //held across the whole loop: `validateTestcase` reads registers and memory back out of the
        //core between two runs, which a semantic check must not be able to slip into either
        return this.duringCoreOperation(() =>
            this.testInternal(code, testcases, haltLimit, historySize)
        )
    }

    private async testInternal(
        code: string,
        testcases: Testcase[],
        haltLimit: number,
        historySize = 0
    ) {
        const terminal = this._peripherals.terminal
        const results: TestcaseResult[] = []
        for (const original of testcases) {
            const testcase = structuredClone($state.snapshot(original)) as Testcase
            try {
                await this.compile(historySize, code)
                await this.runTestcase(testcase, haltLimit)
                const errors = await this.validateTestcase(testcase)
                results.push({
                    errors,
                    passed: errors.length === 0,
                    testcase
                })
            } catch (e) {
                console.error(e)
                this.addError(this._stringifyError(e))
            }
        }
        const passedTests = results.filter((r) => r.passed)
        terminal.prepend('⏳ Running tests...\n\n')
        if (passedTests.length !== results.length) {
            terminal.write(
                `\n❌ ${results.length - results.filter((r) => r.passed).length} testcases not passed\n`
            )
        }
        if (passedTests.length > 0) {
            if (!terminal.output.endsWith('testcases not passed')) {
                terminal.write('\n')
            }
            terminal.write(`\n✅ ${passedTests.length} testcases passed \n`)
        }
        return results
    }

    toggleBreakpoint(line: number): void {
        const index = this.state.breakpoints.indexOf(line)
        if (index === -1) this.state.breakpoints.push(line)
        else this.state.breakpoints.splice(index, 1)
    }

    undo(amount: number | undefined): void {
        try {
            if (!this.getInstance()) return
            const undoCount = Math.max(0, Math.floor(amount ?? 1))
            let undone = 0
            for (; undone < undoCount && this.canUndoStep(); undone++) {
                //the Core owns the instruction boundary, so it rolls back first and the Screen
                //follows it (ADR 0005)
                this._undo()
                this._peripherals.screen.undo()
            }
            //an image that lives in Core memory was restored by the rollback itself, so the Screen
            //re-reads it instead of having journaled it. Once for the whole rollback: the re-read is
            //a whole region and only the state it ends in is shown
            if (undone > 0) this._resyncScreenFromMemory?.()
            const instruction = this._getNextInstruction()
            this.state.line = instruction?.lineNumber ?? -1
            this.state.canUndo = this.canUndoStep()
            this.updateRegisters()
            this.scrollStackTab()
            this.updateMemory()
            this.updateData()
            this.updateStatusRegisters()
        } catch (e) {
            this.addError(this._stringifyError(e))
            this.state.terminated = true
            console.error(e)
            throw e
        }
    }

    readMemoryBytes(address: bigint, length: number): Uint8Array {
        if (!this.getInstance()) throw new Error('Emulator not initialized')
        return this._readMemoryBytes(address, BigInt(length))
    }

    async check() {
        //no `getInstance()` guard here: assembler checking must work before the first compile.
        //`_checkCode` is responsible for bailing out when its language needs a live instance
        //(X86 returns [] without a core, M68K's is a pure static call).
        return this.semanticCheck()
    }

    get breakpoints() {
        return this.state.breakpoints
    }

    get callStack() {
        return this.state.callStack
    }

    get canExecute() {
        return this.state.canExecute
    }

    get canUndo() {
        return this.state.canUndo
    }

    get paused() {
        return this.state.paused
    }

    get compilerDiagnostics() {
        return this.state.compilerDiagnostics
    }

    get compilerErrors() {
        return this.state.compilerDiagnostics.filter((d) => d.severity === 'error')
    }

    get decorations() {
        return this.state.decorations
    }

    get errors() {
        return this.state.errors
    }

    get executionTime() {
        return this.state.executionTime
    }

    get hiddenRegisters() {
        return this.state.hiddenRegisters
    }

    get latestSteps() {
        return this.state.latestSteps
    }

    get line() {
        return this.state.line
    }

    get memory() {
        return this.state.memory
    }

    get pc() {
        return this.state.pc
    }

    get registers() {
        return this.state.registers
    }

    get startingRegisterNames() {
        return this.state.startingRegisterNames
    }

    get sp() {
        return this.state.sp
    }

    get statusRegisters() {
        return this.state.statusRegisters
    }

    get stdOut() {
        return this._peripherals.terminal.output
    }

    get peripherals(): EmulatorPeripherals {
        return this._peripherals
    }

    get interrupt() {
        return this.state.interrupt
    }

    get terminated() {
        return this.state.terminated
    }

    get code() {
        return this._code
    }

    get systemSize() {
        return this._systemSize
    }

    get endianness() {
        return this._endianness
    }

    get compiledCode() {
        return this.state.compiledCode
    }
}
