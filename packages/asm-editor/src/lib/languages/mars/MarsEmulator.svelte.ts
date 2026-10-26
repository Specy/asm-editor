import type {
    CompileResult,
    EmulatorConfig,
    Instruction
} from '#lib/languages/BaseEmulator.svelte.ts'
import {
    type BuildArtifact,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    isLineBreakpoint,
    makeLabelColor,
    type MemoryLayoutItem,
    type MutationOperation,
    type PokeWrite,
    type RegisterSize,
    type SourceBreakpoint,
    type StackFrame
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { GenericEmulator } from '#lib/languages/GenericEmulator.svelte.ts'
import type { ExecutionSlice, ExecutionSliceRequest } from '#lib/languages/ExecutionSlice.ts'
import { languageDiagnosticToDiagnostic } from '#lib/languages/service/diagnosticBridge.ts'
import type { Termination } from '#lib/languages/termination.ts'
import { programArgv0 } from '#lib/commandLine.ts'
import type { BuildInput, BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import { loadedRuntimeLibrary } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { argvArgumentsArea, memoryLayoutFromItems, textSegmentsReadOnly } from '../memoryRegions'
import {
    checkMarsProgram,
    marsRuntimeLink,
    prepareMarsRuntime,
    type MarsCheckCore,
    type MarsCoreFactory,
    type MarsTarget
} from './marsCheck'
import { MarsDevices, type MarsCore } from './MarsDevices'
import {
    normalizeMarsDisplay,
    type MarsDisplayConfiguration,
    type MarsDisplayOrigin,
    type ProjectDisplay
} from './marsDisplay'
import {
    MarsHandlers,
    marsRuntimeErrorMessage,
    type MarsHandlerMap,
    type MarsRuntimeError
} from './marsHandlers'
import { MarsSlicePacer } from './marsSlice'
import { canUndoMarsHistoryRange } from './marsUndo'

/**
 * The Emulator of both MARS-derived Targets, MIPS on MARS and RISC-V on RARS, whose Cores are the
 * same machine with another instruction set: the same assembly, devices, services, undo history
 * and run calls. A subclass adds its registers, how its back steps read, and its Core package's
 * functions (`MarsDialect`); the Core is typed structurally, as `MarsCore` is, so neither package is
 * imported here.
 */

/** A statement of the assembled program, as both Cores describe it. */
type MarsStatement = {
    readonly sourcePath: string
    /** One-based line in `sourcePath`. */
    readonly sourceLine: number
    readonly address: number
    readonly binaryStatement: number
    readonly source: string
    readonly assemblyStatement: string
}

/**
 * One value a Poke wrote. A register's sides are a signed 32 bit int on MARS and a signed decimal
 * string of the whole 64 bit value on RARS, whatever the target.
 */
type MarsPokeWrite =
    | {
          readonly type: 'memory'
          readonly address: number
          readonly old: readonly number[]
          readonly new: readonly number[]
      }
    | {
          readonly type: 'register'
          readonly name: string
          readonly old: number | string
          readonly new: number | string
      }

/** One entry of the Core's undo history: an instruction with the back steps it pushed, or a Poke. */
type MarsUndoGroup<S> =
    | {
          readonly serial: string
          readonly kind: 'instruction'
          readonly pc: number
          readonly steps: readonly S[]
      }
    | { readonly serial: string; readonly kind: 'poke'; readonly writes: readonly MarsPokeWrite[] }

/**
 * The part of a MARS or RARS Core this class drives, where `S` is the Core's own back step, which
 * each subclass reads. A run call's stop reason is a number here, which `MarsDialect.stopReasons`
 * names.
 */
type MarsEmulatorCore<S> = MarsCore &
    MarsCheckCore & {
        readonly terminated: boolean
        readonly exitCode: number
        readonly canUndo: boolean
        initialize(startAtMain: boolean): void
        setUndoSize(size: number): void
        setUndoEnabled(enabled: boolean): void
        setProgramArguments(argv: string[]): void
        getProgramArgumentsLayout(): ArrayLike<number>
        step(): Promise<number>
        simulateWithLimit(limit: number): Promise<number>
        simulateWithBreakpointsAndLimit(breakpoints: number[], limit: number): Promise<number>
        getStopReason(): number
        getLastRunInstructionCount(): number
        getInstructionsExecuted(): number
        pause(): void
        undo(): void
        getCurrentInstructionSerial(): string | null
        getUndoGroupsUpTo(max: number): readonly MarsUndoGroup<S>[]
        getUndoGroupsRange(skip: number, max: number): readonly MarsUndoGroup<S>[]
        getUndoDepth(): number
        beginPoke(): void
        endPoke(): boolean
        setMemoryBytes(address: number, bytes: number[]): void
        getStatementAtAddress(address: number): MarsStatement
        getStatementsAtSourceLocation(sourcePath: string, sourceLine: number): MarsStatement[]
        getNextStatement(): MarsStatement | null
        getCompiledStatements(): MarsStatement[]
        getCallStack(): { readonly pc: number; readonly toAddress: number; readonly sp: number }[]
        getLabelAtAddress(address: number): string | null
        getLayoutItems(): ArrayLike<number>
        getSectionNames(): string[]
        getSymbolNames(): string[]
        getSymbolFiles(): string[]
        getSymbolValues(): ArrayLike<number>
        getTextSegments(): ArrayLike<number>
        getHeapStart(): number
        getHeapBreak(): number
        getStackTop(): number
    }

/**
 * What a subclass hands over of its Core package: its measured pace and its free functions, which
 * the base only calls once constructed.
 */
type MarsDialect<C> = {
    /**
     * How many instructions the Core runs in a millisecond, used to turn a slice's time budget into
     * a halt limit.
     */
    instructionsPerMs: number
    /** How much wall time one `simulate*` call aims at (`marsSlice.ts`). */
    chunkTargetMs: number
    makeCore: MarsCoreFactory<C>
    /** Refuses Arguments the Core could not store above the stack: too many, too long. */
    checkProgramArguments(argv: string[], target: MarsTarget): void
    /**
     * The package's own, a property so the shared handler map is checked against its Core's (a
     * method's parameters would be compared both ways).
     */
    registerHandlers: (core: C, handlers: MarsHandlerMap) => void
    isRuntimeError: (error: unknown) => error is MarsRuntimeError
    /** The package's `StopReason`, whose members both Cores number alike. */
    stopReasons: {
        readonly BREAKPOINT: number
        readonly NORMAL_TERMINATION: number
        readonly CLIFF_TERMINATION: number
        readonly PAUSE: number
    }
    /** An assembled statement as an expansion decoration shows it, its registers named. */
    formatStatement(statement: string): string
}

export abstract class MarsEmulator<
    C extends MarsEmulatorCore<S>,
    S,
    R extends string
> extends GenericEmulator<C, R> {
    protected core: C | null = null
    private readonly dialect: MarsDialect<C>
    /**
     * The bitmap display, the keyboard-and-display registers and the Synth, the MARS tools (and
     * RARS's ports of them) this editor offers as devices the Core memory is observed through.
     * Built once and pointed at each freshly assembled Core, because the peripherals it drives live
     * as long as the Emulator does.
     */
    private readonly devices: MarsDevices
    /**
     * The syscall and ecall handlers (`marsHandlers.ts`). Built once like the devices and
     * registered on each freshly assembled Core.
     */
    private readonly handlers: MarsHandlers
    /** The chunking of a slice, which is what keeps it near its deadline (`marsSlice.ts`). */
    private readonly pacer: MarsSlicePacer
    /** The five display parameters, from the project and changed from the Screen panel. */
    private display: ProjectDisplay
    /** Whether the last Build read them out of a `@screen` comment instead. */
    private displayOrigin: MarsDisplayOrigin = 'user'
    /** The label such a directive named for its base address, for the Screen panel to show. */
    private displayBaseLabel: string | undefined
    /**
     * Where the last Core call failed, from its `RuntimeError`: the Core has moved its program
     * counter past the instruction by then, so neither the next statement nor the history names
     * it. Null while the program has not failed since the last call, Undo or Build.
     */
    private failedAt: number | null = null
    /** Whether this Build keeps an Undo history at all, which `_setUndoRecording` resumes into. */
    private undoEnabled = false
    /** Whether a slice is running the Core, which is when a sleep ends the call (`pauseAtSleep`). */
    private slicing = false
    /** The `argv` the next Core stores at every start, `argv[0]` included (`_setProgramArguments`). */
    private programArgv: string[] = []

    constructor(
        source: BuildInput,
        config: EmulatorConfig<R>,
        options: EmulatorSettings,
        dialect: MarsDialect<C>
    ) {
        super(
            source,
            { ...config, endianness: 'little' },
            {
                ...options,
                baseAddress: options.baseAddress ?? 0x10010000n,
                stackAddress: options.stackAddress ?? 0x7ffffffcn,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        this.dialect = dialect
        this.pacer = new MarsSlicePacer(dialect.chunkTargetMs)
        this.display = normalizeMarsDisplay(options.display)
        this.devices = new MarsDevices({
            screen: this._peripherals.screen,
            keyboard: this._peripherals.keyboard,
            terminal: this._peripherals.terminal,
            audio: () => this._peripherals.audio
        })
        this.devices.setDisplay(this.display)
        this.handlers = new MarsHandlers({
            peripherals: this._peripherals,
            executionController: this.executionController,
            devices: this.devices,
            //`clear()` replaces `state`, so each call looks it up instead of capturing it
            setInterrupt: (interrupt) => {
                this.state.interrupt = interrupt
                //MARS and RARS advance PC before invoking the service's asynchronous handler.
                if (interrupt) this.refreshInputState(this._getInstructionAt(this._getPc() - 4n))
            },
            pauseAtSleep: () => {
                if (this.slicing) this.core?.pause()
            },
            fileSystem: () => this.fileSystemSession,
            instructionSerial: () => this.requireCore().getCurrentInstructionSerial()
        })
    }

    /**
     * The Target this Emulator's Cores assemble for, and whose Runtime library a Build links. A
     * getter and not a field, as the two hooks below are methods: the base constructor already runs
     * `_prepareBuild` (through `semanticCheck()`), before any field initializer of this class or a
     * subclass would.
     */
    protected abstract get target(): MarsTarget

    /** One back step as a mutation of its instruction's row, or none for the Core's bookkeeping. */
    protected abstract backstepToMutation(step: S): MutationOperation | null

    /** How wide the panels read a register a Poke wrote, by the file its name belongs to. */
    protected abstract pokeRegisterSize(register: string): RegisterSize

    /**
     * The Screen panel's configuration popover, applied at once and with a re-sync from memory, as
     * the MARS tool does. The caller stores the same value in the project so it comes back with it.
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

    protected getInstance(): C | null {
        return this.core ?? null
    }

    protected positionStackTabOnCompile(): void {
        //legacy parity: the Stack tab shows the page *below* SP, which is the region the stack
        //actually grows into. Running scrollStackTab() here would snap the tab onto the page
        //containing SP (0x7ffffffc is not page aligned) and show unwritten memory above the stack.
        const stackTab = this.state.memory.tabs.find((e) => e.name === 'Stack')
        if (stackTab && !stackTab.userPlaced) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
    }

    _canUndo(): boolean {
        const core = this.core
        if (!core?.canUndo) return false
        const group = core.getUndoGroupsUpTo(1)[0]
        //a Poke belongs to no instruction, so the FileSystem session, whose frames are keyed by an
        //instruction serial, has nothing to say about undoing one
        //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        if (!group || group.kind === 'poke') return true
        return this.fileSystemSession?.canUndoAfter(group.serial) ?? true
    }

    /** The Core groups its history by instruction or Poke, so the group count is the depth. */
    _undoDepth(): number {
        return this.core?.getUndoDepth() ?? 0
    }

    /**
     * The Core's count of every instruction it has executed, one Undo entry each, the one a failed
     * Step or slice stopped on included: what lets `GenericEmulator` record a call that threw, where
     * the pacer's per-chunk counts are lost with the rejection.
     */
    _getInstructionsExecuted(): bigint {
        return BigInt(this.core?.getInstructionsExecuted() ?? 0)
    }

    _canUndoSteps(count: number): boolean {
        return this._canUndoHistoryRange(0, count)
    }

    _canUndoHistoryRange(skip: number, count: number): boolean {
        return canUndoMarsHistoryRange(this.core, this.fileSystemSession, skip, count)
    }

    _setUndoRecording(recording: boolean): void {
        this.core?.setUndoEnabled(recording && this.undoEnabled)
    }

    /**
     * Opens the Core's Poke transaction: its register setters, those of the Register files
     * included, and `setMemoryBytes` journal into it instead of writing straight through, and
     * `endPoke` records the lot as one entry of the undo history
     * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)).
     */
    _beginPoke(): void {
        this.requireCore().beginPoke()
    }

    _endPoke(): boolean {
        return this.requireCore().endPoke()
    }

    /**
     * `argv[0]` as a shell would start the program, `./main` for `main.s` or `main.c`, and the
     * Arguments after it, which the Core stores above the stack at every start, with argc and argv
     * in the first two argument registers, pointers as wide as the Target's
     * ([ADR 0046](../../../../../../docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)).
     * Checked here, so the Core's refusal (too many, too long) stops the Build as an Arguments
     * problem; the Core `_compile` creates gets them.
     */
    _setProgramArguments(sources: BuildSources, args: string[]): void {
        const argv = [programArgv0(sources.entry, false, sources.entrySource), ...args]
        this.dialect.checkProgramArguments(argv, this.target)
        this.programArgv = argv
    }

    /**
     * Loads the Runtime library a Build links, and the list of library functions that explains an
     * undefined `printf` in a Build that does not link it, before any Core is created. An ABI this
     * editor does not ship stops the Build here, before its Arguments are read.
     */
    async _prepareBuild(sources: BuildSources): Promise<void> {
        await prepareMarsRuntime(sources, this.target)
        marsRuntimeLink(sources, this.target)
    }

    /**
     * What a Build would report, so the squiggle on a `@screen` line is there while it is being
     * typed and does not vanish half a second after a Build replaces this list.
     */
    _checkCode(sources: BuildSources): Diagnostic[] {
        return this.checkProgram(sources).diagnostics
    }

    _compile(sources: BuildSources, undoSize: number): CompileResult {
        this.core = null
        //the display is read before the first instruction, so it and a Testcase alike run on the
        //display the source asked for
        const { core, report, screen, diagnostics } = this.checkProgram(sources, (core) => {
            //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize`
            //stored, so the size has to be set *before* assembling: setting it afterwards would
            //only size the next compile's buffer (legacy ordering was setUndoSize -> assemble ->
            //setUndoEnabled). Never 0: a zero length buffer makes the Core throw on the first
            //instruction, and no history at all is `setUndoEnabled(false)` in `_initialize`
            core.setUndoSize(Math.max(1, undoSize))
            //stored by every `initialize`, a Testcase's included, before its starting registers
            core.setProgramArguments(this.programArgv)
        })
        this.display = screen.display
        this.displayOrigin = screen.origin
        this.displayBaseLabel = screen.baseLabel
        //the build path, not `setDisplay`: the Core the devices still hold is the *previous* one, so
        //a re-sync here would repaint the Screen `clear()` has just blanked with the program's
        //memory — and a build that then fails never reaches `_initialize` to put it right again
        this.devices.resetScreen(this.display)
        //`hasErrors` only means "the collection is non-empty", and warnings share that collection,
        //so a warnings-only program would be rejected despite having assembled fine
        if (diagnostics.some((d) => d.severity === 'error')) {
            return { ok: false, diagnostics, report }
        }
        this.core = core
        return { ok: true, diagnostics, libraryFiles: this.libraryFiles(sources, core) }
    }

    /**
     * The program checked as the analysis Worker checks it (`marsCheck.ts`), on top of the display
     * the Screen has now; `prepare` readies a Build's Core to run. `normalizeMarsDisplay` there also
     * covers the semantic check the base constructor starts before this class's fields exist.
     */
    private checkProgram(sources: BuildSources, prepare?: (core: C) => void) {
        const check = checkMarsProgram(sources, this.target, {
            makeCore: this.dialect.makeCore,
            display: this.display,
            prepare
        })
        return {
            ...check,
            diagnostics: check.diagnostics.map(languageDiagnosticToDiagnostic)
        }
    }

    /**
     * The members of the library the Build linked, in the order the Core placed them: read-only
     * Files the debugger and the Explorer show. The rest of the library stays reachable through go
     * to definition.
     */
    private libraryFiles(sources: BuildSources, core: C): ProjectFiles | undefined {
        if (sources.runtimeAbi === undefined) return undefined
        const library = loadedRuntimeLibrary(sources.runtimeAbi, this.target)
        if (!library) return undefined
        //a member's every statement names it, and a key keeps the place of its first entry
        return Object.freeze(
            Object.fromEntries(
                core
                    .getCompiledStatements()
                    .map((statement) => statement.sourcePath)
                    .filter((path) => Object.prototype.hasOwnProperty.call(library.members, path))
                    .map((path) => [
                        path,
                        { encoding: 'plain' as const, content: library.members[path] }
                    ])
            )
        )
    }

    _initialize(undoSize: number): void {
        const core = this.requireCore()
        //the stack was already sized in `_compile`, `assemble()` engages the backstepper
        //unconditionally so this is what actually turns undo off when history is disabled
        this.undoEnabled = undoSize > 0
        core.setUndoEnabled(this.undoEnabled)
        //a new run: not exited, exit code 0, and the random generators forgotten
        core.initialize(true)
        this.failedAt = null
        this.pacer.reset()
        this.dialect.registerHandlers(core, this.handlers.makeHandlerMap())
        //after `initialize`, so the observers see the program's writes and not the loading of `.data`
        this.devices.attach(core, this.display)
        //what an instruction does to the Terminal, a handler's or a device's, is journaled under the
        //serial its Undo group carries ([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md))
        const instruction = () => {
            const serial = core.getCurrentInstructionSerial()
            return serial === null ? null : BigInt(serial)
        }
        this._peripherals.terminal.trackHistory(instruction, undoSize)
        //and so are the Notes it plays
        //([ADR 0059](../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md))
        this._peripherals.audio.track(instruction, undoSize)
    }

    _dispose(): void {
        this.devices.dispose()
        this.core = null
    }

    /**
     * Build, Stop and dispose reset the Screen to the language default, but the bitmap display's
     * geometry belongs to the user rather than to a program, so it comes straight back — blank,
     * because the picture is memory that the next build clears.
     *
     * Guarded: the base constructor clears before this class's fields exist.
     */
    clear(): void {
        super.clear()
        this.devices?.resetScreen(this.display)
    }

    /** Framebuffer mode journals nothing, so Undo restores the image from the rolled-back memory. */
    _resyncScreenFromMemory(): void {
        this.devices.resync()
    }

    _getCallStack(): StackFrame[] {
        const core = this.core
        if (!core) return []
        return core.getCallStack().map((frame, i) => {
            const address = frame.toAddress
            const statement = this.statementAtAddress(address)
            return {
                address: BigInt(address),
                destination: BigInt(frame.pc),
                sp: BigInt(frame.sp),
                name:
                    core.getLabelAtAddress(address) ?? `0x${address.toString(16).padStart(8, '0')}`,
                line: statement ? statement.sourceLine - 1 : -1,
                file: statement?.sourcePath,
                color: makeLabelColor(i, frame.sp)
            }
        })
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const core = this.core
        if (!core) return { decorations: [], code: '' }
        const { formatStatement } = this.dialect
        const fence = this.target === 'MIPS' ? 'mips' : 'riscv'
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<string, MarsStatement[]>()
        for (const statement of core.getCompiledStatements()) {
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
                md: `\`\`\`${fence}\n${lines.join('\n')}\n\`\`\``,
                //the same indented text the Markdown form uses, so an expansion lines up with the
                //source instruction it came from rather than starting at the Editor's left edge
                instructions: statements.map((statement, index) => ({
                    address: BigInt(statement.address),
                    code: lines[index] ?? formatStatement(statement.assemblyStatement)
                }))
            })
        }
        //there is no generated code panel, only the per-line expansion decorations
        return { decorations, code: '' }
    }

    protected _getBuildArtifacts(): BuildArtifact[] {
        return (this.core?.getCompiledStatements() ?? []).map((statement) => ({
            file: statement.sourcePath,
            line: statement.sourceLine - 1,
            address: BigInt(statement.address >>> 0),
            opcode: (statement.binaryStatement >>> 0).toString(16).padStart(8, '0')
        }))
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        //neither instruction set has status flags, the UI hides the whole section when this is empty
        return []
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.statementAtAddress(Number(address)))
    }

    /** None once the program has ended, even where an exit left it on a statement. */
    _getNextInstruction(): Instruction | null {
        return toInstruction(this.core?.getNextStatement())
    }

    /**
     * The instruction a failed Core call stopped on, which its `RuntimeError` named. Otherwise none,
     * and the newest entry of the history is the last instruction that ran.
     */
    _getLastInstruction(): Instruction | null {
        return this.failedAt === null ? null : toInstruction(this.statementAtAddress(this.failedAt))
    }

    _getMemoryLayout() {
        const core = this.core!
        const names = core.getSectionNames()
        const values = core.getLayoutItems()
        const items: MemoryLayoutItem[] = []
        for (let i = 0; i < values.length; i += 5)
            items.push({
                start: BigInt(values[i] >>> 0),
                length: BigInt(values[i + 1] >>> 0),
                kind: (['code', 'data', 'reserved'] as const)[values[i + 2]],
                section: names[values[i + 3]],
                alignment: BigInt(values[i + 4] >>> 0)
            })
        const symbols = core.getSymbolValues()
        const files = core.getSymbolFiles()
        const labels = core.getSymbolNames().flatMap((name, i) =>
            symbols[i * 3 + 1]
                ? [
                      {
                          name,
                          address: BigInt(symbols[i * 3] >>> 0),
                          fromLibrary: !!symbols[i * 3 + 2],
                          file: files[i]
                      }
                  ]
                : []
        )
        return {
            ...memoryLayoutFromItems(items, labels),
            readOnly: textSegmentsReadOnly(core.getTextSegments())
        }
    }
    _getHeapBounds() {
        const core = this.core
        return core
            ? { start: BigInt(core.getHeapStart() >>> 0), end: BigInt(core.getHeapBreak() >>> 0) }
            : undefined
    }
    _getStackTop() {
        return BigInt((this.core?.getStackTop() ?? 0) >>> 0)
    }
    /** The argv the Core stored above the stack at its last initialize ([ADR 0046](../../../../../../docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)). */
    _getArgumentsArea() {
        return argvArgumentsArea(this.core?.getProgramArgumentsLayout())
    }
    _getDeviceRegions() {
        return this.devices.regions()
    }
    _resolveMemoryLabel(name: string) {
        const address = this.core?.getAddressOfLabel(name)
        return address === undefined || address === -1 ? undefined : BigInt(address >>> 0)
    }

    /**
     * The history as `undo()` pops it: one entry per executed instruction or Poke, rather than the
     * one row per back step the panel used to show, where an instruction that wrote two values was
     * two rows and "Undo to here" on row N undid N instructions
     * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)). RARS folds the
     * counter entry every instruction pushes into the instruction's own group, so nothing has to be
     * skipped before the `max` cut.
     */
    _getUndoHistory(max: number): ExecutionStep[] {
        return this._getUndoHistoryRange(0, max)
    }

    _getUndoHistoryRange(skip: number, max: number): ExecutionStep[] {
        const core = this.core
        if (!core) return []
        return core
            .getUndoGroupsRange(skip, max)
            .map((group) =>
                group.kind === 'poke'
                    ? this.pokeGroupToStep(group.writes)
                    : this.instructionGroupToStep(group.pc, group.steps)
            )
    }

    /**
     * One executed instruction, with every value it overwrote as a mutation of the same row. What
     * the Core keeps for itself drops out (`backstepToMutation`), and an instruction that wrote
     * nothing else is a row with no mutations, which is still the row "Undo to here" has to count.
     */
    private instructionGroupToStep(pc: number, steps: readonly S[]): ExecutionStep {
        const statement = this.statementAtAddress(pc)
        return {
            kind: 'instruction',
            pc,
            //neither has a condition code register, the UI reads these only for M68K
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            line: statement ? statement.sourceLine - 1 : -1,
            file: statement?.sourcePath,
            //the Core reports the back steps newest first, which is the order they are undone in;
            //a row reads as what the instruction did, so it lists them in the order they happened
            mutations: [...steps]
                .reverse()
                .map((step) => this.backstepToMutation(step))
                .filter((mutation) => mutation !== null)
        }
    }

    /**
     * One Poke: everything a single `beginPoke`/`endPoke` transaction wrote, as one row of the
     * History panel ([the design record](../../../../../../docs/design/pokes.md)). No instruction ran,
     * so it carries no PC and no source line, and its mutations are the values it overwrote, which
     * is what the panel diffs a poked cell against.
     */
    private pokeGroupToStep(pokeWrites: readonly MarsPokeWrite[]): ExecutionStep {
        const writes = pokeWrites.map((write) => this.pokeWrite(write))
        return {
            kind: 'poke',
            pc: -1,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            line: -1,
            file: undefined,
            writes,
            mutations: writes.map((write) => this.pokeWriteToMutation(write))
        }
    }

    /**
     * One value a Poke wrote, in the panels' reading: unsigned bit patterns as wide as
     * `pokeRegisterSize` reads the register, and the Core's own register spellings, which are the
     * ones the Register files list.
     */
    private pokeWrite(write: MarsPokeWrite): PokeWrite {
        if (write.type === 'memory') {
            return {
                type: 'memory',
                address: BigInt(write.address >>> 0),
                old: [...write.old],
                new: [...write.new]
            }
        }
        const bits = 8 * Number(this.pokeRegisterSize(write.name))
        return {
            type: 'register',
            name: write.name,
            old: BigInt.asUintN(bits, BigInt(write.old)),
            new: BigInt.asUintN(bits, BigInt(write.new))
        }
    }

    private pokeWriteToMutation(write: PokeWrite): MutationOperation {
        if (write.type === 'memory') {
            return {
                type: 'WriteMemoryBytes',
                value: { address: write.address, old: write.old, new: write.new }
            }
        }
        return {
            type: 'WriteRegister',
            value: {
                register: write.name,
                old: write.old,
                new: write.new,
                size: this.pokeRegisterSize(write.name)
            }
        }
    }

    /**
     * Whether an exit service has run or the program has run off the end of its code, which the
     * Core reads from the program's state, so that it is right after Undo too. A runtime failure
     * does not end the program here: `GenericEmulator` keeps that from the rejection.
     */
    _hasTerminated(): boolean {
        return this.core?.terminated ?? false
    }

    /**
     * How the program ended: exit (10) with code 0 or exit2 (17 on MARS, 93 on RARS) with the
     * first argument register, which the Log shows although neither GUI does, or running off the
     * end of the code. Both leave `terminated` set, and the stop reason of the call that ended the
     * program tells them apart.
     */
    _getTermination(): Termination | undefined {
        const core = this.core
        if (!core?.terminated) return undefined
        return core.getStopReason() === this.dialect.stopReasons.NORMAL_TERMINATION
            ? { kind: 'exit', code: core.exitCode }
            : { kind: 'end' }
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        return new Uint8Array(this.requireCore().readMemoryBytes(Number(address), Number(length)))
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireCore().setMemoryBytes(Number(address), Array.from(data))
    }

    /**
     * One instruction. The step that runs an exit, or the program's last instruction, says so in its
     * stop reason, and an exited program runs nothing more until Undo.
     */
    async _step(): Promise<{ terminated: boolean }> {
        const core = this.requireCore()
        this.handlers.beginExecution()
        const stop = await this.coreCall(() => core.step())
        return { terminated: this.endsProgram(stop) }
    }

    /** A `RuntimeError` in MARS's or RARS's words and at the line it names; anything else as it says. */
    _stringifyError(error: unknown): string {
        if (this.dialect.isRuntimeError(error)) return marsRuntimeErrorMessage(error)
        return super._stringifyError(error)
    }

    _undo(): void {
        const core = this.requireCore()
        const group = core.getUndoGroupsUpTo(1)[0]
        //the FileSystem session and the Terminal key their records by the instruction serial, and a
        //Poke has no instruction identity to undo their changes by, so it is rolled back by the Core
        //alone ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        const serial = group?.kind === 'instruction' ? group.serial : undefined
        if (serial !== undefined && !(this.fileSystemSession?.canUndoAfter(serial) ?? true)) {
            throw new Error('FileSystem Undo history exhausted')
        }
        //an exit and a failure were the newest things the program did, so they are the first
        //undone: the Core puts the exit back itself
        this.devices.rewind(() => core.undo())
        this.failedAt = null
        const readSynth = () => this.devices.readSynthBlock()
        if (serial === undefined) return this._peripherals.audio.resyncSynth(readSynth)
        this.fileSystemSession?.undoAfter(serial)
        this._peripherals.terminal.undoAfter(BigInt(serial) - 1n)
        this._peripherals.audio.undoAfter(BigInt(serial) - 1n, readSynth)
    }

    /**
     * Core calls that run the program, a step, a slice or a Testcase, which bring the bitmap
     * display up to date however they end and remember where a failure stopped them.
     */
    private async coreCall<T>(run: () => Promise<T>): Promise<T> {
        this.failedAt = null
        try {
            return await run()
        } catch (error) {
            if (this.dialect.isRuntimeError(error)) this.failedAt = error.address
            throw error
        } finally {
            this.devices.flush()
        }
    }

    /**
     * The Core stops for input by leaving the pending `simulate*` promise unsettled, and serves a
     * `sleep` the same way. A read is served inside the slice; a sleep ends it, through the handler's
     * `pauseAtSleep`, so the slice ends where the program's frame does and the next one starts on a
     * fresh frame. The budget is spent in chunks by the pacer, which keeps a slice near its deadline
     * (`marsSlice.ts`), and every chunk is charged what the Core says it executed.
     *
     * The bitmap display catches up once per slice rather than once per stored word, which is what
     * keeps the observer cheap; a program that sleeps or waits for input flushes from the handler
     * too.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const core = this.requireCore()
        //an exited program runs nothing more, which the Core would only say again
        if (core.terminated) return { reason: 'terminated', instructions: 0 }
        const breakpoints = calculateBreakpoints(core, request.breakpoints)
        const { stopReasons } = this.dialect
        this.handlers.beginExecution()
        this.slicing = true
        try {
            return await this.coreCall(() =>
                this.pacer.run(request, this.dialect.instructionsPerMs, async (limit) => {
                    const stop = await core.simulateWithBreakpointsAndLimit(breakpoints, limit)
                    const instructions = core.getLastRunInstructionCount()
                    if (this.endsProgram(stop)) return { outcome: 'terminated', instructions }
                    if (stop === stopReasons.BREAKPOINT)
                        return { outcome: 'breakpoint', instructions }
                    return { outcome: stop === stopReasons.PAUSE ? 'paused' : 'ran', instructions }
                })
            )
        } finally {
            this.slicing = false
        }
    }

    async _runTestcase(haltLimit: number): Promise<void> {
        const core = this.requireCore()
        this.handlers.beginExecution()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller;
        //how the run ended is read from the Core afterwards
        await this.coreCall(() => core.simulateWithLimit(haltLimit))
    }

    /**
     * Whether a run call's stop reason ends the program: an exit service ran (`NORMAL_TERMINATION`),
     * or the call ran the program's last instruction (`CLIFF_TERMINATION`). A breakpoint (or an
     * `ebreak`), the halt limit, which a single step ends on, and a pause leave it runnable, and a
     * runtime failure rejects the call instead.
     */
    private endsProgram(stop: number): boolean {
        const { stopReasons } = this.dialect
        return stop === stopReasons.NORMAL_TERMINATION || stop === stopReasons.CLIFF_TERMINATION
    }

    private statementAtAddress(address: number): MarsStatement | null {
        try {
            //the Core throws (instead of returning null) when no statement lives at the address
            return this.core?.getStatementAtAddress(address) ?? null
        } catch {
            return null
        }
    }

    protected requireCore(): C {
        if (!this.core) throw new Error('Interpreter not initialized')
        return this.core
    }
}

/**
 * One source line can assemble to several machine statements — a pseudo-instruction like `la`, or a
 * macro invocation — and every one of them reports that line. Breaking on all of them stopped the
 * run once per generated instruction, so a single visible breakpoint took several Runs to clear.
 * Only the first address of the expansion is a breakpoint: it is where the line is entered.
 */
function calculateBreakpoints(
    core: MarsEmulatorCore<unknown>,
    breakpoints: SourceBreakpoint[]
): number[] {
    return breakpoints.filter(isLineBreakpoint).flatMap((breakpoint) => {
        const statements = core.getStatementsAtSourceLocation(breakpoint.file, breakpoint.line + 1)
        const entry = statements.reduce<number | undefined>(
            (lowest, statement) =>
                lowest === undefined || statement.address < lowest ? statement.address : lowest,
            undefined
        )
        return entry === undefined ? [] : [entry]
    })
}

function toInstruction(statement: MarsStatement | null | undefined): Instruction | null {
    if (!statement) return null
    return {
        address: BigInt(statement.address),
        lineNumber: statement.sourceLine - 1,
        file: statement.sourcePath,
        code: statement.source
    }
}
