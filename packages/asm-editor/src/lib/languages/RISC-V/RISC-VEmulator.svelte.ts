import { argvArgumentsArea, memoryLayoutFromItems, textSegmentsReadOnly } from '../memoryRegions'
import { makeRiscVCore, type RiscVLink } from './RISC-V-core'
import {
    coreLibrary,
    loadedRuntimeFunctions,
    loadedRuntimeLibrary,
    loadRuntimeFunctions,
    loadRuntimeLibrary,
    runtimeLibraryHint
} from '#lib/sourceRuntime/runtimeLibrary.ts'
import { CURRENT_RUNTIME_ABI, unsupportedRuntimeAbi } from '#lib/runtimeAbi.ts'
import {
    BackStepAction,
    bigintToHighLow,
    highLowToBigint,
    isRuntimeError,
    type JsBackStep,
    type JsInstructionUndoGroup,
    type JsPokeUndoGroup,
    type JsPokeWrite,
    type JsProgramStatement,
    type JsRiscV,
    registerHandlers,
    type RegisterName,
    RISCV,
    RISCV_REGISTERS,
    type RISCVAssembleError,
    type RiscvTokenizedLine,
    StopReason
} from '@specy/risc-v'
import { type CompileResult, type Instruction } from '#lib/languages/BaseEmulator.svelte.ts'
import {
    type BuildArtifact,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    isLineBreakpoint,
    makeLabelColor,
    type MutationOperation,
    type PokeWrite,
    type RegisterFileDescriptor,
    type SourceBreakpoint,
    RegisterSize,
    type StackFrame
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { GenericEmulator } from '#lib/languages/GenericEmulator.svelte.ts'
import type { Termination } from '#lib/languages/termination.ts'
import { type ExecutionSlice, type ExecutionSliceRequest } from '#lib/languages/ExecutionSlice.ts'
import { MarsSlicePacer } from '#lib/languages/mars/marsSlice.ts'
import {
    canUndoMarsHistoryRange,
    memoryBackstepMutation,
    registerBackstepMutation
} from '#lib/languages/mars/marsUndo.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import { programArgv0 } from '#lib/commandLine.ts'
import { MarsDevices } from '#lib/languages/mars/MarsDevices.ts'
import {
    exitStepText,
    MarsHandlers,
    marsRuntimeErrorMessage,
    normalizeUndoSize,
    randomStreamStepText,
    toHaltLimit
} from '#lib/languages/mars/marsHandlers.ts'
import {
    type MarsDisplayConfiguration,
    type MarsDisplayOrigin,
    normalizeMarsDisplay,
    type ProjectDisplay
} from '#lib/languages/mars/marsDisplay.ts'
import {
    applyScreenDirective,
    assembledCore,
    ignoredIncludedScreenDiagnostics,
    readScreenLabelProbe,
    resolveScreenLabel,
    SCREEN_LABEL_PROBE_ADDRESS,
    screenLabelProbeSource
} from '#lib/languages/mars/screenDirective.ts'
import {
    makeTokenSpanIndex,
    tokenSpanEnd,
    type TokenSpanIndex
} from '#lib/languages/mars/tokenSpans.ts'
import {
    buildAssemblerProfile,
    ProjectFormatError,
    sourceText,
    textAssemblyFiles,
    updateEntryText,
    type BuildInput,
    type BuildSources,
    type ProjectFiles
} from '#lib/projectFiles.ts'
import {
    riscvCsrRegisterName,
    RISCVCsrRegisterNames,
    RISCVFloatingPointRegisterNames,
    RISCVRegisterNames,
    type RISCVRegisterName
} from './RISC-V-registers'

export {
    ALTERNATIVE_RISCVRegister_NAMES,
    RISCVRegisterNames,
    type RISCVRegisterName
} from './RISC-V-registers'

/**
 * How many instructions the TeaVM compiled Core runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured on a compute-only loop under node, built with the shipped undo
 * history: about 4 800 (`npm run measure`, three runs of 4 700 to 5 000, after the undo recorder
 * stopped counting in longs; the harness measured about 1 600 on the same loop before that). The
 * estimate of 2 800 before that was taken while the Core kept the program
 * counter in a long Register and added one to the cycle and instret counters on every instruction -
 * TeaVM compiles long arithmetic into BigInt operations, each of which allocates - read the
 * self-modifying-code setting out of a map on every instruction fetch, fetched through four calls
 * that re-checked alignment and the text segment, and assembled every aligned word load and store a
 * byte at a time. The estimate of 25 before that was taken before four faults in RARS were
 * fixed, each worth several times the throughput of the one before it: `BackStepper.BackStep.assign`
 * threw an `AddressErrorException` per backstep entry for any loop branching to the first
 * instruction of the text segment, which is where `main` sits in every example; the cycle, instret
 * and time counters were resolved by name and recorded an undo entry even when the value did not
 * change; and a monitor was entered on every register access, every memory table access, every
 * backstep push and once more around each instruction, which TeaVM compiles to real monitor enter
 * and exit calls on a Core that is single threaded; and the two counters recorded an undo entry
 * each, where one entry covers both.
 */
const RISCV_INSTRUCTIONS_PER_MS = 4_800

/**
 * How much wall time one `simulate*` call aims at, which is also about how far a chunk can carry the
 * slice past its deadline before the next check (`marsSlice.ts`). Four
 * milliseconds is about twenty thousand instructions of this Core's compute and a dozen calls in a
 * compute slice: the Core spends under a fifth of a microsecond on each instruction, so a chunk
 * that large hides the call.
 */
const RISCV_CHUNK_TARGET_MS = 4

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
    /**
     * RARS's ecall handlers, the same as MARS's and shared with MIPS (`marsHandlers.ts`). Built once
     * like the devices and registered on each freshly assembled Core.
     */
    private readonly handlers: MarsHandlers
    /** The chunking of a slice, which is what keeps it near its deadline (`marsSlice.ts`). */
    private readonly pacer = new MarsSlicePacer(RISCV_CHUNK_TARGET_MS)
    /** RARS's five display parameters, from the project and changed from the Screen panel. */
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

    constructor(source: BuildInput, options: EmulatorSettings) {
        const systemSize =
            options.language === 'RISC-V-64' ? RegisterSize.Double : RegisterSize.Long
        super(
            source,
            {
                systemSize,
                registerNames: [...RISCVRegisterNames],
                hiddenRegisters: ['zero'],
                endianness: 'little',
                registerFiles: riscvRegisterFileDescriptors(systemSize)
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
                //RARS advances PC before invoking the ecall's asynchronous handler.
                if (interrupt) this.refreshInputState(this._getInstructionAt(this._getPc() - 4n))
            },
            pauseAtSleep: () => {
                if (this.slicing) this.riscv?.pause()
            },
            fileSystem: () => this.fileSystemSession,
            instructionSerial: () => this.requireRiscV().getCurrentInstructionSerial()
        })
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
     * Whether this Emulator's Cores are RV64, which each one is made with (`makeRiscVCore`). A
     * getter and not a field because the base constructor already runs `_checkCode` (through
     * `semanticCheck()`), which happens before subclass field initializers would run.
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
        if (stackTab && !stackTab.userPlaced) {
            stackTab.address = this._getSp() - BigInt(stackTab.pageSize)
        }
    }

    _canUndo(): boolean {
        const riscv = this.riscv
        if (!riscv?.canUndo) return false
        const group = riscv.getUndoGroupsUpTo(1)[0]
        //a Poke belongs to no instruction, so the FileSystem session, whose frames are keyed by an
        //instruction serial, has nothing to say about undoing one
        //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        if (!group || group.kind === 'poke') return true
        return this.fileSystemSession?.canUndoAfter(group.serial) ?? true
    }

    /** The Core groups its history by instruction or Poke, so the group count is the depth. */
    _undoDepth(): number {
        return this.riscv?.getUndoDepth() ?? 0
    }

    /**
     * The Core's count of every instruction it has executed, one Undo entry each, the one a failed
     * Step or slice stopped on included: what lets `GenericEmulator` record a call that threw, where
     * the pacer's per-chunk counts are lost with the rejection.
     */
    _getInstructionsExecuted(): bigint {
        return BigInt(this.riscv?.getInstructionsExecuted() ?? 0)
    }

    _canUndoSteps(count: number): boolean {
        return this._canUndoHistoryRange(0, count)
    }

    _canUndoHistoryRange(skip: number, count: number): boolean {
        return canUndoMarsHistoryRange(this.riscv, this.fileSystemSession, skip, count)
    }

    _setUndoRecording(recording: boolean): void {
        this.riscv?.setUndoEnabled(recording && this.undoEnabled)
    }

    /**
     * Opens the Core's Poke transaction: `setRegisterValue`, `setFloatingPointRegisterValue`,
     * `setControlAndStatusRegisterValue` and `setMemoryBytes` journal into it instead of writing
     * straight through, and `endPoke` records the lot as one entry of the undo history
     * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)).
     */
    _beginPoke(): void {
        this.requireRiscV().beginPoke()
    }

    _endPoke(): boolean {
        return this.requireRiscV().endPoke()
    }

    /**
     * `argv[0]` as a shell would start the program, `./main` for `main.s` or `main.c`, and the
     * Arguments after it, which the Core stores above the stack at every start, with argc in `a0`
     * and argv in `a1`, pointers as wide as the Target's
     * ([ADR 0046](../../../../../../docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)).
     * Checked here at this Emulator's width, so the Core's refusal (too many, too long) stops the
     * Build as an Arguments problem; the Core `_compile` creates gets them.
     */
    _setProgramArguments(sources: BuildSources, args: string[]): void {
        const argv = [programArgv0(sources.entry, false, sources.entrySource), ...args]
        RISCV.checkProgramArguments(argv, this.is64Bit)
        this.programArgv = argv
    }

    /**
     * Loads the Runtime library a Build links, and the list of library functions that explains an
     * undefined `printf` in a Build that does not link it, before any Core is created.
     */
    async _prepareBuild(sources: BuildSources): Promise<void> {
        const language = this.is64Bit ? 'RISC-V-64' : 'RISC-V'
        if (sources.runtimeAbi === undefined) {
            await loadRuntimeFunctions(CURRENT_RUNTIME_ABI)
            return
        }
        //only a Compilation record's requirement starts at the library's _start (resolveRuntimeLink)
        const problem = unsupportedRuntimeAbi(sources.runtimeAbi, sources.entrySymbol !== undefined)
        if (problem) throw new ProjectFormatError(problem)
        await loadRuntimeLibrary(sources.runtimeAbi, language)
    }

    /** The library and entry symbol `_prepareBuild` loaded for these sources. */
    private runtimeLink(sources: BuildSources): RiscVLink {
        if (sources.runtimeAbi === undefined) return {}
        const language = this.is64Bit ? 'RISC-V-64' : 'RISC-V'
        const library = loadedRuntimeLibrary(sources.runtimeAbi, language)
        if (!library)
            throw new ProjectFormatError(`The Runtime library ${sources.runtimeAbi} is not loaded`)
        return {
            library: coreLibrary(library),
            ...(sources.entrySymbol ? { entrySymbol: sources.entrySymbol } : {})
        }
    }

    /** An undefined library function in a Build without the library says how to turn it on. */
    private withRuntimeHints(sources: BuildSources, diagnostics: Diagnostic[]): Diagnostic[] {
        if (sources.runtimeAbi !== undefined) return diagnostics
        const functions = loadedRuntimeFunctions(CURRENT_RUNTIME_ABI)
        return diagnostics.map((diagnostic) => {
            if (diagnostic.severity !== 'error' || diagnostic.hint) return diagnostic
            const hint = runtimeLibraryHint(diagnostic.message, functions)
            return hint ? { ...diagnostic, hint } : diagnostic
        })
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        const files = textAssemblyFiles(sources)
        const riscv = makeRiscVCore(
            files,
            sources.entry,
            buildAssemblerProfile(sources),
            this.is64Bit,
            this.runtimeLink(sources)
        )
        const result = riscv.assemble()
        const lines = tokenizedLines(riscv)
        const spans = makeTokenSpanIndex(lines)
        //the same warnings the Build reports, so the squiggle on a `@screen` line is there while it
        //is being typed and does not vanish half a second after a Build replaces this list; read
        //last, since a name only a probe resolves assembles another Core over this one
        const directive = this.readScreenDirective(
            sources,
            assembledCore(riscv, result)
        ).diagnostics
        return this.withRuntimeHints(sources, [
            ...directive,
            ...includedScreenDiagnostics(files, sources.entry, lines),
            ...result.errors.map((error) => assembleErrorToDiagnostic(error, spans))
        ])
    }

    _compile(sources: BuildSources, undoSize: number): CompileResult {
        this.riscv = null
        const files = textAssemblyFiles(sources)
        let { riscv, result } = this.assembleProgram(sources, files, undoSize)
        //before the first instruction, so it and a Testcase alike run on the display the source
        //asked for, its base label read from this assembly. A name only the probe resolves
        //assembles a throwaway Core over the state every Core shares, so the program is assembled
        //again after it
        let probed = false
        const configured = this.readScreenDirective(sources, assembledCore(riscv, result), () => {
            probed = true
        })
        if (probed) ({ riscv, result } = this.assembleProgram(sources, files, undoSize))
        this.display = configured.display
        this.displayOrigin = configured.origin
        this.displayBaseLabel = configured.baseLabel
        //the build path, not `setDisplay`: the Core the devices still hold is the *previous* one, so
        //a re-sync here would repaint the Screen `clear()` has just blanked with the program's
        //memory — and a build that then fails never reaches `_initialize` to put it right again
        this.devices.resetScreen(this.display)
        const lines = tokenizedLines(riscv)
        const spans = makeTokenSpanIndex(lines)
        const diagnostics = this.withRuntimeHints(sources, [
            ...configured.diagnostics,
            ...includedScreenDiagnostics(files, sources.entry, lines),
            ...result.errors.map((error) => assembleErrorToDiagnostic(error, spans))
        ])
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
        return { ok: true, diagnostics, libraryFiles: this.libraryFiles(sources, riscv) }
    }

    /** A Core for the program, assembled for a Build. */
    private assembleProgram(
        sources: BuildSources,
        files: Record<string, string>,
        undoSize: number
    ) {
        const riscv = makeRiscVCore(
            files,
            sources.entry,
            buildAssemblerProfile(sources),
            this.is64Bit,
            this.runtimeLink(sources)
        )
        //`assemble()` allocates the backstep ring buffer from the size that `setUndoSize` stored, so
        //the size has to be set *before* assembling: setting it afterwards would only size the next
        //compile's buffer (legacy ordering was setUndoSize -> assemble -> setUndoEnabled)
        riscv.setUndoSize(Math.max(1, normalizeUndoSize(undoSize)))
        //stored by every `initialize`, a Testcase's included, before its starting registers
        riscv.setProgramArguments(this.programArgv)
        return { riscv, result: riscv.assemble() }
    }

    /**
     * The members of the library the Build linked, in the order the Core placed them: read-only
     * Files the debugger and the Explorer show. The rest of the library stays reachable through go
     * to definition.
     */
    private libraryFiles(sources: BuildSources, riscv: JsRiscV): ProjectFiles | undefined {
        if (sources.runtimeAbi === undefined) return undefined
        const language = this.is64Bit ? 'RISC-V-64' : 'RISC-V'
        const library = loadedRuntimeLibrary(sources.runtimeAbi, language)
        if (!library) return undefined
        //a member's every statement names it, and a key keeps the place of its first entry
        return Object.freeze(
            Object.fromEntries(
                riscv
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
        const riscv = this.requireRiscV()
        //the stack was already sized in `_compile`, `assemble()` engages the backstepper
        //unconditionally so this is what actually turns undo off when history is disabled
        this.undoEnabled = normalizeUndoSize(undoSize) > 0
        riscv.setUndoEnabled(this.undoEnabled)
        //a new run: not exited, exit code 0, and the random generators forgotten
        riscv.initialize(true)
        this.failedAt = null
        this.pacer.reset()
        registerHandlers(riscv, this.handlers.makeHandlerMap())
        //after `initialize`, so the observers see the program's writes and not the loading of `.data`
        this.devices.attach(riscv, this.display)
        //what an instruction does to the Terminal, a handler's or a device's, is journaled under the
        //serial its Undo group carries ([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md))
        const instruction = () => {
            const serial = riscv.getCurrentInstructionSerial()
            return serial === null ? null : BigInt(serial)
        }
        this._peripherals.terminal.trackHistory(instruction, normalizeUndoSize(undoSize))
        //and so are the Notes it plays
        //([ADR 0059](../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md))
        this._peripherals.audio.track(instruction, normalizeUndoSize(undoSize))
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
     * What the program's `@screen` comment asks for, on top of the display the Screen has now, its
     * base label read from `assembled`, the program's Core when it assembled; `onProbe` is told
     * when that took a probe, which assembles a Core of its own.
     *
     * `normalizeMarsDisplay` also covers the semantic check the base constructor starts before this
     * subclass's fields exist, when there is no current display to layer onto yet.
     */
    private readScreenDirective(
        sources: BuildSources,
        assembled: JsRiscV | null,
        onProbe?: () => void
    ) {
        const code = sourceText(sources)
        const configured = applyScreenDirective(code, normalizeMarsDisplay(this.display), (label) =>
            resolveScreenLabel(assembled, label, () => {
                //the GNU profile's symbol table is all its probe ever read
                if (sources.assemblerProfile === 'gnu-compiler-v1') return null
                onProbe?.()
                return this.probeLabelAddress(sources, label)
            })
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
     * The address of a `@screen base=` name the program's symbol table does not hold, such as an
     * `.eqv` name: the program is assembled once more with one extra `.word <name>` at a fixed
     * address and that word is read back, since the assembler itself resolves the name in it.
     */
    private probeLabelAddress(sources: BuildSources, label: string): number | null {
        try {
            const probeSources = updateEntryText(
                sources,
                screenLabelProbeSource(sourceText(sources), label)
            )
            const probe = makeRiscVCore(
                textAssemblyFiles(probeSources),
                probeSources.entry,
                buildAssemblerProfile(probeSources),
                this.is64Bit,
                this.runtimeLink(probeSources)
            )
            const result = probe.assemble()
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
                //the same indented text the Markdown form uses, so an expansion lines up with the
                //source instruction it came from rather than starting at the Editor's left edge
                instructions: statements.map((statement, index) => ({
                    address: BigInt(statement.address),
                    code: lines[index] ?? formatStatement(statement.assemblyStatement)
                }))
            })
        }
        //RISC-V has no generated code panel, only the per-line expansion decorations
        return { decorations, code: '' }
    }

    protected _getBuildArtifacts(): BuildArtifact[] {
        return (this.riscv?.getCompiledStatements() ?? []).map((statement) => ({
            file: statement.sourcePath,
            line: sourceLineToIndex(statement.sourceLine),
            address: BigInt(statement.address >>> 0),
            opcode: (statement.binaryStatement >>> 0).toString(16).padStart(8, '0')
        }))
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        //RISC-V has no status flags, the UI hides the whole section when this is empty
        return []
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.statementAtAddress(Number(address)))
    }

    /** None once the program has ended, even where an exit left it on a statement. */
    _getNextInstruction(): Instruction | null {
        return toInstruction(this.riscv?.getNextStatement())
    }

    /**
     * The instruction a failed Core call stopped on, which its `RuntimeError` named. Otherwise none,
     * and the newest entry of the history is the last instruction that ran.
     */
    _getLastInstruction(): Instruction | null {
        return this.failedAt === null ? null : toInstruction(this.statementAtAddress(this.failedAt))
    }

    _getPc(): bigint {
        const riscv = this.riscv
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.programCounterLong) : BigInt(riscv.programCounter)
    }

    _getMemoryLayout() {
        const core = this.riscv!
        const names = core.getSectionNames()
        const values = core.getLayoutItems()
        const items: import('../commonLanguageFeatures.svelte').MemoryLayoutItem[] = []
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
        const core = this.riscv
        return core
            ? { start: BigInt(core.getHeapStart() >>> 0), end: BigInt(core.getHeapBreak() >>> 0) }
            : undefined
    }
    _getStackTop() {
        return BigInt((this.riscv?.getStackTop() ?? 0) >>> 0)
    }
    /** The argv the Core stored above the stack at its last initialize ([ADR 0046](../../../../../../docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)). */
    _getArgumentsArea() {
        return argvArgumentsArea(this.riscv?.getProgramArgumentsLayout())
    }
    _getDeviceRegions() {
        return this.devices.regions()
    }
    _resolveMemoryLabel(name: string) {
        const address = this.riscv?.getAddressOfLabel(name)
        return address === undefined || address === -1 ? undefined : BigInt(address >>> 0)
    }

    _getSp(): bigint {
        const riscv = this.riscv
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.stackPointerLong) : BigInt(riscv.stackPointer)
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

    /**
     * The history as `undo()` pops it: one entry per executed instruction or Poke, rather than the
     * one row per back step the panel used to show, where an instruction that wrote two values was
     * two rows and "Undo to here" on row N undid N instructions
     * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)). The Core folds the
     * counter entry every instruction pushes into the instruction's own group, so nothing has to be
     * skipped before the `max` cut any more.
     */
    _getUndoHistory(max: number): ExecutionStep[] {
        return this._getUndoHistoryRange(0, max)
    }

    _getUndoHistoryRange(skip: number, max: number): ExecutionStep[] {
        const riscv = this.riscv
        if (!riscv) return []
        return riscv
            .getUndoGroupsRange(skip, max)
            .map((group) =>
                group.kind === 'poke'
                    ? this.pokeGroupToStep(group)
                    : this.instructionGroupToStep(group)
            )
    }

    /**
     * One executed instruction, with every value it overwrote as a mutation of the same row. The
     * counter decrement is bookkeeping the program did not ask for, so it drops out here and an
     * instruction that wrote nothing else is a row with no mutations, which is still the row "Undo
     * to here" has to count.
     */
    private instructionGroupToStep(group: JsInstructionUndoGroup): ExecutionStep {
        const statement = this.statementAtAddress(group.pc)
        return {
            kind: 'instruction',
            pc: group.pc,
            //RISC-V has no condition code register, the UI reads these only for M68K
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            line: statement ? sourceLineToIndex(statement.sourceLine) : -1,
            file: statement?.sourcePath,
            //the Core reports the back steps newest first, which is the order they are undone in;
            //a row reads as what the instruction did, so it lists them in the order they happened
            mutations: [...group.steps]
                .reverse()
                .map((step) => this.backstepToMutation(step))
                .filter((mutation) => mutation !== null)
        }
    }

    /**
     * One Poke: everything a single `beginPoke`/`endPoke` transaction wrote, as one row of the
     * History panel ([the design record](../../../../../../docs/design/pokes.md)). No instruction ran, so
     * it carries no PC and no source line, and its mutations are the values it overwrote, which is
     * what the panel diffs a poked cell against.
     */
    private pokeGroupToStep(group: JsPokeUndoGroup): ExecutionStep {
        const writes = group.writes.map((write) => this.pokeWrite(write))
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
     * One value a Poke wrote, in the panels' reading. A register arrives as a signed decimal string
     * of the whole 64 bit value, whatever the target: the FPU is 64 bits wide on both, while a
     * general register and a CSR are read as the target's word, exactly as `_getRegisterValues` and
     * `_getRegisterFileValues` narrow them.
     */
    private pokeWrite(write: JsPokeWrite): PokeWrite {
        if (write.type === 'memory') {
            return {
                type: 'memory',
                address: BigInt(write.address >>> 0),
                old: [...write.old],
                new: [...write.new]
            }
        }
        const bits = this.pokeWriteBits(write.name)
        return {
            type: 'register',
            name: write.name,
            old: BigInt.asUintN(bits, BigInt(write.old)),
            new: BigInt.asUintN(bits, BigInt(write.new))
        }
    }

    /** How wide that register is read, by the file its name belongs to. */
    private pokeWriteBits(register: string): number {
        //a single lives NaN-boxed in the high word, so the FPU file is 64 bits wide on both targets
        const floating = (RISCVFloatingPointRegisterNames as readonly string[]).includes(register)
        return floating ? 64 : 8 * Number(this._systemSize)
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
                size: (this.pokeWriteBits(write.name) / 8) as RegisterSize
            }
        }
    }

    /**
     * How the program ended: exit (10) with code 0 or exit2 (93) with `a0`, which the Log shows
     * although RARS's GUI ignores it, or running off the end of the code. Both leave `terminated`
     * set, and the stop reason of the call that ended the program tells them apart.
     */
    _getTermination(): Termination | undefined {
        const riscv = this.riscv
        if (!riscv?.terminated) return undefined
        return riscv.getStopReason() === StopReason.NORMAL_TERMINATION
            ? { kind: 'exit', code: riscv.exitCode }
            : { kind: 'end' }
    }

    /**
     * Whether an exit service has run or the program has run off the end of its code, which the
     * Core reads from the program's state, so that it is right after Undo too. A runtime failure
     * does not end the program here: `GenericEmulator` keeps that from the rejection.
     */
    _hasTerminated(): boolean {
        return this.riscv?.terminated ?? false
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

    /**
     * The FPU and the CSRs, each read out of the Core in one flat call per panel refresh
     * ([ADR 0021](../../../../../../docs/adr/0021-register-files-from-core-exports.md)). Both are handed
     * over as high/low pairs of 32 bit halves rather than as decimal strings, because a 64 bit
     * conversion per register per refresh is the kind of work that costs in the compiled Core.
     *
     * A method and not a field holding an arrow function: `GenericEmulator` demands this hook from
     * its own constructor, which runs before this class's field initialisers would.
     */
    _getRegisterFileValues(id: string): bigint[] {
        const riscv = this.requireRiscV()
        if (id === 'fpu') {
            return composeHighLowPairs(riscv.getFloatingPointRegistersValues())
        }
        if (id === 'csr') {
            const values = composeHighLowPairs(riscv.getControlAndStatusRegistersValues())
            //the Core always hands back the whole 64 bit value; on the 32 bit target RARS shows a
            //CSR's low word and keeps the high half of a counter in its `*h` register, which is a
            //register of this file in its own right
            if (this.is64Bit) return values
            return values.map((value) => value & 0xffffffffn)
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    /**
     * Writes one register of either file, which the Core takes as a high/low pair like the CPU
     * ones.
     */
    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        const riscv = this.requireRiscV()
        const [high, low] = bigintToHighLow(value)
        if (id === 'fpu') {
            const index = RISCVFloatingPointRegisterNames.findIndex((name) => name === register)
            if (index === -1) throw new Error(`Unsupported register: ${register}`)
            riscv.setFloatingPointRegisterValue(index, high, low)
            return
        }
        if (id === 'csr') {
            const index = RISCVCsrRegisterNames.findIndex((name) => name === register)
            if (index === -1) throw new Error(`Unsupported register: ${register}`)
            riscv.setControlAndStatusRegisterValue(index, high, low)
            return
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    /**
     * One instruction. The step that runs an exit, or the program's last instruction, says so in its
     * stop reason, and an exited program runs nothing more until Undo.
     */
    async _step(): Promise<{ terminated: boolean }> {
        const riscv = this.requireRiscV()
        this.handlers.beginExecution()
        const stop = await this.coreCall(() => riscv.step())
        return { terminated: endsProgram(stop) }
    }

    /** A `RuntimeError` in RARS's words and at the line it names; anything else as it says. */
    _stringifyError(error: unknown, _line?: number): string {
        if (isRuntimeError(error)) return marsRuntimeErrorMessage(error)
        return error instanceof Error ? error.message : String(error)
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
            if (isRuntimeError(error)) this.failedAt = error.address
            throw error
        } finally {
            this.devices.flush()
        }
    }

    _undo(): void {
        const riscv = this.requireRiscV()
        const group = riscv.getUndoGroupsUpTo(1)[0]
        //the FileSystem session and the Terminal key their records by the instruction serial, and a
        //Poke has no instruction identity to undo their changes by, so it is rolled back by the Core
        //alone ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        const serial = group?.kind === 'instruction' ? group.serial : undefined
        if (serial !== undefined && !(this.fileSystemSession?.canUndoAfter(serial) ?? true)) {
            throw new Error('FileSystem Undo history exhausted')
        }
        //an exit and a failure were the newest things the program did, so they are the first
        //undone: the Core puts the exit back itself
        this.devices.rewind(() => riscv.undo())
        this.failedAt = null
        const readSynth = () => this.devices.readSynthBlock()
        if (serial === undefined) return this._peripherals.audio.resyncSynth(readSynth)
        this.fileSystemSession?.undoAfter(serial)
        this._peripherals.terminal.undoAfter(BigInt(serial) - 1n)
        this._peripherals.audio.undoAfter(BigInt(serial) - 1n, readSynth)
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
        const riscv = this.requireRiscV()
        //an exited program runs nothing more, which the Core would only say again
        if (riscv.terminated) return { reason: 'terminated', instructions: 0 }
        const breakpoints = calculateBreakpoints(riscv, request.breakpoints)
        this.handlers.beginExecution()
        this.slicing = true
        try {
            return await this.coreCall(() =>
                this.pacer.run(request, RISCV_INSTRUCTIONS_PER_MS, async (limit) => {
                    const stop = await riscv.simulateWithBreakpointsAndLimit(breakpoints, limit)
                    const instructions = riscv.getLastRunInstructionCount()
                    if (endsProgram(stop)) return { outcome: 'terminated', instructions }
                    if (stop === StopReason.BREAKPOINT)
                        return { outcome: 'breakpoint', instructions }
                    return { outcome: stop === StopReason.PAUSE ? 'paused' : 'ran', instructions }
                })
            )
        } finally {
            this.slicing = false
        }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const riscv = this.requireRiscV()
        this.handlers.beginExecution()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller;
        //how the run ended is read from the Core afterwards
        await this.coreCall(() => riscv.simulateWithLimit(toHaltLimit(haltLimit)))
    }

    /**
     * One back step as a mutation of its instruction's row, or none for the Core's own bookkeeping.
     * Every action has a case, so a new one is a type error here rather than a row nobody chose.
     */
    private backstepToMutation(step: JsBackStep): MutationOperation | null {
        switch (step.action) {
            case BackStepAction.REGISTER_RESTORE:
                //`registers[i].name` is `_registerNames[i]` by construction, reading the names
                //directly avoids depending on the register list being built already
                return registerBackstepMutation(
                    step,
                    this._registerNames[step.param1] ?? `x${step.param1}`,
                    this._systemSize
                )
            case BackStepAction.FLOATING_POINT_REGISTER_RESTORE:
                //`param1` is the register number, which is this file's own order, and the file is
                //64 bit wide on both targets, a single being NaN-boxed into it
                return registerBackstepMutation(
                    step,
                    RISCVFloatingPointRegisterNames[step.param1] ?? `f${step.param1}`,
                    RegisterSize.Double
                )
            case BackStepAction.MEMORY_RESTORE_BYTE:
                return memoryBackstepMutation(step, RegisterSize.Byte)
            case BackStepAction.MEMORY_RESTORE_HALF:
                return memoryBackstepMutation(step, RegisterSize.Word)
            case BackStepAction.MEMORY_RESTORE_WORD:
            case BackStepAction.MEMORY_RESTORE_RAW_WORD:
                return memoryBackstepMutation(step, RegisterSize.Long)
            case BackStepAction.MEMORY_RESTORE_DOUBLE_WORD:
                return memoryBackstepMutation(step, RegisterSize.Double)
            //the address the restore puts back, and the one the instruction set
            case BackStepAction.PC_RESTORE:
                return registerBackstepMutation(step, 'pc', this._systemSize)
            //the only writer of a backdoor entry is an instruction reading the `time` CSR (or
            //`timeh`), which the Core sets to the program time as it is read and journals against
            //that instruction, so the reading is one of the instruction's writes like any other
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE: {
                //`param1` is the CSR *number*, the sparse architectural address the `csrr*`
                //instructions take, and not a position in the file (see `riscvCsrRegisterName`)
                const name = riscvCsrRegisterName(step.param1)
                if (name) return registerBackstepMutation(step, name, this._systemSize)
                const kind =
                    step.action === BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR
                        ? 'backdoor'
                        : 'restore'
                return {
                    type: 'Other',
                    value: `Control and status register ${kind} 0x${step.param1.toString(16)}`
                }
            }
            //the cycle and instret counters are bookkeeping the program did not ask for, and the
            //Core advances them once per instruction, so the entry that undoes them is not a
            //mutation the diff should show; nor is the heap break the Core keeps of its layout
            case BackStepAction.CONTROL_AND_STATUS_COUNTERS_DECREMENT:
            case BackStepAction.HEAP_RESTORE:
                return null
            //the two a Poke records: the whole Poke, and the restore of a CSR written through its
            //own value. A poke group is rendered from its `writes` instead
            //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)), so neither
            //reaches this list
            case BackStepAction.POKE:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_POKE_RESTORE:
                return null
            case BackStepAction.DO_NOTHING:
                return { type: 'Other', value: 'Do nothing' }
            //`newValue` is the code the exit set: 0 for exit, `a0` for exit2
            case BackStepAction.EXIT_RESTORE:
                return { type: 'Other', value: exitStepText(step.newValue) }
            case BackStepAction.RANDOM_STREAM_RESTORE:
                return { type: 'Other', value: randomStreamStepText(step.param1) }
            //the Core reports -1 for a back step without an action, which its type leaves out
            default:
                return unknownBackStep(step.action)
        }
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

/**
 * The Register files this adapter reads out of the Core beyond the CPU one, as the design record
 * lists them ([docs/design/register-files.md](../../../../../../docs/design/register-files.md)). The FPU
 * is 64 bits wide on both targets, where a single lives NaN-boxed in the high word, while the CSR
 * file has the target's word size, so RV32 shows the `*h` halves as RARS does.
 */
function riscvRegisterFileDescriptors(systemSize: RegisterSize): RegisterFileDescriptor[] {
    return [
        {
            id: 'fpu',
            label: 'FPU',
            size: RegisterSize.Double,
            formats: ['double', 'single', 'hex'],
            nanBoxedSingles: true,
            registers: RISCVFloatingPointRegisterNames.map((name) => ({ name }))
        },
        {
            id: 'csr',
            label: 'CSR',
            size: systemSize,
            formats: ['hex'],
            registers: RISCVCsrRegisterNames.map((name) => ({ name }))
        }
    ]
}

/**
 * One 64 bit value per pair of halves, the high one first, as both file getters return them. The
 * Core hands the array over as an `Int32Array` of *signed* halves, so a half with its top bit set
 * reads back negative: `highLowToBigint` takes both unsigned, which mapping over the typed array
 * could not do (its `map` truncates every result back to an int32).
 */
function composeHighLowPairs(halves: Int32Array): bigint[] {
    const values: bigint[] = []
    for (let i = 0; i + 1 < halves.length; i += 2) {
        values.push(highLowToBigint(halves[i], halves[i + 1]))
    }
    return values
}

function sourceLineToIndex(sourceLine: number) {
    return sourceLine - 1
}

/**
 * Whether a run call's stop reason ends the program: an exit service ran (`NORMAL_TERMINATION`), or
 * the call ran the program's last instruction (`CLIFF_TERMINATION`). The others leave it runnable:
 * `BREAKPOINT` (a breakpoint, or an `ebreak`), `MAX_STEPS` (the halt limit, which a single `step()`
 * ends on) and `PAUSE`/`STOP` (only reachable through Core APIs this adapter does not use).
 * `EXCEPTION` is never returned: a runtime failure rejects the call instead.
 */
function endsProgram(stop: StopReason): boolean {
    return stop === StopReason.NORMAL_TERMINATION || stop === StopReason.CLIFF_TERMINATION
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

/**
 * One source line can assemble to several machine statements — a pseudo-instruction like `la`, or a
 * macro invocation — and every one of them reports that line. Breaking on all of them stopped the
 * run once per generated instruction, so a single visible breakpoint took several Runs to clear.
 * Only the first address of the expansion is a breakpoint: it is where the line is entered.
 */
function calculateBreakpoints(riscv: JsRiscV, breakpoints: SourceBreakpoint[]): number[] {
    return breakpoints.filter(isLineBreakpoint).flatMap((breakpoint) => {
        const statements = riscv.getStatementsAtSourceLocation(breakpoint.file, breakpoint.line + 1)
        const entry = statements.reduce<number | undefined>(
            (lowest, statement) =>
                lowest === undefined || statement.address < lowest ? statement.address : lowest,
            undefined
        )
        return entry === undefined ? [] : [entry]
    })
}

/** The tokenized source of a build, or nothing when the Core will not give it up. */
function tokenizedLines(riscv: JsRiscV): RiscvTokenizedLine[] {
    try {
        return riscv.getTokenizedLines()
    } catch {
        return []
    }
}

function includedScreenDiagnostics(
    files: Readonly<Record<string, string>>,
    entry: string,
    lines: readonly RiscvTokenizedLine[]
): Diagnostic[] {
    return ignoredIncludedScreenDiagnostics(
        files,
        entry,
        lines.map((line) => line.sourcePath)
    )
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

function assembleErrorToDiagnostic(error: RISCVAssembleError, spans: TokenSpanIndex): Diagnostic {
    const lineIndex = sourceLineToIndex(error.sourceLine)
    return {
        severity: error.isWarning ? 'warning' : 'error',
        file: error.sourcePath,
        lineIndex,
        column: error.sourceColumn,
        endColumn: tokenSpanEnd(spans, error.sourcePath, error.sourceLine, error.sourceColumn),
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

/** No row for a back step without an action; `never` keeps the switch that calls it exhaustive. */
function unknownBackStep(_action: never): null {
    return null
}
