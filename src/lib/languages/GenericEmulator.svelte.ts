import {
    BaseEmulator,
    CompilationFailedError,
    type EmulatorConfig
} from '$lib/languages/BaseEmulator.svelte'
import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    type BuildArtifact,
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
    SCREEN_ACTIVITY_MS,
    SCREEN_SLICE_MS,
    yieldToHost
} from '$lib/languages/ExecutionSlice'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { createDebouncer } from '$lib/utils'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import { projectSettingDefault } from '$lib/projectSettings'
import {
    byteSliceToNum,
    isMemoryChunkEqual,
    numberToByteSlice
} from '$cmp/specific/project/memory/memoryTabUtils'
import { ExecutionController, type ExecutionGeneration } from '$lib/languages/ExecutionController'
import { Prompt } from '$stores/promptStore.svelte'
import structuredClone from '@ungap/structured-clone'
import {
    normalizeBuildInput,
    ProjectFormatError,
    sourceText,
    updateEntryText,
    type BuildInput,
    type BuildSources
} from '$lib/projectFiles'
import { FileSystem, type FileSystemSession } from '$lib/languages/peripherals/FileSystem'

/**
 * How often the panels a user watches — registers, memory, the call stack, the undo history — are
 * read back out of the Core while a program is running. One display frame: the browser cannot show
 * more than one change per frame, so a refresh per Core interrupt costs work that is thrown away.
 * Measured in the headless shell on `m68k/bouncing-ball.x68`, whose frame is six traps: refreshing
 * per trap held the main thread at 76% busy and delivered 32 frames a second, and refreshing at
 * most this often held it at 47% and delivered 40.
 */
const RUNNING_PANEL_REFRESH_MS = 16

function buildSourcesEqual(left: BuildSources, right: BuildSources): boolean {
    if (left.entry !== right.entry) return false
    const leftPaths = Object.keys(left.files)
    const rightPaths = Object.keys(right.files)
    if (leftPaths.length !== rightPaths.length) return false
    return leftPaths.every((path) => {
        const leftFile = left.files[path]
        const rightFile = right.files[path]
        return (
            leftFile !== undefined &&
            rightFile !== undefined &&
            leftFile.encoding === rightFile.encoding &&
            leftFile.content === rightFile.content
        )
    })
}

export abstract class GenericEmulator<T, R extends string>
    extends BaseEmulator<R>
    implements BaseEmulatorActions, BaseEmulatorState
{
    protected state: Omit<BaseEmulatorState, 'code' | 'stdOut'>
    protected _sources: BuildSources
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
     * What `sliceTimeBudgetMs` remembers about the Screen: the version it last saw, and the moment
     * the animation budget stops applying if nothing draws again before then. The version starts at
     * the one a fresh Screen has, so a program that never draws never asks for the short slice.
     */
    private lastScreenVersion = 0
    private screenActiveUntil = 0
    /** When `refreshRunningPanels` last read the Core for the panels, see the constant above. */
    private lastPanelRefresh = 0
    /**
     * The pause the Run button turns into while a program is running. `pauseRequested` is set by
     * `pause()` and honored by returning from `runSlices` at its next slice boundary, just as for
     * a breakpoint. Step and Undo can then own the Core, and Run starts a new invocation at its PC.
     */
    private pauseRequested = false
    private runInFlight = false
    protected fileSystemSession: FileSystemSession | null = null
    private _buildSources: BuildSources | undefined = $state()
    /** Number of core operations currently in flight, see `duringCoreOperation`. */
    private coreOperations = 0
    private coreOperationTail: Promise<void> = Promise.resolve()
    private coreIdleWaiters: (() => void)[] = []
    protected readonly executionController = new ExecutionController(() => Prompt.cancel())

    constructor(
        source: BuildInput,
        options: EmulatorConfig<R>,
        emulatorOptions: EmulatorSettings = {}
    ) {
        super(options)
        this._emulatorOptions = {
            globalPageSize: emulatorOptions.globalPageSize ?? PAGE_SIZE,
            globalPageElementsPerRow:
                emulatorOptions.globalPageElementsPerRow ?? PAGE_ELEMENTS_PER_ROW,
            baseAddress: emulatorOptions.baseAddress ?? 0x1000n,
            stackAddress: emulatorOptions.stackAddress ?? 0x7ffffffcn,
            initialMemoryValue: emulatorOptions.initialMemoryValue ?? 0x0,
            language: emulatorOptions.language ?? 'M68K',
            automaticChecking: emulatorOptions.automaticChecking ?? true,
            screenHistoryBudgetMb:
                emulatorOptions.screenHistoryBudgetMb ??
                projectSettingDefault('screenHistoryBudgetMb', emulatorOptions.language ?? 'M68K'),
            fileSystemHistoryBudgetMb:
                emulatorOptions.fileSystemHistoryBudgetMb ??
                projectSettingDefault(
                    'fileSystemHistoryBudgetMb',
                    emulatorOptions.language ?? 'M68K'
                )
        }
        this._sources = $state(normalizeBuildInput(source))
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
            currentFile: this._sources.entry,
            decorations: [],
            buildArtifacts: [],
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
        if (this._emulatorOptions.automaticChecking) void this.semanticCheck()
    }

    protected abstract getInstance(): T | null

    protected _getBuildArtifacts(): BuildArtifact[] {
        return []
    }

    protected addDecorations() {
        if (!this.getInstance()) return
        const decorations = this._getCompiledCode()
        this.state.decorations = decorations.decorations
        this.state.compiledCode = decorations.code
        this.state.buildArtifacts = this._getBuildArtifacts()
    }

    protected addError(error: string) {
        this.state.errors.push(error)
    }

    protected scrollStackTab() {
        const settings = preferencesStore
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
     * Serializes execution commands and holds off `_checkCode`'s throwaway assembly until idle.
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
        const previous = this.coreOperationTail
        let release!: () => void
        this.coreOperationTail = new Promise<void>((resolve) => {
            release = resolve
        })
        await previous
        try {
            return await operation()
        } finally {
            release()
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
            //MARS and RARS keep part of their active machine in generated module globals. Running
            //their checker while a built machine is retained would replace those globals. The
            //Build diagnostics already describe the immutable Build snapshot, so expose those to
            //explicit callers until Stop instead of silently reporting that the program is clean.
            if (this.fileSystemSession) return this.state.compilerDiagnostics
            const diagnostics = await this._checkCode($state.snapshot(this._sources))
            if (checkId !== this.semanticCheckId) return diagnostics
            this.state.compilerDiagnostics = diagnostics
            this.state.errors = []
            return diagnostics
        } catch (e) {
            if (!(e instanceof ProjectFormatError)) console.error(e)
            if (checkId !== this.semanticCheckId) return []
            const error = e instanceof ProjectFormatError ? e.message : this._stringifyError(e)
            const diagnostic = { ...makeGenericDiagnostic(error), file: this._sources.entry }
            this.state.compilerDiagnostics = [diagnostic]
            this.state.errors = []
            return [diagnostic]
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

    private selectInstruction(instruction: { file: string; lineNumber: number } | null): void {
        this.state.line = instruction?.lineNumber ?? -1
        if (instruction) this.state.currentFile = instruction.file
    }

    private selectLastExecuted(fallback = -1): void {
        try {
            const instruction = this._getLastInstruction?.()
            if (instruction) {
                this.selectInstruction(instruction)
                return
            }
            const [step] = this._getUndoHistory(1)
            this.state.line = step?.line ?? fallback
            if (step?.file) this.state.currentFile = step.file
        } catch {
            this.state.line = fallback
        }
    }

    protected updateData() {
        const settings = preferencesStore
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
     * The Screen history's byte budget is a Setting of the Project, because a clear, a present or a
     * resize journals a whole image ([ADR 0005](../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     * Applied on every clear, so a changed Setting takes effect on the next Build without the
     * settings panel having to know about emulators.
     */
    private applyScreenHistoryBudget(): void {
        const megabytes = this._emulatorOptions.screenHistoryBudgetMb
        if (!Number.isFinite(megabytes) || megabytes < 0) return
        this._peripherals.screen.history.byteBudget = megabytes * 1024 * 1024
    }

    setScreenHistoryBudgetMb(megabytes: number): void {
        this._emulatorOptions.screenHistoryBudgetMb = megabytes
    }

    /**
     * The adapter knows which peripheral effects belong to the next CPU undo record and preflights
     * them against the Screen's byte budget. Unrelated CPU instructions remain undoable even if an
     * older drawing has been evicted. Memory-backed framebuffers rely on the CPU history alone.
     */
    private canUndoStep(): boolean {
        return this._canUndo()
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
        this.fileSystemSession?.stop()
        this.fileSystemSession = null
        this._buildSources = undefined
        this.pauseRequested = false
        //a new program is a new speed, and the estimates in the adapters are where it starts again
        this.speedCorrection = 1
        this.resetPeripherals()
        //the reset above is itself a visible change, and what the previous program drew must not
        //make the next one's first slices the animation ones
        this.lastScreenVersion = this._peripherals.screen.version
        this.screenActiveUntil = 0
        this.lastPanelRefresh = 0
        this.state = {
            ...this.state,
            terminated: false,
            compiledCode: undefined,
            pc: 0n,
            sp: 0n,
            decorations: [],
            buildArtifacts: [],
            line: -1,
            currentFile: this._sources.entry,
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

    async compile(historySize: number, sourceOverride: BuildInput | undefined): Promise<void> {
        //Build must cancel an active run/input wait before queuing for its Core lock.
        if (this.coreOperations > 0) this.clear()
        return this.duringCoreOperation(() =>
            this.compileInternal(historySize, sourceOverride, this._peripherals.fileSystem)
        )
    }

    private async compileInternal(
        historySize: number,
        sourceOverride: BuildInput | undefined,
        fileSystem: FileSystem
    ): Promise<void> {
        this.clear()
        const execution = this.executionController.capture()
        let entry = this._sources.entry
        try {
            const sources =
                sourceOverride === undefined
                    ? $state.snapshot(this._sources)
                    : normalizeBuildInput(sourceOverride)
            entry = sources.entry
            const result = await this._compile(sources, historySize)
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
            const megabytes = this._emulatorOptions.fileSystemHistoryBudgetMb
            this.fileSystemSession = fileSystem.beginSession(
                Number.isFinite(megabytes) && megabytes >= 0 ? megabytes * 1024 * 1024 : 0,
                Number.isFinite(historySize) ? Math.max(0, Math.floor(historySize)) : 0
            )
            this._buildSources = sources
            this.addDecorations()
            this.state.canExecute = true
            this.state.canUndo = false
            const instruction = this._getNextInstruction()
            this.state.line = instruction?.lineNumber ?? -1
            this.state.currentFile = instruction?.file ?? sources.entry
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
            if (e instanceof ProjectFormatError) {
                const report = e.message
                const diagnostic = { ...makeGenericDiagnostic(report), file: entry }
                this.state.compilerDiagnostics = [diagnostic]
                throw new CompilationFailedError(report, [diagnostic])
            }
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
        return this.getSourceLocationFromAddress(address)?.line ?? -1
    }

    getSourceLocationFromAddress(address: bigint): { file: string; line: number } | null {
        if (!this.getInstance()) return null
        const statement = this._getInstructionAt(address)
        if (!statement) return null
        return { file: statement.file, line: statement.lineNumber }
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
        if (!this.state.canExecute) return InterpreterStatus.Terminated
        const execution = this.executionController.capture()
        return this.duringCoreOperation(() =>
            this.executionController.isCurrent(execution)
                ? this.runInternal(haltLimit)
                : Promise.resolve(InterpreterStatus.Terminated)
        )
    }

    /**
     * Ends the current Run at its next instruction boundary, preserving the program and history.
     * A subsequent Run gets its own instruction limit, just as after a breakpoint.
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
        this.state.paused = false
        try {
            await this.sliceLoop(haltLimit, execution)
        } finally {
            this.runInFlight = false
            //a pause asked for in the slice that ended the run is not inherited by the next one
            this.pauseRequested = false
        }
    }

    /** The loop itself, so `runSlices` can own the flags a pause needs whichever way the run ends. */
    private async sliceLoop(haltLimit: number, execution: ExecutionGeneration): Promise<void> {
        let remaining = haltLimit
        while (remaining > 0) {
            //the slice boundary is the only place a pause can be taken: a slice is the Core running,
            //and nothing here can interrupt it once it has started
            if (this.pauseRequested) {
                this.state.paused = true
                return
            }
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
     * How long the next slice should aim to run. A Screen a program is drawing on means an animating
     * program, which needs to reach its next frame and its next input poll soon; everything else is
     * compute and yields only often enough to keep Stop answering. Measured in phase 8;
     * `speedCorrection` is what turns the target into instructions for this program.
     *
     * Drawing is recognized from the version counter and remembered for `SCREEN_ACTIVITY_MS`, not
     * from the dirty flag alone: the renderer clears dirty the moment it paints, so a program that
     * draws without ever waiting used to be handed the 50 ms compute budget for the very next slice
     * and drew a dozen more frames the GUI could not show until it came back. The version is what a
     * renderer already compares, and it moves for a change to the visible image whether or not
     * anybody has painted it yet, which is why the flag itself is no longer consulted.
     *
     * The Screen still has to be watched: a Screen nobody paints — x86's, which has no panel, or
     * any surface whose Screen toggle is closed — would otherwise hold its programs at the
     * animation budget for as long as they draw, with no frames to show for it.
     */
    private sliceTimeBudgetMs(): number {
        const screen = this._peripherals.screen
        if (!screen.watched) return COMPUTE_SLICE_MS
        const now = performance.now()
        if (screen.version !== this.lastScreenVersion) {
            this.lastScreenVersion = screen.version
            this.screenActiveUntil = now + SCREEN_ACTIVITY_MS
        }
        return now < this.screenActiveUntil ? SCREEN_SLICE_MS : COMPUTE_SLICE_MS
    }

    /**
     * The panels, refreshed from inside a running program — the path an adapter takes when its Core
     * stops on an interrupt. Reading the registers, a page of memory per tab, the call stack and the
     * undo history is not free, and none of it can be seen more than once a display frame, so it is
     * rate limited to `RUNNING_PANEL_REFRESH_MS` rather than done per interrupt.
     *
     * `force` is for the interrupts that suspend the program for the user: an input prompt is read
     * beside the panels, and the user has all the time in the world to notice that they are one
     * frame stale. The end of a run and a pause go through `refreshVisibleState` instead, which is
     * never rate limited, so what a stopped program leaves on screen is always current.
     */
    protected refreshRunningPanels(force: boolean): void {
        const now = performance.now()
        if (!force && now - this.lastPanelRefresh < RUNNING_PANEL_REFRESH_MS) return
        this.lastPanelRefresh = now
        this.updateRegisters()
        this.updateStatusRegisters()
        this.updateMemory()
        this.updateData()
        this.scrollStackTab()
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
                this.selectInstruction(ins)
            } else {
                this.selectLastExecuted()
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
        const execution = this.executionController.capture()
        try {
            await this.runSlices(haltLimit, execution)
            this.executionController.ensureCurrent(execution)
            const terminated = this._hasTerminated()
            this.refreshVisibleState(terminated)
            this.state.executionTime = performance.now() - start
            this.state.terminated = terminated
            //if it managed to run, it means it does not have valid errors
            this.state.errors = []
            return terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            this.state.paused = false
            if (!this.executionController.isCurrent(execution)) {
                return InterpreterStatus.Terminated
            }
            console.error(e)
            let instruction: { file: string; lineNumber: number } | null = null
            try {
                //the failing instruction is the last one that was attempted, not the one after it
                instruction = this._getLastInstruction?.() ?? this._getNextInstruction()
            } catch (e) {
                console.error(e)
            }
            const line = instruction?.lineNumber ?? -1
            this.addError(this._stringifyError(e, line >= 0 ? line + 1 : undefined))
            this.state.terminated = true
            this.selectInstruction(instruction)
        }
        return InterpreterStatus.TerminatedWithException
    }

    protected debouncer = createDebouncer(500)

    setCode(code: string): void {
        const entry = this._sources.files[this._sources.entry]
        if (entry?.encoding === 'plain' && entry.content === code) return
        this._sources = updateEntryText(this._sources, code)
        if (this.fileSystemSession || !this._emulatorOptions.automaticChecking) return
        this.debouncer[0](() => void this.semanticCheck())
    }

    setSources(sources: BuildInput): void {
        const normalized = normalizeBuildInput(sources)
        if (buildSourcesEqual(this._sources, normalized)) return
        this._sources = normalized
        //A guest may update live source while the debugger still owns a Core built from the old
        //snapshot. MARS and RARS assembly mutates module globals used by that Core, so live checking
        //resumes only after Stop.
        if (this.fileSystemSession || !this._emulatorOptions.automaticChecking) return
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
        if (!this.state.canExecute) return false
        const execution = this.executionController.capture()
        return this.duringCoreOperation(() =>
            this.executionController.isCurrent(execution)
                ? this.stepInternal()
                : Promise.resolve(false)
        )
    }

    private async stepInternal(): Promise<boolean> {
        this.state.paused = false
        let attemptedInstruction: { file: string; lineNumber: number } | null = null
        const execution = this.executionController.capture()
        try {
            if (!this.getInstance()) throw new Error('Interpreter not initialized')
            attemptedInstruction = this._getNextInstruction()
            const result = await this._step()
            this.executionController.ensureCurrent(execution)
            this.state.terminated = result.terminated
            if (result.terminated) {
                this.selectLastExecuted(attemptedInstruction?.lineNumber ?? -1)
            } else {
                try {
                    const ins = this._getNextInstruction()
                    this.selectInstruction(ins)
                } catch {}
            }

            this.state.canUndo = this.canUndoStep()
            //if it managed to step, it means it does not have valid errors
            this.state.errors = []
        } catch (e) {
            if (!this.executionController.isCurrent(execution)) return false
            console.error(e)
            try {
                attemptedInstruction = this._getLastInstruction?.() ?? attemptedInstruction
            } catch {}
            const line = attemptedInstruction?.lineNumber ?? -1
            this.addError(this._stringifyError(e, line >= 0 ? line + 1 : undefined))
            this.state.terminated = true
            this.selectInstruction(attemptedInstruction)
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
            if (ins) this.state.currentFile = ins.file
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
            let instruction: { file: string; lineNumber: number } | null = null
            try {
                //the failing instruction is the last one that was attempted, not the one after it
                instruction = this._getLastInstruction?.() ?? this._getNextInstruction()
            } catch (e) {
                console.error(e)
            }
            const line = instruction?.lineNumber ?? -1
            this.addError(this._stringifyError(e, line >= 0 ? line + 1 : undefined))
            this.state.terminated = true
            this.selectInstruction(instruction)
        }
        return InterpreterStatus.TerminatedWithException
    }

    async test(sources: BuildInput, testcases: Testcase[], haltLimit: number, historySize = 0) {
        //held across the whole loop: `validateTestcase` reads registers and memory back out of the
        //core between two runs, which a semantic check must not be able to slip into either
        return this.duringCoreOperation(() =>
            this.testInternal(sources, testcases, haltLimit, historySize)
        )
    }

    private async testInternal(
        sources: BuildInput,
        testcases: Testcase[],
        haltLimit: number,
        historySize = 0
    ) {
        const terminal = this._peripherals.terminal
        const results: TestcaseResult[] = []
        const snapshot = normalizeBuildInput(sources)
        for (const original of testcases) {
            const testcase = structuredClone($state.snapshot(original)) as Testcase
            try {
                //The whole testcase loop already owns the Core operation lock.
                const isolatedFileSystem = new FileSystem(snapshot.files)
                await this.compileInternal(historySize, snapshot, isolatedFileSystem)
                await this.runTestcaseInternal(testcase, haltLimit)
                const errors = await this.validateTestcase(testcase)
                results.push({
                    errors,
                    passed: errors.length === 0,
                    testcase
                })
            } catch (e) {
                console.error(e)
                this.addError(this._stringifyError(e))
            } finally {
                this.fileSystemSession?.stop()
                this.fileSystemSession = null
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
        if (testcases.length > 0) {
            //The final Core remains readable for registers, memory, Screen and result reporting,
            //but its isolated FileSystem session has been released. It is therefore a Test result,
            //not an interactive Debug session that can be undone and resumed.
            this._buildSources = undefined
            this.state.canExecute = false
            this.state.canUndo = false
        }
        return results
    }

    toggleBreakpoint(line: number, file = this._buildSources?.entry ?? this._sources.entry): void {
        const index = this.state.breakpoints.findIndex(
            (breakpoint) => breakpoint.line === line && breakpoint.file === file
        )
        if (index === -1) this.state.breakpoints.push({ file, line })
        else this.state.breakpoints.splice(index, 1)
    }

    undo(amount?: number): void {
        //Undo is synchronous. An unfinished step/run/input handler still owns the Core.
        if (this.coreOperations > 0 || !this.state.canExecute) return
        try {
            if (!this.getInstance()) return
            const undoCount = Math.max(0, Math.floor(amount ?? 1))
            let undone = 0
            for (; undone < undoCount && this.canUndoStep(); undone++) {
                //the Core owns the instruction boundary, so it rolls back first and the Screen
                //follows it (ADR 0005)
                this._undo()
            }
            //an image that lives in Core memory was restored by the rollback itself, so the Screen
            //re-reads it instead of having journaled it. Once for the whole rollback: the re-read is
            //a whole region and only the state it ends in is shown
            if (undone > 0) this._resyncScreenFromMemory?.()
            const instruction = this._getNextInstruction()
            this.selectInstruction(instruction)
            this.state.canUndo = this.canUndoStep()
            this.state.terminated = this._hasTerminated()
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

    get buildSources() {
        return this._buildSources
    }

    get decorations() {
        return this.state.decorations
    }

    get buildArtifacts() {
        return this.state.buildArtifacts
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

    get currentFile() {
        return this.state.currentFile
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
        try {
            return sourceText(this._sources)
        } catch {
            return ''
        }
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
