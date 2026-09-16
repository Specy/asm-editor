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
    numbersOfSizeToSlice,
    type RegisterFile,
    type RegisterPoke,
    type RegisterSize,
    resolveRegisterFileLayout
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
export const RUNNING_PANEL_REFRESH_MS = 16

/**
 * The same, while a Screen is being animated. Re-reading the panels does not only cost the reads:
 * `pc` moving republishes the editor's pseudo-instruction zones, and Monaco re-measures them.
 * Profiled in the headless shell on `m68k/bouncing-ball.x68`, Monaco's layout queries, the Svelte
 * runtime and the memory grid were together about 60 of the 340 ms/s of main thread the workload
 * used, with nothing in the editor changing.
 *
 * A program drawing on a Screen is one the user is watching the Screen of, and ten updates a second
 * is still live for a register that is being read rather than stepped through. The moment the
 * drawing stops, the activity window closes and the panels go back to a refresh a frame.
 */
export const ANIMATING_PANEL_REFRESH_MS = 250

/** The CPU Register file's id, which is always the first file `createRegisterFiles` builds. */
export const CPU_REGISTER_FILE_ID = 'cpu'

/**
 * The program counter as the languages spell it. It is the one register a Poke never writes
 * ([the design record](../../../docs/design/pokes.md)): moving it is a jump and not a value change,
 * and it is drawn as a row of the CPU file like any other, so it has to be named to be kept out.
 */
const PROGRAM_COUNTER_NAMES = ['pc', 'rip']

function isProgramCounterName(register: string): boolean {
    return PROGRAM_COUNTER_NAMES.includes(register.toLowerCase())
}

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
    /**
     * The reactive twin of `coreOperations`, kept in step with it: the panels bind to `canPoke`,
     * which has to re-evaluate when a Run, Step or input handler takes the Core and again when it
     * gives it back, and a plain field would never tell them.
     */
    private coreBusy = $state(false)
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
            registerFiles: [],
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
        //built before the clear below, because `setRegisters` keeps the CPU file pointed at the
        //register array it rebuilds
        this.state.registerFiles = this.createRegisterFiles()
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
        this.coreBusy = true
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
            this.coreBusy = this.coreOperations > 0
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
            //Re-checked after the round trip as well as before it: a Build may have started and
            //taken the FileSystem in the meantime, and its diagnostics describe the Build snapshot.
            if (checkId !== this.semanticCheckId || this.fileSystemSession) return diagnostics
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

    /**
     * The Register files this Emulator shows, built once: the CPU file, whose `registers` is the
     * very array `state.registers` is, and then one file per declared descriptor with its registers
     * zeroed and its Status flags at 0. The files themselves and their flags live for the whole
     * session; a clear rebuilds a file's Register objects so that nothing is left to highlight,
     * exactly as `setRegisters` rebuilds the CPU ones.
     *
     * A declared file the adapter cannot read is a programming error, not something to show as a
     * panel of zeros, so both read hooks are demanded here rather than missed at the first refresh.
     * This runs from the constructor, before a subclass's field initialisers, so the hooks have to
     * be methods on the adapter and not fields holding arrow functions; the errors say so, because
     * an adapter written the second way looks from the outside as though it implements them.
     */
    private createRegisterFiles(): RegisterFile[] {
        const descriptors = this.getRegisterFileDescriptors()
        if (descriptors.length > 0 && !this._getRegisterFileValues) {
            throw new Error(
                `${this.constructor.name} declares the register files ` +
                    `${descriptors.map((file) => file.id).join(', ')} but does not implement ` +
                    '_getRegisterFileValues as a method (a field holding an arrow function is ' +
                    'still undefined while this constructor runs)'
            )
        }
        const withFlags = descriptors.filter((file) => (file.flagNames?.length ?? 0) > 0)
        if (withFlags.length > 0 && !this._getRegisterFileFlags) {
            throw new Error(
                `${this.constructor.name} declares Status flags on the register files ` +
                    `${withFlags.map((file) => file.id).join(', ')} but does not implement ` +
                    '_getRegisterFileFlags as a method (a field holding an arrow function is ' +
                    'still undefined while this constructor runs)'
            )
        }
        const cpu: RegisterFile = {
            id: CPU_REGISTER_FILE_ID,
            label: 'CPU',
            size: this._systemSize,
            formats: ['hex'],
            layout: this._registerNames.map((name) => ({
                name,
                size: this._systemSize,
                kind: 'integer'
            })),
            hiddenRegisters: this.state.hiddenRegisters,
            registers: this.state.registers,
            flags: [],
            blanks: []
        }
        return [
            cpu,
            ...descriptors.map((descriptor) => {
                const layout = resolveRegisterFileLayout(descriptor)
                return {
                    ...descriptor,
                    layout,
                    registers: layout.map((register) =>
                        makeRegister(register.name, 0n, register.size)
                    ),
                    flags: (descriptor.flagNames ?? []).map((name) => ({
                        name,
                        value: 0,
                        prev: 0
                    })),
                    blanks: layout.map(() => false)
                } satisfies RegisterFile
            })
        ]
    }

    /**
     * Every declared Register file, read back out of the Core beside the CPU registers, whichever
     * tab the panel happens to be showing: a highlight then always means "changed since the last
     * refresh". One `_getRegisterFileValues` call per file (and one `_getRegisterFileFlags` for a
     * file that has flags, one `_getRegisterFileBlanks` when the adapter can blank rows) and nothing
     * allocated besides the arrays the adapter returns.
     *
     * Without a Core there is nothing to read and the files hold the zeros they were built with,
     * which is what the CPU file shows before a Build too.
     */
    private updateRegisterFiles(): void {
        const files = this.state.registerFiles
        if (files.length < 2 || !this.getInstance()) return
        for (let i = 1; i < files.length; i++) {
            const file = files[i]
            const values = this._getRegisterFileValues!(file.id)
            for (let j = 0; j < file.registers.length; j++) {
                file.registers[j].setValue(values[j] ?? 0n)
            }
            if (this._getRegisterFileBlanks) {
                const blanks = this._getRegisterFileBlanks(file.id)
                for (let j = 0; j < file.blanks.length; j++) {
                    file.blanks[j] = blanks[j] === true
                }
            }
            if (file.flags.length === 0) continue
            const flags = this._getRegisterFileFlags!(file.id)
            for (let j = 0; j < file.flags.length; j++) {
                const flag = file.flags[j]
                const read = flags[j]
                const value = read?.value ? 1 : 0
                //a Core that reports no previous value is diffed against the last refresh, which is
                //what the file itself still holds at this point
                flag.prev = read?.prev === undefined ? flag.value : read.prev ? 1 : 0
                flag.value = value
            }
        }
    }

    protected setRegisters(override?: bigint[]) {
        if (!this.getInstance() && !override) {
            override = new Array(this._registerNames.length).fill(0)
        }

        this.state.registers = (override ?? this._getRegisterValues()).map((reg, i) => {
            return makeRegister(this._registerNames[i], reg, this._systemSize)
        })
        const cpu = this.state.registerFiles[0]
        //the CPU file is the register array itself, never a copy of it
        if (cpu) cpu.registers = this.state.registers
        //a caller that rebuilt the CPU registers out of a live Core wants the other files read at
        //the same moment, or the panel shows a refreshed CPU next to stale Register files. A
        //caller that passed its own values did not read the Core at all, and during construction
        //there is no instance to read, which is the case `updateRegisterFiles` guards against.
        if (!override) this.updateRegisterFiles()
    }

    /**
     * Every file other than the CPU one back to zero, with no previous value left to highlight
     * against, as the freshly built CPU registers are. `clear` calls this itself rather than
     * letting `setRegisters` infer it: a caller that seeds the CPU registers with its own values
     * while a Core is live wants the other files left as the last refresh read them, not blanked,
     * and reading them belongs to the refresh paths, which all go through `updateRegisters`, and to
     * the branch of `setRegisters` that reads the Core itself.
     */
    private resetRegisterFiles(): void {
        const files = this.state.registerFiles
        for (let i = 1; i < files.length; i++) {
            const file = files[i]
            file.registers = file.layout.map((register) =>
                makeRegister(register.name, 0n, register.size)
            )
            for (const flag of file.flags) {
                flag.value = 0
                flag.prev = 0
            }
            file.blanks.fill(false)
        }
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
        this.updateRegisterFiles()
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

    setFileSystemHistoryBudgetMb(megabytes: number): void {
        this._emulatorOptions.fileSystemHistoryBudgetMb = megabytes
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
        this.resetRegisterFiles()
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
        //A Build supersedes live checking the same way a newer check supersedes an older one: the
        //debounced check is disarmed and any check already in flight fails its id comparison when
        //it settles, so it cannot overwrite the Build's diagnostics with a separately assembled
        //opinion — or clear the errors that made the Build fail.
        this.semanticCheckId += 1
        this.debouncer[1]()
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
        return this.screenIsAnimating() ? SCREEN_SLICE_MS : COMPUTE_SLICE_MS
    }

    /**
     * Whether a Screen somebody is painting has changed within `SCREEN_ACTIVITY_MS`. Both the slice
     * budget and the panel refresh ask, so the window lives here rather than in either of them; it
     * is advanced by asking, which is why a caller that asks more often than once a slice only makes
     * the window more current.
     */
    private screenIsAnimating(): boolean {
        const screen = this._peripherals.screen
        if (!screen.watched) return false
        const now = performance.now()
        if (screen.version !== this.lastScreenVersion) {
            this.lastScreenVersion = screen.version
            this.screenActiveUntil = now + SCREEN_ACTIVITY_MS
        }
        return now < this.screenActiveUntil
    }

    /**
     * The panels, refreshed from inside a running program — the path an adapter takes when its Core
     * stops on an interrupt. Reading the registers of every Register file, a page of memory per
     * tab, the call stack and the undo history is not free, and none of it can be seen more than
     * once a display frame, so it is rate limited to `RUNNING_PANEL_REFRESH_MS` rather than done
     * per interrupt, and to `ANIMATING_PANEL_REFRESH_MS` while a Screen is being drawn on, where
     * the frames are what the user is watching and the refresh is competing for the thread.
     *
     * `force` is for the interrupts that suspend the program for the user: an input prompt is read
     * beside the panels, and the user has all the time in the world to notice that they are one
     * frame stale. The end of a run and a pause go through `refreshVisibleState` instead, which is
     * never rate limited, so what a stopped program leaves on screen is always current.
     */
    protected refreshRunningPanels(force: boolean): void {
        const now = performance.now()
        const interval = this.screenIsAnimating()
            ? ANIMATING_PANEL_REFRESH_MS
            : RUNNING_PANEL_REFRESH_MS
        if (!force && now - this.lastPanelRefresh < interval) return
        this.lastPanelRefresh = now
        this.updateRegisters()
        this.updateStatusRegisters()
        this.updateMemory()
        this.updateData()
        this.scrollStackTab()
    }

    /**
     * Everything the user inspects, read back out of the Core: the current line, whether Undo is
     * available, and the register (every Register file, not only the visible tab), memory,
     * status-register and program-counter views. The end of a run does this, and so does a pause,
     * which would otherwise leave every panel showing what it held when Run was pressed.
     */
    /**
     * The end of a run that threw: the failing instruction is reported, and the panels are brought
     * up to date. A program that ends on a runtime error is exactly when the registers and memory
     * that caused it are worth looking at, and the Core's history still holds the instructions that
     * ran, so Undo is offered rather than left reading as unavailable. Both are guarded: a Core that
     * just failed may no longer be readable, and that must not replace the error the user needs.
     */
    private reportRuntimeFailure(error: unknown): void {
        console.error(error)
        let instruction: { file: string; lineNumber: number } | null = null
        try {
            //the failing instruction is the last one that was attempted, not the one after it
            instruction = this._getLastInstruction?.() ?? this._getNextInstruction()
        } catch (lookupError) {
            console.error(lookupError)
        }
        const line = instruction?.lineNumber ?? -1
        this.addError(this._stringifyError(error, line >= 0 ? line + 1 : undefined))
        this.state.terminated = true
        this.selectInstruction(instruction)
        try {
            this.state.canUndo = this.canUndoStep()
            this.refreshCoreViews()
        } catch (refreshError) {
            console.error(refreshError)
        }
    }

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
            this.reportRuntimeFailure(e)
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
            this.reportRuntimeFailure(e)
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

    /**
     * Rolls back up to `amount` instructions and returns how many it actually managed. It can be
     * fewer: the Screen or the FileSystem journal may have dropped the inverses for older
     * instructions under its budget, and stopping there is the only way to keep what the panels show
     * consistent with the Files and the image. Callers that asked for a specific number of steps
     * should say so when they get fewer, rather than leave the user looking at a History panel that
     * did not move as far as they clicked.
     */
    undo(amount?: number): number {
        //Undo is synchronous. An unfinished step/run/input handler still owns the Core.
        if (this.coreOperations > 0 || !this.state.canExecute) return 0
        try {
            if (!this.getInstance()) return 0
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
            return undone
        } catch (e) {
            this.addError(this._stringifyError(e))
            this.state.terminated = true
            console.error(e)
            throw e
        }
    }

    /**
     * Whether a Poke is possible right now, which is exactly when a Step is
     * ([the design record](../../../docs/design/pokes.md)): after a Build, after a Step, at a
     * breakpoint or after a Pause, with no Interrupt pending and the program not terminated. A Poke
     * is a synchronous Core operation like Undo, so it is refused too while a Run, Step or input
     * handler owns the Core. The Project's read-only flag is the caller's half of the rule; the
     * Emulator knows nothing about Projects.
     */
    get canPoke(): boolean {
        return (
            this.state.canExecute &&
            !this.state.terminated &&
            this.state.interrupt === undefined &&
            !this.coreBusy
        )
    }

    /**
     * Whether that register of that Register file may be poked. The CPU file offers the registers a
     * Testcase may seed, which is the set its Core has a setter for, minus the hidden ones (MIPS's
     * `$zero`, RISC-V's `zero`) and minus the program counter under any spelling. Another file
     * offers the rows its layout names, except one the last refresh blanked: an empty x87 stack slot
     * holds no value to change.
     */
    canPokeRegister(fileId: string, register: string): boolean {
        if (!this.canPoke) return false
        if (fileId === CPU_REGISTER_FILE_ID) {
            if (isProgramCounterName(register)) return false
            if (!this.state.startingRegisterNames.includes(register)) return false
            return !this.state.hiddenRegisters.includes(register)
        }
        const file = this.state.registerFiles.find((candidate) => candidate.id === fileId)
        if (!file) return false
        const index = file.layout.findIndex((candidate) => candidate.name === register)
        if (index === -1) return false
        return file.blanks[index] !== true
    }

    /**
     * How wide the register at that row is, in bits. The CPU file is asked for the width the
     * register ended up with rather than the one the file declares, because an adapter may narrow a
     * register after the file is built (the Z80's byte wide `a`); every other file has its widths in
     * its layout.
     */
    private pokeRegisterBits(file: RegisterFile, index: number): bigint {
        const narrowed = file.id === CPU_REGISTER_FILE_ID ? file.registers[index]?.size : undefined
        return 8n * BigInt(narrowed ?? file.layout[index].size)
    }

    /**
     * Pokes one or more registers of one Register file as a single step of the Core's Undo history
     * ([ADR 0022](../../../docs/adr/0022-core-native-poke-records.md)), and answers whether the Core
     * recorded one: a history of zero applies the Poke but keeps nothing to undo, as it does for an
     * instruction. Several writes belong in one call when they are one change the user made, which
     * is how a MIPS double reaches its even/odd register pair.
     *
     * Refused, with no transaction opened, when the availability rule does not hold, when there is
     * nothing to write, or when any of the registers may not be poked. A value too wide for its
     * register throws instead of being truncated silently, the way the panels refuse such a commit,
     * and a write that leaves the value as it is drops out, so a Poke that changes nothing records
     * nothing.
     */
    pokeRegisters(fileId: string, writes: RegisterPoke[]): boolean {
        if (!this.canPoke || writes.length === 0 || !this.getInstance()) return false
        const file = this.state.registerFiles.find((candidate) => candidate.id === fileId)
        if (!file) return false
        if (!writes.every((write) => this.canPokeRegister(fileId, write.register))) return false
        if (fileId !== CPU_REGISTER_FILE_ID && !this._setRegisterFileValue) return false
        const pending: { register: string; value: bigint; size: RegisterSize }[] = []
        for (const write of writes) {
            const index = file.layout.findIndex((candidate) => candidate.name === write.register)
            //a register the Core offers as a starting value but the CPU file does not draw has no
            //row to take a width from, so there is nothing to check the value against
            if (index === -1) return false
            const bits = this.pokeRegisterBits(file, index)
            if (write.value < 0n || write.value >> bits !== 0n) {
                throw new Error(
                    `0x${write.value.toString(16)} does not fit ${write.register}, ` +
                        `which is ${bits} bits wide`
                )
            }
            //a write that changes nothing is dropped, with both sides masked to the register's
            //width: MIPS and RISC-V hand their CPU registers back signed, so a register of all
            //ones reads `-1n` in the panel while a poked value is unsigned by contract, and an
            //unmasked comparison would record a `Wrote 0xFFFFFFFF to $t0 (was 0xFFFFFFFF)` step of its own
            const stored = file.registers[index]?.value
            const width = Number(bits)
            if (
                stored !== undefined &&
                BigInt.asUintN(width, stored) === BigInt.asUintN(width, write.value)
            ) {
                continue
            }
            pending.push({
                register: write.register,
                value: write.value,
                size: Number(file.registers[index]?.size ?? file.layout[index].size) as RegisterSize
            })
        }
        if (pending.length === 0) return false
        try {
            let recorded = false
            this._beginPoke()
            try {
                for (const write of pending) {
                    if (fileId === CPU_REGISTER_FILE_ID) {
                        this._setRegisterValue(write.register as R, write.value, write.size)
                    } else {
                        this._setRegisterFileValue!(fileId, write.register, write.value)
                    }
                }
            } finally {
                //the transaction is closed even when a setter threw, or the Core goes on journaling
                //into an entry nothing will ever end, and the panels are refreshed either way: a
                //setter that threw leaves whatever the writes before it changed, which the Core
                //recorded and the next Undo would revert
                recorded = this._endPoke()
                this.refreshAfterPoke()
            }
            return recorded
        } catch (e) {
            this.addError(this._stringifyError(e))
            console.error(e)
            throw e
        }
    }

    /**
     * Pokes a run of memory bytes, which is one step of the history however many bytes it holds.
     * Refused by the same availability rule as `pokeRegisters`, and dropped when the bytes are
     * already what memory holds.
     */
    pokeMemory(address: bigint, bytes: Uint8Array): boolean {
        if (!this.canPoke || bytes.length === 0 || !this.getInstance()) return false
        try {
            if (isMemoryChunkEqual(this._readMemoryBytes(address, BigInt(bytes.length)), bytes)) {
                return false
            }
            let recorded = false
            this._beginPoke()
            try {
                this._writeMemoryBytes(address, bytes)
            } finally {
                recorded = this._endPoke()
                //an image that lives in Core memory is re-read rather than journaled, exactly as
                //after an Undo ([ADR 0005](../../../docs/adr/0005-restore-screen-state-on-undo.md),
                //[ADR 0020](../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)),
                //and a write that threw part way through is shown rather than left hidden
                this._resyncScreenFromMemory?.()
                this.refreshAfterPoke()
            }
            return recorded
        } catch (e) {
            this.addError(this._stringifyError(e))
            console.error(e)
            throw e
        }
    }

    /**
     * What a Poke leaves the panels showing: the refresh an Undo ends with, without the current
     * line, which a Poke never moves because no instruction ran.
     */
    private refreshAfterPoke(): void {
        this.state.canUndo = this.canUndoStep()
        this.refreshCoreViews()
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

    /** The Entry path of the sources currently set, which a single-source host never names itself. */
    get entry() {
        return this._sources.entry
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

    /** Every Register file, the CPU one first; see `createRegisterFiles`. */
    get registerFiles() {
        return this.state.registerFiles
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
