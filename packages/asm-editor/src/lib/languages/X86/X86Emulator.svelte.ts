import { executableAnalysis, executableKind } from '#lib/executables.ts'
import { programArgv0 } from '#lib/commandLine.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import {
    functionAtLine,
    instructionAddressAt,
    lineOfAddress,
    type Listing
} from '#lib/listing/listing.ts'
import { listingClient } from '#lib/listing/listingClient.ts'
import { ListingDocuments, type ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import { ListingPatcher } from '#lib/listing/listingPatcher.svelte.ts'
import { LIBRARY_LISTING_NAMESPACE, libraryListingPath } from '#lib/listing/listingPaths.ts'
import { memoryLayoutFromItems } from '../memoryRegions'
import {
    EmulatorStatus,
    type CompileResult,
    type Instruction
} from '#lib/languages/BaseEmulator.svelte.ts'
import {
    type BuildArtifact,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    isLineBreakpoint,
    type MutationOperation,
    type PokeWrite,
    type RegisterFileDescriptor,
    RegisterSize,
    type SourceBreakpoint,
    type StackFrame
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { GenericEmulator, isLibraryCodeFile } from '#lib/languages/GenericEmulator.svelte.ts'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceInstructionBudget
} from '#lib/languages/ExecutionSlice.ts'
import type { ExecutionGeneration } from '#lib/languages/ExecutionController.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import {
    END_OF_INPUT,
    assembleInstruction,
    createX86Emulator,
    decodeFpuState,
    locateDiagnosticSpan,
    readLogicalStTags,
    EmulatorStatus as CoreEmulatorStatus,
    RegisterSize as CoreRegisterSize,
    X86_REGISTER_NAMES,
    X86_SSE_REGISTERS,
    X86_X87_REGISTERS,
    type ExecutionStep as CoreExecutionStep,
    type MonacoError as CoreMonacoError,
    type MutationOperation as CoreMutationOperation,
    type PokeWrite as CorePokeWrite,
    type X86Breakpoint,
    type X86CompilationDiagnostic,
    type X86Emulator as CoreX86Emulator,
    type X86FpuState,
    type X86LoadedObject,
    type X86WaitRequest,
    type X86RegisterName
} from '@specy/x86'
import structuredClone from '@ungap/structured-clone'
import {
    loadedRuntimeFunctions,
    loadedRuntimeLibrary,
    loadRuntimeFunctions,
    runtimeLibraryHint
} from '#lib/sourceRuntime/runtimeLibrary.ts'
import { CURRENT_RUNTIME_ABI } from '#lib/runtimeAbi.ts'
import { x86DiagnosticHint } from './X86-diagnostics'
import { ProjectFormatError, type BuildInput, type BuildSources } from '#lib/projectFiles.ts'
import {
    linksX86StartUnit,
    prepareX86Runtime,
    x86CoreProject,
    X86_START_UNIT_FILES
} from './x86StartUnit'
import type { Termination } from '#lib/languages/termination.ts'

/**
 * Initial instructions/ms for the scheduler's adaptive estimate. Chromium measurements with
 * @specy/x86 4.0.0 and the default Undo history found roughly 1,800–2,400 instructions/ms
 * ([the results](../../../../../../docs/research/code-cleanup-2026-10-05/followup-results.md)).
 */
const X86_INSTRUCTIONS_PER_MS = 2_000

/**
 * A slice returns to GenericEmulator before the Core starts another native batch, so Pause is
 * honored there and the app owns the host yield. Undo recording is slower: its smaller cap keeps
 * Stop and Pause under 100 ms in the measured 4× CPU slowdown. Without history, one full native
 * batch still fits that target. The time estimate can reduce either cap on slower programs.
 */
const X86_MAX_SLICE_INSTRUCTIONS_WITH_UNDO = 20_000
const X86_MAX_SLICE_INSTRUCTIONS_WITHOUT_UNDO = 50_000

/** What a read of standard input asks for, in words. */
const STANDARD_INPUT_QUESTION = 'Program input'

/**
 * The Register files x86 holds beside the general registers
 * ([the design record](../../../../../../docs/design/register-files.md)): the SSE registers and the x87
 * stack, each listed in the order `getFpuState` reports it, which is the order
 * `X86_SSE_REGISTERS` and `X86_X87_REGISTERS` name.
 */
const X86_REGISTER_FILES: RegisterFileDescriptor[] = [
    {
        id: 'sse',
        label: 'SSE',
        size: RegisterSize.Quad,
        formats: ['double', 'single', 'hex'],
        registers: [
            ...Array.from({ length: 16 }, (_, i) => ({ name: `xmm${i}` })),
            { name: 'mxcsr', size: RegisterSize.Long, kind: 'integer' as const }
        ]
    },
    {
        id: 'x87',
        label: 'x87',
        //Blink keeps the stack as 64 bit doubles rather than as 80 bit extended values, so a row is
        //exactly a double and there is no extended precision to offer a Format for
        size: RegisterSize.Double,
        formats: ['double', 'hex'],
        registers: [
            ...Array.from({ length: 8 }, (_, i) => ({ name: `st${i}` })),
            { name: 'fctrl', size: RegisterSize.Word, kind: 'integer' as const },
            { name: 'fstat', size: RegisterSize.Word, kind: 'integer' as const },
            { name: 'ftag', size: RegisterSize.Word, kind: 'integer' as const }
        ]
    }
]

export const DEFAULT_X86_FLAGS = [
    { name: 'CF', value: 0 },
    { name: 'PF', value: 0 },
    { name: 'AF', value: 0 },
    { name: 'ZF', value: 0 },
    { name: 'SF', value: 0 },
    { name: 'TF', value: 0 },
    { name: 'DF', value: 0 },
    { name: 'OF', value: 0 }
]

/** Linux's signal for an instruction the processor cannot run. */
const SIGILL = 4

/** Instructions whose only purpose is to raise SIGILL, which a real processor raises too. */
const UNDEFINED_INSTRUCTIONS = new Set(['ud0', 'ud1', 'ud2'])

export async function X86Emulator(source: BuildInput, options: EmulatorSettings = {}) {
    let wrapper: AsmEditorX86Emulator | null = null
    const [core, decoder] = await Promise.all([
        createX86Emulator({
            mode: 'NASM_trunk',
            callbacks: {
                stdout: (bytes) => wrapper?.appendOutput(bytes),
                stderr: (bytes) => wrapper?.appendOutput(bytes),
                unimplementedSyscall: (event) => wrapper?.noteUnimplementedSyscall(event)
            }
        }),
        //the Core has loaded the same Zydis module already; without it, an instruction the Core
        //cannot run is not named in the Log, and nothing else changes
        loadDecoder().catch(() => undefined)
    ])
    wrapper = new AsmEditorX86Emulator(source, options, core, decoder)
    return wrapper
}

class AsmEditorX86Emulator extends GenericEmulator<CoreX86Emulator, X86RegisterName> {
    private core: CoreX86Emulator | null = null
    private diagnosticCore: CoreX86Emulator | null = null
    private compileQueue: Promise<void> = Promise.resolve()
    private checkCodeQueue: Promise<void> = Promise.resolve()
    /**
     * Which x87 stack slots were empty in the block the values read decoded. A refresh reads a
     * file's values immediately before its blanks, so the tags cost no second bridge call. Before
     * the first read every slot is empty, which is what a machine that does not exist yet reports.
     */
    private x87Blanks: boolean[] = new Array(X87_STACK_DEPTH).fill(true)
    /** How many entries the Build's Undo history holds when full, as `initialize` was told. */
    private undoSize = 0
    private recordingRandom = true
    private compiling = false
    private clearAfterCompile = false
    private disposeAfterCompile = false
    private randomPositions = new Map<string, number>()
    private inputRead: { execution: ExecutionGeneration; promise: Promise<Uint8Array> } | null =
        null
    private waitError: unknown
    /**
     * The Executable this Debug session runs and its Listing, which every address inside it maps
     * to ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 5). Set when
     * the session begins; `loadingExecutable` holds it from the Build's load until then.
     */
    private executable: LoadedExecutable | undefined
    private loadingExecutable: LoadedExecutable | undefined
    /**
     * What the running program has mapped from files, as the Core last listed it: read again when
     * an address falls outside every one of them, which is how a library a Step enters is found,
     * and forgotten when a Run starts, since a Run can map and unmap anything. A Step, which a
     * Step through library code repeats thousands of times, does not read it again.
     */
    private loadedObjects: X86LoadedObject[] | undefined
    /**
     * The running Executable's PLT, as link-time ranges: stubs that only jump into a library, so
     * a Step runs through them as through the library ([binary-import.md](../../../../../../docs/design/binary-import.md),
     * decision 11): a Step on `call puts@plt` stops at the instruction after it.
     */
    private trampolines: [start: number, end: number][] = []
    /** Whether the Core records the Undo history now, which `_setUndoRecording` pauses. */
    private undoRecording = true
    /** The system calls this program's run has already been told in the Log are missing. */
    private notedSyscalls = new Set<number>()
    /** Zydis, for naming an instruction the Core could not run. */
    private decoder: ListingDecoder | undefined
    /**
     * Patches of the running Executable's code from its Listing, written as Pokes
     * ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 13), and the
     * Listing lines they changed, read again at every refresh.
     */
    readonly patcher: ListingPatcher = new ListingPatcher({
        executable: () => this.executable,
        readMemory: (address, length) => {
            try {
                return this.core?.readMemoryBytes(address, BigInt(length))
            } catch {
                return undefined
            }
        },
        poke: (address, bytes) => this.pokeMemory(address, bytes),
        decoder: () => this.decoder,
        loadDecoder: async () => (this.decoder ??= await loadDecoder()),
        assemble: (text, address) => assembleInstruction(text, address)
    })

    constructor(
        source: BuildInput,
        options: EmulatorSettings,
        core: CoreX86Emulator,
        decoder?: ListingDecoder
    ) {
        super(
            source,
            {
                systemSize: RegisterSize.Double,
                registerNames: [...X86_REGISTER_NAMES],
                endianness: 'little',
                registerFiles: X86_REGISTER_FILES
            },
            {
                ...options,
                language: options.language ?? 'X86',
                stackAddress: options.stackAddress ?? 0x7fffffffeff0n,
                baseAddress: options.baseAddress ?? 0x7fffffffeff0n,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        this.core = core
        this.decoder = decoder
        this._listings = new ListingDocuments((order) => listingClient.generate(order))
        core.setEnvironment({
            now: (id) => {
                const clock = this._peripherals.clock
                if (id === 0 || id === 5 || id === 11) return clock.calendarNow()
                if (id === 2 || id === 3) return clock.cpuNow(core.getInstructionsExecuted())
                return clock.now()
            },
            random: (length) => {
                const serial = core.getCurrentInstructionSerial()
                // Loader AT_RANDOM has no instruction. Keep its draw outside the Undo journal.
                if (
                    this.undoSize > 0 &&
                    this.recordingRandom &&
                    serial !== null &&
                    !this.randomPositions.has(serial)
                ) {
                    this.randomPositions.set(serial, this._peripherals.random.position)
                    // Keep at most one checkpoint per possible retained history entry. Obsolete
                    // serials are harmless (never reused), so no history scan is needed to prune
                    // them. Every newer checkpoint consumes an entry; evicting the oldest beyond
                    // capacity therefore cannot discard a checkpoint that Undo could still reach.
                    if (this.randomPositions.size > this.undoSize)
                        this.randomPositions.delete(this.randomPositions.keys().next().value!)
                }
                return this._peripherals.random.bytes(length)
            },
            wait: async (request, signal) => {
                try {
                    await this.waitForClock(request, signal)
                } catch (error) {
                    if (!signal.aborted) this.waitError = error
                    throw error
                }
            }
        })
        // Pause history while GenericEmulator runs compiled startup code. A Build that asked
        // for no history still records none when recording resumes.
        this._setUndoRecording = (recording) => {
            if (this.core === core) {
                core.setUndoEnabled(recording)
                this.recordingRandom = recording
                this.undoRecording = recording
            }
        }
        this._undoDepth = () => (this.core === core ? core.getUndoDepth() : 0)
        if (this._emulatorOptions.automaticChecking) void this.semanticCheck()
    }

    /** Streaming decoding belongs to the Terminal; native callbacks already exclude tool output. */
    appendOutput(bytes: Uint8Array): void {
        this._peripherals.terminal.writeBytes(bytes)
    }

    /**
     * The first call of each system call the Core does not implement in this run, named in the Log
     * ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 17). The program
     * sees `ENOSYS`, as Linux answers a call it does not have, and goes on.
     */
    noteUnimplementedSyscall({ number, name }: { number: number; name: string }): void {
        if (this.notedSyscalls.has(number)) return
        this.notedSyscalls.add(number)
        this.addNote({
            tone: 'warning',
            text: `\`${name}\` (syscall ${number}) is not implemented; the call returned ENOSYS`
        })
    }

    /**
     * A program that ended on an instruction the Core cannot run, which a real processor would
     * (AVX and later, most often): SIGILL at an address whose bytes decode as an instruction. An
     * undefined instruction (`ud2`) raises SIGILL on any processor, and bytes that are no
     * instruction at all are the program's own fault; the Log says nothing more about either.
     */
    _terminationNotes(): { tone: 'warning'; text: string }[] {
        const core = this.core
        const reason = core?.stopReason
        if (
            !core ||
            !this.decoder ||
            reason?.kind !== 'signal' ||
            reason.signal?.number !== SIGILL ||
            reason.address === undefined
        )
            return []
        const read = core.getInstructionAt(reason.address)
        if (!read?.bytes) return []
        const [decoded] = this.decoder.disassemble(read.bytes, reason.address)
        if (!decoded || decoded.isInvalid || UNDEFINED_INSTRUCTIONS.has(decoded.mnemonic)) return []
        return [
            {
                tone: 'warning',
                text: `The program ran \`${decoded.text}\` at \`0x${reason.address.toString(16)}\`, which the emulator does not support`
            }
        ]
    }

    /**
     * `argv[0]` as a shell would start the program, `./crackme` or `./main` for `main.asm`, and the
     * Arguments after it ([binary-import.md](../../../../../../docs/design/binary-import.md),
     * decision 12); the Core keeps them for every later start until they are set again.
     */
    _setProgramArguments(sources: BuildSources, args: string[]): void {
        const executable = executableKind(sources.files[sources.entry]) === 'supported'
        this.requireCore().setProgramArguments(programArgv0(sources.entry, executable), args)
    }

    protected getInstance(): CoreX86Emulator | null {
        return this.core ?? null
    }

    async compile(historySize: number, sourceOverride?: BuildInput): Promise<void> {
        const currentCompile = this.compileQueue.then(() =>
            super.compile(historySize, sourceOverride)
        )
        this.compileQueue = currentCompile.catch(() => undefined)
        await currentCompile
    }

    _getInstructionsExecuted(): bigint {
        return this.core?.getInstructionsExecuted() ?? 0n
    }

    _canUndo(): boolean {
        return this.core?.canUndo() ?? false
    }

    _canUndoSteps(count: number): boolean {
        return this.core?.canUndoSteps(count) ?? false
    }

    _canUndoHistoryRange(skip: number, count: number): boolean {
        return this.core?.canUndoHistoryRange(skip, count) ?? false
    }

    _clearExecution(): void {
        //also called by the base class's constructor, before this class's fields exist
        this.notedSyscalls?.clear()
        this.inputRead = null
        this.waitError = undefined
        this.randomPositions?.clear()
        //the running program's Listings go with it: `@lib/` tabs close, the Executable's own File
        //is shown again at the address it will be loaded at
        this.executable = undefined
        this.loadingExecutable = undefined
        this.loadedObjects = undefined
        this.trampolines = []
        this._listings?.session.clear()
        this.patcher?.clear()
        if (this.compiling) {
            // compileProject detached the old capability before its first awaited tool call.
            // Native cleanup is guarded during Build; finish it before the next queued Build.
            this.clearAfterCompile = true
            return
        }
        this.core?.clearExecution()
    }

    _beginExecutionSession(): void {
        if (!this.fileSystemSession) throw new Error('Missing x86 FileSystem session')
        this.requireCore().mountProjectFileSystem(this.fileSystemSession)
        this.executable = this.loadingExecutable
        this.loadingExecutable = undefined
        if (this.executable) {
            this._listings?.session.set(this.executable.path, this.executable.document)
            this.trampolines = pltRanges(this.executable.file)
        }
        const library = this.buildSources?.runtimeAbi
            ? loadedRuntimeLibrary(this.buildSources.runtimeAbi, 'X86')
            : undefined
        if (library) {
            // Reading instructions loads the ELF. Mount the session before that loader runs.
            const paths = new Set(
                this.requireCore()
                    .getCompiledInstructions()
                    .map((item) => item.file)
            )
            this._buildLibraryFiles = Object.fromEntries(
                Object.entries(library.members)
                    .filter(([path]) => paths.has(path))
                    .map(([path, content]) => [path, { encoding: 'plain' as const, content }])
            )
        }
        this.updateMemoryAddresses()
    }

    /**
     * The Core's own Poke transaction
     * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)): every register, register
     * file and memory value written between the two calls becomes one entry of the same history the
     * instructions live in, and `endPoke` answers whether there was a change worth recording.
     */
    _beginPoke(): void {
        this.requireCore().beginPoke()
    }

    _endPoke(): boolean {
        const core = this.requireCore()
        //blink answers whether the Poke changed anything, and answers it with a history of zero
        //too, where the entry it pushed is dropped as an instruction's is. The editor's contract is
        //whether an entry was kept, which is what the Undo the caller offers reverts, so the Core's
        //own history is asked as well
        return core.endPoke() && core.canUndo()
    }

    async _checkCode(sources: BuildSources): Promise<Diagnostic[]> {
        const kind = executableKind(sources.files[sources.entry])
        if (kind === 'supported') return []
        if (kind !== 'none') return [executableDiagnostic(sources.entry, kind.unsupported)]
        if (!this.core && !this.diagnosticCore) return []
        //what stops the Build stops the check too, and `semanticCheck` reports it the same way
        if (sources.assemblyError) throw new ProjectFormatError(sources.assemblyError)
        const currentCheck = this.checkCodeQueue.then(async () => {
            await prepareX86Runtime(sources)
            const checker = await this.getDiagnosticCore()
            const errors = await checker.checkProject(x86CoreProject(sources))
            return errors.map((error) => mapCoreDiagnosticToProject(sources, error))
        })
        this.checkCodeQueue = currentCheck.catch(() => undefined).then(() => undefined)
        return currentCheck
    }

    /**
     * Loads the Runtime library a Build links, or the list of library functions that explains an
     * undefined `printf` in a Build that does not link it.
     */
    async _prepareBuild(sources: BuildSources): Promise<void> {
        if (executableKind(sources.files[sources.entry]) !== 'none') return
        if (sources.runtimeAbi === undefined) await loadRuntimeFunctions(CURRENT_RUNTIME_ABI)
        else await prepareX86Runtime(sources)
    }

    async _compile(sources: BuildSources): Promise<CompileResult> {
        this.compiling = true
        try {
            return await this.compileSources(sources)
        } finally {
            this.compiling = false
            if (this.clearAfterCompile) {
                this.clearAfterCompile = false
                this.requireCore().clearExecution()
            }
            if (this.disposeAfterCompile) this.disposeCores()
        }
    }

    private async compileSources(sources: BuildSources): Promise<CompileResult> {
        const core = this.requireCore()
        //an Executable Entry is loaded, not assembled, so nothing about assembly can stop it:
        //this is the order `_checkCode` takes too, so the live check and the Build agree
        const kind = executableKind(sources.files[sources.entry])
        if (kind !== 'none') {
            if (kind !== 'supported')
                return {
                    ok: false,
                    report: kind.unsupported,
                    diagnostics: [executableDiagnostic(sources.entry, kind.unsupported)]
                }
            const file = sources.files[sources.entry]
            const document = this._listings!.openExecutable(sources.entry, file)!
            const [info] = await Promise.all([
                //the Executable's own File can be read but not written, deleted or renamed while
                //it runs
                core.loadExecutable(fileBytes(file), {
                    protectedPath: '/project/' + sources.entry
                }),
                //the debugger shows the Listing and maps every address of the program to it, so
                //the Build waits for it; one that cannot be generated leaves the program running
                //without lines, and its document says why
                document.ready.catch(() => undefined)
            ])
            this._buildLibraryFiles = undefined
            this.loadingExecutable = { path: sources.entry, file, document }
            //the dynamic linker will fail to load the program with its own message, on stderr
            for (const name of info.missing)
                this.addNote({
                    tone: 'warning',
                    text: `${name} is not one of the bundled libraries`
                })
            return {
                ok: true,
                diagnostics: info.missing.map((name) =>
                    executableDiagnostic(
                        sources.entry,
                        `${name} is not one of the bundled libraries`,
                        'warning'
                    )
                )
            }
        }
        //sources that could not be resolved, such as Generated assembly that needs a Runtime
        //library x86 does not have, are reported as GenericEmulator reports any ProjectFormatError
        if (sources.assemblyError) throw new ProjectFormatError(sources.assemblyError)
        const linked = linksX86StartUnit(sources)
        const result = await core.compileProject(x86CoreProject(sources))
        // Carried on both outcomes: a build that succeeded with warnings is the
        // case where they are worth reading.
        const diagnostics = result.diagnostics.map((diagnostic) =>
            coreDiagnosticToDiagnostic(sources, diagnostic)
        )
        if (!('errors' in result)) {
            //the start unit is no File of the Project, so the debugger reads it from here
            const library = sources.runtimeAbi
                ? loadedRuntimeLibrary(sources.runtimeAbi, 'X86')
                : undefined
            this._buildLibraryFiles = library
                ? Object.fromEntries(
                      Object.entries(library.members).map(([path, content]) => [
                          path,
                          { encoding: 'plain' as const, content }
                      ])
                  )
                : linked || sources.x86Support
                  ? X86_START_UNIT_FILES
                  : undefined
            return { ok: true, diagnostics }
        }
        return { ok: false, diagnostics, report: result.report }
    }

    _initialize(undoSize: number): void {
        const core = this.requireCore()
        this.undoSize = Number.isFinite(undoSize) ? Math.max(0, Math.floor(undoSize)) : 0
        core.initialize(this.undoSize)
        this.recordingRandom = true
        this.undoRecording = true
    }

    _dispose(): void {
        if (this.compiling) {
            this.disposeAfterCompile = true
            return
        }
        this.disposeCores()
    }

    private disposeCores(): void {
        this.core?.dispose()
        this.diagnosticCore?.dispose()
        this.core = null
        this.diagnosticCore = null
    }

    /**
     * The Core's Call stack, each frame on its Listing line. A frame in a library whose Listing
     * has not been made keeps the Core's name and no line: going to it makes the Listing then.
     */
    _getCallStack(): StackFrame[] {
        const entry = this.buildSources?.entry ?? this._sources.entry
        return (
            this.core?.getCallStack().map((frame) => {
                const located = this.locate(frame.target, false)
                if (!located) return { ...frame, file: frame.file || entry }
                //a frame is a function: named, and gone to, as its Listing labels it, at where its
                //call went, which no symbol may start (a PLT stub after `_init`)
                const { listing, base } = located
                const start = listing && located.line >= 0 && functionAtLine(listing, located.line)
                const named = start && start.address + base === Number(frame.target)
                return {
                    ...frame,
                    name: named ? start.name : frameName(frame),
                    address: frame.target,
                    file: located.file || undefined,
                    line: named ? start.line : located.line
                }
            }) ?? []
        )
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        if (!this.core) return { decorations: [], code: '' }
        const compiled = this.core.getCompiledCode()
        const file = this.buildSources?.entry ?? this._sources.entry
        return {
            decorations: compiled.decorations.map((decoration) => ({ ...decoration, file })),
            code: compiled.code
        }
    }

    protected _getBuildArtifacts(): BuildArtifact[] {
        const core = this.core
        if (!core) return []
        const fallback = this.buildSources?.entry ?? this._sources.entry
        return core.getCompiledInstructions().flatMap((instruction) => {
            const file = instruction.file || fallback
            const bytes = instruction.bytes ?? new Uint8Array()
            if (instruction.lineNumber < 0 || bytes.length === 0) return []
            return [
                {
                    file,
                    line: instruction.lineNumber,
                    address: instruction.address,
                    opcode: [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
                }
            ]
        })
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        return (
            this.core?.getFlags().map((flag) => ({ ...flag })) ?? structuredClone(DEFAULT_X86_FLAGS)
        )
    }

    _getInstructionAt(address: bigint): Instruction | null {
        const instruction = this.core?.getInstructionAt(address)
        return instruction ? this.withLocation(instruction) : null
    }

    _getNextInstruction(): Instruction | null {
        //a loaded Executable that ended runs nothing next: its program counter rests in libc's
        //`_exit`, whose Listing would otherwise be made at every end
        if (this.executable && this.core?.hasTerminated()) return null
        const instruction = this.core?.getNextInstruction()
        return instruction ? this.withLocation(instruction) : null
    }

    /**
     * An instruction's File and line: for a loaded Executable, the Listing line of its address
     * (`locate`); for an assembled program, the line the Core read from DWARF, in the Entry when
     * the Core names no File.
     */
    private withLocation<T extends { address: bigint; file?: string; lineNumber: number }>(
        instruction: T
    ): T & { file: string } {
        const located = this.locate(instruction.address)
        if (located) return { ...instruction, file: located.file, lineNumber: located.line }
        return {
            ...instruction,
            file: instruction.file || this.buildSources?.entry || this._sources.entry
        }
    }

    /**
     * Where an address of a loaded Executable's run is shown: the line of the Executable's
     * Listing inside it, the line of a library's Listing under `@lib/` inside one (generated the
     * first time the run is there, with line -1 until it is ready, when the current line is read
     * again), and no File anywhere else, such as code on the stack. Undefined for an assembled
     * program, whose lines the Core knows. With `generate` false a library's Listing that has not
     * been made is not: the address is in its `@lib/` File with line -1, which the Call stack and
     * the History show until the person goes there.
     */
    private locate(address: bigint, generate = true): ListingLocation | undefined {
        const executable = this.executable
        if (!executable) return undefined
        const object = this.objectAt(address)
        const located = object
            ? object.main
                ? this.programListing(executable, object)
                : generate
                  ? this.libraryListing(object)
                  : this.madeLibraryListing(object)
            : undefined
        if (!located && object && !object.main)
            return { file: libraryListingPath(object), line: -1, base: Number(object.base) }
        if (!located) return { file: '', line: -1, base: 0 }
        const { path, document } = located
        const listing = document.listing
        return {
            file: path,
            line: listing ? lineOfAddress(listing, Number(address) - document.base) : -1,
            listing,
            base: document.base
        }
    }

    /** The loaded object holding an address, reading the Core's list again when none does. */
    private objectAt(address: bigint): X86LoadedObject | undefined {
        const holding = (objects: X86LoadedObject[] | undefined) =>
            objects?.find((object) => address >= object.base && address < object.end)
        let object = holding(this.loadedObjects)
        if (!object && this.core) {
            this.loadedObjects = this.core.getLoadedObjects()
            object = holding(this.loadedObjects)
        }
        return object
    }

    /**
     * The Executable's Listing, generated again at the address the program was really loaded at
     * when that is not the planned one.
     */
    private programListing(executable: LoadedExecutable, object: X86LoadedObject) {
        const base = Number(object.base)
        if (executable.document.base !== base && this._listings) {
            executable.document = this._listings.open({
                name: executable.document.name,
                base,
                content: executable.file.content,
                bytes: () => fileBytes(executable.file)
            })
            this.listingOpened(executable.path, executable.document)
        }
        return { path: executable.path, document: executable.document }
    }

    /** A library's Listing, under `@lib/<soname>`, generated the first time the run is in it. */
    private libraryListing(object: X86LoadedObject) {
        const listings = this._listings
        const core = this.core
        if (!listings || !core) return undefined
        const path = libraryListingPath(object)
        const base = Number(object.base)
        let document = listings.session.get(path)
        if (document?.base !== base) {
            document = listings.open({
                name: path.slice(path.lastIndexOf('/') + 1),
                base,
                //the Core bundles one build of each library, so its path names its bytes
                content: object.path,
                bytes: () => core.getLoadedObjectBytes(object.path) ?? new Uint8Array()
            })
            this.listingOpened(path, document)
        }
        return { path, document }
    }

    /** A library's Listing if this run has made it already. */
    private madeLibraryListing(object: X86LoadedObject) {
        const path = libraryListingPath(object)
        const document = this._listings?.session.get(path)
        return document?.base === Number(object.base) ? { path, document } : undefined
    }

    /**
     * Whether an address is library code a Step runs through: in a library the program loaded, or
     * in its own PLT, whose stubs only jump into one; code the program put anywhere else, such as
     * on the stack, is its own. For an assembled program, an address the Core places in a File
     * under `@runtime/`.
     */
    private isLibraryAddress(address: bigint): boolean {
        if (!this.executable) return isLibraryCodeFile(this.core?.getInstructionAt(address)?.file)
        const object = this.objectAt(address)
        if (!object) return false
        if (!object.main) return true
        const offset = Number(address - object.base)
        return this.trampolines.some(([start, end]) => offset >= start && offset < end)
    }

    /**
     * Answered from the objects the program mapped, which a Step through library code reads once
     * rather than once per instruction, and which never makes a library's Listing.
     */
    _nextInLibraryCode(): boolean | undefined {
        if (!this.executable || !this.core) return undefined
        return this.isLibraryAddress(this.core.getPc())
    }

    /** `main` from the Listing (a symbol or the `_start` pattern), else the entry point. */
    _programStart(): { breakpoint: SourceBreakpoint; name: string } | undefined {
        const executable = this.executable
        if (!executable) return undefined
        const listing = executable.document.listing
        const main = listing?.main
        const address = main ?? listing?.entry ?? Number(executableAnalysis(executable.file).entry)
        return {
            breakpoint: { file: executable.path, address },
            name: main === undefined ? 'its entry point' : 'main'
        }
    }

    /**
     * The call instruction of the innermost Call stack frame whose return address is program
     * code: where the program called into the library code it is stopped in, the PLT call in
     * `main` for a read waiting inside libc's `fgets`. None for a stop in the Executable's own
     * bytes, its PLT included, where a Breakpoint may be: that is shown where it is.
     */
    _libraryCallSite(): Instruction | null {
        const core = this.core
        if (!core) return null
        if (this.executable && this.objectAt(core.getPc())?.main) return null
        const frames = core.getCallStack()
        for (let i = frames.length - 1; i >= 0; i--) {
            const returnAddress = frames[i].destination
            if (this.isLibraryAddress(returnAddress)) continue
            return this.callBefore(returnAddress)
        }
        return null
    }

    /** The instruction that ends where a return address begins, the call that pushed it. */
    private callBefore(returnAddress: bigint): Instruction | null {
        const located = this.locate(returnAddress - 1n)
        if (!located) {
            //an assembled program: the line DWARF gives the call's last byte
            const call = this._getInstructionAt(returnAddress - 1n)
            return call && call.lineNumber >= 0 ? call : null
        }
        const start = located.listing && instructionAddressAt(located.listing, located.line)
        if (start === undefined) return null
        return this._getInstructionAt(BigInt(start + located.base))
    }

    /**
     * A Step's stretch of library code, named in the History after what it called: the function
     * a PLT stub of the Executable jumps to and the library its GOT slot leads to now the call
     * has bound it (`puts in libc.so.6`), or for a call straight into a library the symbol it
     * entered.
     */
    _libraryStretchName(entered: ExecutionStep): string | undefined {
        const core = this.core
        const executable = this.executable
        if (!core || !executable) return undefined
        const pc = BigInt(entered.pc)
        const object = this.objectAt(pc)
        if (!object) return undefined
        if (!object.main) return libraryFunctionName(core, pc, object)
        const offset = pc - object.base
        const stub = executableAnalysis(executable.file).plt.find(
            (candidate) => candidate.address === offset
        )
        if (!stub) return undefined
        const name = stub.name.replace(/@plt(_resolver)?$/, '')
        try {
            const slot = core.readMemoryBytes(stub.got + object.base, 8n)
            const target = new DataView(slot.buffer, slot.byteOffset, 8).getBigUint64(0, true)
            const library = this.objectAt(target)
            if (library && !library.main) return `${name} in ${libraryName(library)}`
        } catch {
            //an unreadable slot names the function alone
        }
        return name
    }

    /** A running program's Listing, which once ready says where the program is. */
    private listingOpened(path: string, document: ListingDocument): void {
        this._listings?.session.set(path, document)
        if (document.status === 'generating')
            document.ready.then(
                () => {
                    if (this._listings?.session.get(path) === document) this.relocateInstructions()
                },
                () => undefined
            )
    }

    /** The address a loaded Executable runs at: where the Core mapped it, or else the planned one. */
    private programBase(executable: LoadedExecutable): bigint {
        const main =
            this.loadedObjects?.find((object) => object.main) ??
            this.core?.getLoadedObjects().find((object) => object.main)
        return main?.base ?? BigInt(executable.document.base)
    }

    /**
     * The Breakpoints the Core stops on. A loaded Executable's are addresses of its Listing,
     * relocated to where it runs; a line of its Listing, which the coding agent may set, stands for
     * the instruction on it. An assembled program's lines go to the Core, which maps them through
     * DWARF.
     */
    private coreBreakpoints(breakpoints: readonly SourceBreakpoint[]): X86Breakpoint[] {
        const executable = this.executable
        if (!executable)
            return breakpoints
                .filter(isLineBreakpoint)
                .map(({ file, line }) => ({ path: file, line }))
        const listing = executable.document.listing
        const base = this.programBase(executable)
        return breakpoints.flatMap((breakpoint) => {
            if (breakpoint.file !== executable.path) return []
            const address = isLineBreakpoint(breakpoint)
                ? listing && instructionAddressAt(listing, breakpoint.line)
                : breakpoint.address
            return address === undefined ? [] : [{ address: BigInt(address) + base }]
        })
    }

    /**
     * Which instruction the current line follows when the newest history entry is a Poke, which has
     * no line of its own: the last executed instruction is the newest `instruction` entry, not the
     * newest entry ([the design record](../../../../../../docs/design/pokes.md)). Blink reports no last
     * instruction of its own, and with an instruction on top there is nothing to skip, so the answer
     * is left to the caller's own fallback — the instruction about to run — as it was before Pokes.
     */
    _getLastInstruction(): Instruction | null {
        //a crash is shown where it happened, which the Core records as the newest instruction; in
        //a loaded library's code too, whose Listing is made for it (decision 18), as the History's
        //rows, which the caller would read otherwise, do not make one
        const reason = this.core?.stopReason
        if (reason?.kind === 'signal' && reason.address !== undefined)
            return this._getInstructionAt(reason.address)
        if (this.core?.getUndoHistory(1)[0]?.kind !== 'poke') return null
        const history = this.core.getUndoHistoryRange(1, LAST_INSTRUCTION_LOOKBACK - 1)
        const executed = history.find((step) => step.kind === 'instruction')
        if (!executed) return null
        return this._getInstructionAt(BigInt(executed.pc))
    }

    _getPc(): bigint {
        return this.core?.getPc() ?? 0n
    }

    /**
     * One block read per file rather than one shared by both: the Core copies the whole 356 byte
     * block over the bridge in a single call, so a refresh costs two of them, and sharing one read
     * would mean caching a block without being told when a refresh begins. The raw block is
     * decoded here instead of asking for `getFpuState`, because the x87 tag word that says which
     * stack slots hold a value is read from the very same bytes, and the blanks are wanted on
     * every refresh the values are.
     */
    _getRegisterFileValues(id: string): bigint[] {
        const names = registerFileNames(id)
        if (!this.core) return new Array(names.length).fill(0n)
        const block = this.core.runtime.getFpuStateRaw()
        if (id === 'x87') this.x87Blanks = readLogicalStTags(block).map(isEmptyStTag)
        return fpuStateValues(id, decodeFpuState(block))
    }

    /**
     * An x87 stack slot the tag word marks empty holds whatever it last held, commonly a NaN, so
     * the panel shows the row blank the way gdb's `info float` prints Empty. The control, status
     * and tag words always hold a value, and no SSE register ever blanks.
     */
    _getRegisterFileBlanks(id: string): boolean[] {
        const names = registerFileNames(id)
        if (id !== 'x87') return []
        //the stack is the first eight names of the file and the three words after it never blank
        return names.map((_, index) => this.x87Blanks[index] ?? false)
    }

    _getRegisterValue(
        register: X86RegisterName,
        size: RegisterSize | undefined = RegisterSize.Double
    ): bigint {
        return this.requireCore().getRegisterValue(
            normalizeRegisterName(register),
            toCoreRegisterSize(size)
        )
    }

    _getRegisterValues(): bigint[] {
        return this.core?.getRegisterValues() ?? new Array(this._registerNames.length).fill(0n)
    }

    _getRegisterValuesRecord(): Record<X86RegisterName, bigint> {
        if (!this.core) {
            return Object.fromEntries(
                this._registerNames.map((register) => [register, 0n])
            ) as Record<X86RegisterName, bigint>
        }
        return this.core.getRegisterValuesRecord()
    }

    _getMemoryLayout() {
        const layout = this.core!.getMemoryLayout()
        const items: import('../commonLanguageFeatures.svelte').MemoryLayoutItem[] = []
        for (let i = 0; i < layout.items.length; i += 5)
            items.push({
                start: layout.items[i],
                length: layout.items[i + 1],
                kind: (['code', 'data', 'reserved'] as const)[Number(layout.items[i + 2])],
                section: layout.sections[Number(layout.items[i + 3])],
                alignment: layout.items[i + 4]
            })
        return memoryLayoutFromItems(
            items,
            layout.symbols.map((symbol) => ({
                ...symbol,
                section: layout.sections[symbol.section]
            }))
        )
    }
    _getHeapBounds() {
        const core = this.core
        return core ? { start: core.getHeapStart(), end: core.getHeapBreak() } : undefined
    }
    _getStackTop() {
        return this.core?.getStackTop() ?? 0n
    }
    _resolveMemoryLabel(name: string) {
        return this.core?.resolveMemoryLabel(name)
    }

    _getSp(): bigint {
        return this.core?.getSp() ?? 0n
    }

    _getStatus(): EmulatorStatus {
        return toLocalStatus(this.core?.getStatus() ?? CoreEmulatorStatus.NotReady)
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        return this._getUndoHistoryRange(0, max)
    }

    _getUndoHistoryRange(skip: number, max: number): ExecutionStep[] {
        const entry = this.buildSources?.entry ?? this._sources.entry
        return (
            this.core?.getUndoHistoryRange(skip, max).map((step) => {
                const mapped = mapExecutionStep(step)
                //a Poke ran no instruction, so it has no line of its own even though the Core reads
                //one off the pc the machine is parked on, and the History row draws no PC line for
                //it ([the design record](../../../../../../docs/design/pokes.md))
                if (mapped.kind === 'poke') {
                    //a Poke that rewrote one instruction of the Executable reads as the patch it is
                    const [write, ...others] = mapped.writes ?? []
                    const title =
                        write?.type === 'memory' && !others.length
                            ? this.patcher.title(write)
                            : undefined
                    return { ...mapped, line: -1, file: undefined, ...(title ? { title } : {}) }
                }
                //a row in a library whose Listing has not been made has no line until it is gone to
                const located = this.locate(BigInt(step.pc), false)
                if (located)
                    return { ...mapped, file: located.file || undefined, line: located.line }
                return { ...mapped, file: step.file || entry }
            }) ?? []
        )
    }

    _hasTerminated(): boolean {
        return this.core?.hasTerminated() ?? true
    }

    /** The Core's stop reason: an exit with its status, or the signal that ended the program. */
    _getTermination(): Termination | undefined {
        const core = this.core
        if (!core?.hasTerminated()) return undefined
        const reason = core.stopReason
        if (reason?.kind === 'exit') return { kind: 'exit', code: reason.exitCode }
        if (reason?.kind === 'signal' && reason.signal)
            return {
                kind: 'signal',
                number: reason.signal.number,
                name: reason.signal.name,
                description: reason.signal.description
            }
        return { kind: 'end' }
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        try {
            return this.requireCore().readMemoryBytes(address, length)
        } catch (e) {
            if (String(e).includes('virtual address is not mapped')) {
                return new Uint8Array(Number(length)).fill(0)
            }
            throw e
        }
    }

    /** Completed guest-instruction deltas exclude tool execution and work with history disabled. */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const budget = Math.min(
            this.undoSize > 0 && this.undoRecording
                ? X86_MAX_SLICE_INSTRUCTIONS_WITH_UNDO
                : X86_MAX_SLICE_INSTRUCTIONS_WITHOUT_UNDO,
            sliceInstructionBudget(request, X86_INSTRUCTIONS_PER_MS)
        )
        const core = this.requireCore()
        const before = core.getInstructionsExecuted()
        const breakpoints = this.coreBreakpoints(request.breakpoints)
        this.loadedObjects = undefined
        const status = await this.runWithInput(budget, breakpoints, request.skipBreakpointAtPc)
        const instructions = Number(core.getInstructionsExecuted() - before)
        if (status === CoreEmulatorStatus.Running)
            return {
                reason: core.stopReason?.kind === 'breakpoint' ? 'breakpoint' : 'budget',
                instructions
            }
        return { reason: 'terminated', instructions }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        await this.runWithInput(haltLimit <= 0 ? Number.MAX_SAFE_INTEGER : haltLimit, [])
    }

    /**
     * Writes one register back through the block it was read from, so the values the write does not
     * name survive it, as do the x87 pointers `X86FpuState` does not carry.
     */
    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        const core = this.requireCore()
        core.setFpuState(withFpuRegisterValue(id, core.getFpuState(), register, value))
    }

    _setRegisterValue(
        register: X86RegisterName,
        value: bigint,
        size: RegisterSize | undefined = RegisterSize.Double
    ): void {
        this.requireCore().setRegisterValue(
            normalizeRegisterName(register),
            value,
            toCoreRegisterSize(size)
        )
    }

    async _step(): Promise<{ terminated: boolean }> {
        const core = this.requireCore()
        const execution = this.executionController.capture()
        await this.executionController.waitFor(execution, () => core.step())
        await this.finishBlockedInstruction(execution)
        return { terminated: core.hasTerminated() }
    }

    _stringifyError(error: unknown, _line?: number): string {
        if (error instanceof Error) return error.message
        return String(error)
    }

    _undo(): void {
        const core = this.requireCore()
        const step = core.getUndoHistory(1)[0]
        core.undo() // Native preflight runs before either CPU or Random source changes.
        const position = step && this.randomPositions.get(step.serial)
        if (position !== undefined) this._peripherals.random.seek(position)
        if (step) this.randomPositions.delete(step.serial)
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireCore().writeMemoryBytes(address, data)
        //a Poke into the Executable's code shows on its Listing line
        this.patcher.touched(address, data.length)
    }

    /** Also reads the patched lines of the running Executable's Listing again. */
    protected updateData(): void {
        super.updateData()
        this.patcher?.refresh()
    }

    private async runWithInput(
        limit: number,
        breakpoints: X86Breakpoint[],
        skipBreakpointAtPc = false
    ): Promise<CoreEmulatorStatus> {
        const core = this.requireCore()
        const execution = this.executionController.capture()
        const before = core.getInstructionsExecuted()
        for (;;) {
            const remaining = limit - Number(core.getInstructionsExecuted() - before)
            if (remaining <= 0) return core.getStatus()
            const status = await this.executionController.waitFor(execution, () =>
                core.run(remaining, breakpoints, { skipBreakpointAtPc })
            )
            skipBreakpointAtPc = false
            if (
                status !== CoreEmulatorStatus.WaitingForInput &&
                status !== CoreEmulatorStatus.Waiting
            ) {
                if (core.hasTerminated()) this.cancelInputRead()
                return status
            }
            await this.finishBlockedInstruction(execution)
            if (core.hasTerminated()) return core.getStatus()
        }
    }

    /** Keep one canonical read across EINTR and signal handlers, including its unsubmitted draft.
     * Give Core the whole released line; Core owns byte splitting, EOF tokens and dup/readv queues.
     */
    private async finishBlockedInstruction(execution: ExecutionGeneration): Promise<void> {
        const core = this.requireCore()
        while (
            core.getStatus() === CoreEmulatorStatus.WaitingForInput ||
            core.getStatus() === CoreEmulatorStatus.Waiting
        ) {
            const status = core.getStatus()
            const acceptsInput =
                status === CoreEmulatorStatus.WaitingForInput || core.getWaitRequest()?.acceptsInput
            let off = () => {}
            const changed = new Promise<'changed'>((resolve) => {
                off = core.on('stateChange', () => resolve('changed'))
            })
            try {
                if (acceptsInput) {
                    this.refreshInputState()
                    this.state.interrupt = {
                        type: 'StandardInput',
                        message: STANDARD_INPUT_QUESTION
                    }
                    this.inputRead ??= {
                        execution,
                        promise: this._peripherals.terminal.readStandardInput(
                            Number.MAX_SAFE_INTEGER,
                            STANDARD_INPUT_QUESTION,
                            execution
                        )
                    }
                    const read = this.inputRead
                    const result = await this.executionController.waitFor(execution, () =>
                        Promise.race([changed, read.promise.then((bytes) => ({ bytes }))])
                    )
                    if (result !== 'changed' && this.inputRead === read) {
                        this.inputRead = null
                        core.provideInput(result.bytes.length === 0 ? END_OF_INPUT : result.bytes)
                    }
                } else await this.executionController.waitFor(execution, () => changed)
                this.executionController.ensureCurrent(execution)
                if (this.waitError !== undefined) {
                    const error = this.waitError
                    this.waitError = undefined
                    throw error
                }
            } finally {
                off()
                this.state.interrupt = undefined
            }
        }
        if (core.hasTerminated()) this.cancelInputRead()
    }

    private cancelInputRead(): void {
        this.inputRead = null
        this._peripherals.terminal.cancelPendingInput()
        this.state.interrupt = undefined
    }

    private async waitForClock(request: X86WaitRequest, signal: AbortSignal): Promise<void> {
        if (request.deadlineNanoseconds === null) {
            if (this._peripherals.clock.isVirtual && !request.acceptsInput)
                throw new Error('An indefinite x86 wait has no external wake source in a Testcase')
            await new Promise<void>((_resolve, reject) => {
                const abort = () => reject(signal.reason ?? new Error('Wait aborted'))
                if (signal.aborted) abort()
                else signal.addEventListener('abort', abort, { once: true })
            })
            return
        }
        const now = this._peripherals.clock.now()
        const nanoseconds = request.deadlineNanoseconds - BigInt(Math.floor(now * 1e6))
        const milliseconds = nanoseconds <= 0n ? 0 : Number(nanoseconds) / 1e6
        if (!Number.isFinite(milliseconds) || milliseconds > Number.MAX_SAFE_INTEGER)
            throw new Error('x86 wait deadline exceeds the Time Source range')
        if (this._peripherals.clock.isVirtual && milliseconds > 0 && now + milliseconds === now)
            throw new Error('x86 wait is smaller than virtual clock precision at the current time')
        await this._peripherals.clock.wait(
            this._peripherals.clock.isVirtual
                ? milliseconds
                : Math.min(2147483647, Math.ceil(milliseconds)),
            signal
        )
    }

    private async getDiagnosticCore(): Promise<CoreX86Emulator> {
        this.diagnosticCore ??= await createX86Emulator({ mode: 'NASM_trunk' })
        return this.diagnosticCore
    }

    private requireCore(): CoreX86Emulator {
        if (!this.core) throw new Error('Interpreter not initialized')
        return this.core
    }

    private updateMemoryAddresses(): void {
        const global = this.state.memory.global
        if (!global.userPlaced) {
            global.address = alignDown(this._getSp(), BigInt(global.pageSize))
        }
        const stackTab = this.state.memory.tabs.find((tab) => tab.name === 'Stack')
        if (stackTab && !stackTab.userPlaced) {
            const stackPageSize = BigInt(stackTab.pageSize)
            stackTab.address = alignDown(this._getSp(), stackPageSize)
        }
    }
}

type LoadedExecutable = { path: string; file: ProjectFile; document: ListingDocument }

/** The sections a linker puts PLT stubs in: lazy `.plt`, `.plt.sec` with CET, `.plt.got`, `.iplt`. */
const PLT_SECTIONS = new Set(['.plt', '.plt.sec', '.plt.got', '.iplt'])
/** How long a PLT stub is, for an Executable whose section headers are gone. */
const PLT_STUB_SIZE = 16

/**
 * An Executable's PLT as link-time ranges: its PLT sections, or without section headers the stubs
 * the analyser found in its code.
 */
function pltRanges(file: ProjectFile): [start: number, end: number][] {
    const info = executableAnalysis(file)
    const sections = info.sections
        .filter((section) => PLT_SECTIONS.has(section.name) && section.size > 0)
        .map((section): [number, number] => [
            Number(section.address),
            Number(section.address) + section.size
        ])
    if (sections.length > 0 || info.sections.length > 0) return sections
    return info.plt.map((stub): [number, number] => [
        Number(stub.address),
        Number(stub.address) + PLT_STUB_SIZE
    ])
}

/** A frame's name without a Listing: its symbol, and how far into it the call went. */
function frameName(frame: { name: string; address: bigint; target: bigint }): string {
    if (!frame.name || frame.target === frame.address) return frame.name
    return `${frame.name}+0x${(frame.target - frame.address).toString(16)}`
}

/** What a loaded library is called: its soname, as its Listing's path says it. */
function libraryName(object: X86LoadedObject): string {
    return libraryListingPath(object).slice(LIBRARY_LISTING_NAMESPACE.length)
}

/** The function a call into a library entered, by the symbol starting there, and its library. */
function libraryFunctionName(core: CoreX86Emulator, pc: bigint, object: X86LoadedObject): string {
    const symbol = core.runtime.resolveSymbol(pc)
    const library = libraryName(object)
    return symbol && symbol.address === pc && symbol.name ? `${symbol.name} in ${library}` : library
}

/** Where an address is shown, with the Listing it was found in and that Listing's load base. */
type ListingLocation = { file: string; line: number; listing?: Listing; base: number }

function normalizeRegisterName(register: string): X86RegisterName {
    const normalized = register.toLowerCase()
    if (!isX86RegisterName(normalized)) throw new Error(`Unknown X86 register: ${register}`)
    return normalized
}

function isX86RegisterName(register: string): register is X86RegisterName {
    return X86_REGISTER_NAMES.some((candidate) => candidate === register)
}

function toCoreRegisterSize(size: RegisterSize | undefined): CoreRegisterSize {
    switch (size) {
        case RegisterSize.Byte:
            return CoreRegisterSize.Byte
        case RegisterSize.Word:
            return CoreRegisterSize.Word
        case RegisterSize.Long:
            return CoreRegisterSize.Long
        case RegisterSize.Quad:
            return CoreRegisterSize.Quad
        case RegisterSize.Double:
        default:
            return CoreRegisterSize.Double
    }
}

function toLocalRegisterSize(size: CoreRegisterSize): RegisterSize {
    switch (size) {
        case CoreRegisterSize.Byte:
            return RegisterSize.Byte
        case CoreRegisterSize.Word:
            return RegisterSize.Word
        case CoreRegisterSize.Long:
            return RegisterSize.Long
        //an SSE register write: the undo history names it `xmm<n>` and the panel shows it 16 bytes
        //wide, so the width has to survive the crossing
        case CoreRegisterSize.Quad:
            return RegisterSize.Quad
        case CoreRegisterSize.Double:
        default:
            return RegisterSize.Double
    }
}

/**
 * How far back `_getLastInstruction` looks for the instruction under a run of Pokes. Deep enough for
 * any hand-made run of them, and it is read only when the program stopped with a Poke on top, which
 * costs nothing on the stepping path.
 */
const LAST_INSTRUCTION_LOOKBACK = 32

/** The x87 stack holds eight slots, whatever the tag word says about them. */
const X87_STACK_DEPTH = 8

/** The two bit x87 tag that means the slot holds nothing, as `readLogicalStTags` documents it. */
const X87_TAG_EMPTY = 0b11

function isEmptyStTag(tag: number): boolean {
    return tag === X87_TAG_EMPTY
}

const WORD_MASK = 0xffffn
const LONG_MASK = 0xffffffffn
const QUAD_MASK = (1n << 128n) - 1n

//one buffer for the module: an x87 row is a double on the way out and a bit pattern on the way in,
//and the panel converts eight of them on every refresh
const doubleBits = new DataView(new ArrayBuffer(8))

function registerFileNames(id: string): readonly string[] {
    if (id === 'sse') return X86_SSE_REGISTERS
    if (id === 'x87') return X86_X87_REGISTERS
    throw new Error(`Unknown X86 register file: ${id}`)
}

/**
 * One file's values as unsigned bit patterns, in the order its descriptor lists them. The x87 stack
 * arrives decoded as doubles, so it goes back to the IEEE 754 bits the panel renders and diffs.
 */
function fpuStateValues(id: string, state: X86FpuState): bigint[] {
    if (id === 'sse') return [...state.xmm, BigInt(state.mxcsr >>> 0)]
    if (id === 'x87') {
        return [
            ...state.st.map(toDoubleBits),
            BigInt(state.fctrl & 0xffff),
            BigInt(state.fstat & 0xffff),
            BigInt(state.ftag & 0xffff)
        ]
    }
    throw new Error(`Unknown X86 register file: ${id}`)
}

function withFpuRegisterValue(
    id: string,
    state: X86FpuState,
    register: string,
    value: bigint
): X86FpuState {
    const index = registerFileNames(id).indexOf(register)
    if (index < 0) throw new Error(`Unknown X86 ${id} register: ${register}`)
    if (id === 'sse') {
        if (register === 'mxcsr') return { ...state, mxcsr: Number(value & LONG_MASK) }
        const xmm = [...state.xmm]
        xmm[index] = value & QUAD_MASK
        return { ...state, xmm }
    }
    //the first eight names of the x87 file are the stack and the last three the control words
    if (index < 8) {
        const st = [...state.st]
        st[index] = fromDoubleBits(value)
        return { ...state, st }
    }
    const word = Number(value & WORD_MASK)
    if (register === 'fctrl') return { ...state, fctrl: word }
    if (register === 'fstat') return { ...state, fstat: word }
    return { ...state, ftag: word }
}

function toDoubleBits(value: number): bigint {
    doubleBits.setFloat64(0, value, true)
    return doubleBits.getBigUint64(0, true)
}

function fromDoubleBits(bits: bigint): number {
    doubleBits.setBigUint64(0, bits & 0xffffffffffffffffn, true)
    return doubleBits.getFloat64(0, true)
}

function toLocalStatus(status: CoreEmulatorStatus): EmulatorStatus {
    if (status === CoreEmulatorStatus.Terminated) return EmulatorStatus.Terminated
    return EmulatorStatus.Running
}

function sourceLine(sources: BuildSources, source: { path: string; line: number }): string {
    const file = sources.files[source.path]
    return file?.encoding === 'plain' ? (file.content.split(/\r?\n/)[source.line] ?? '') : ''
}

function mapCoreDiagnosticToProject(sources: BuildSources, error: CoreMonacoError): Diagnostic {
    const source = { path: error.file || sources.entry, line: error.lineIndex }
    const line = sourceLine(sources, source)
    const hint = x86DiagnosticHint(error.code)
    return {
        severity: error.severity === 'hint' ? 'suggestion' : (error.severity ?? 'error'),
        file: source.path,
        lineIndex: source.line,
        column: Math.max(1, error.column),
        ...(error.endColumn === undefined ? {} : { endColumn: error.endColumn }),
        ...(error.code ? { code: error.code } : {}),
        line: { line, line_index: source.line },
        message: error.message,
        ...(hint ? { hint } : {}),
        formatted: hint ? `${error.formatted}\n${hint}` : error.formatted
    }
}

function coreDiagnosticToDiagnostic(
    sources: BuildSources,
    diagnostic: X86CompilationDiagnostic
): Diagnostic {
    const source = {
        path: diagnostic.file || sources.entry,
        line: Math.max(0, diagnostic.line - 1)
    }
    const line = sourceLine(sources, source)
    const hint =
        x86DiagnosticHint(diagnostic.warningClass) ?? x86LinkHint(diagnostic.error, sources)
    const span = locateDiagnosticSpan(diagnostic.error, line, diagnostic.warningClass)
    return {
        severity: diagnostic.severity === 'hint' ? 'suggestion' : (diagnostic.severity ?? 'error'),
        file: source.path,
        lineIndex: source.line,
        column: span.column,
        ...(span.endColumn === undefined ? {} : { endColumn: span.endColumn }),
        ...(diagnostic.warningClass ? { code: diagnostic.warningClass } : {}),
        line: {
            line,
            line_index: source.line
        },
        message: diagnostic.error,
        ...(hint ? { hint } : {}),
        formatted: hint ? `${diagnostic.error}\n${hint}` : diagnostic.error
    }
}

const DUPLICATE_START_HINT =
    'Compiled C and C++ start in the start code, `@runtime/start.asm`, which defines `_start` and calls `main`, so a File linked with them may not define `_start` too. Remove this one, or move what the program uses from this File into another.'
const DUPLICATE_MAIN_HINT =
    'Only one File linked into a program may define `main`. If the program needs something else from this File, move it into a File without `main`.'

/**
 * What a second `_start` or `main` means ([the plan](../../../../../../docs/design/x86-compiler-assembly-translation-plan.md),
 * milestone 3a): a File that defines one too was linked, because the program uses something else it
 * defines. `ld` only says there are two. Matched on the words `ld` and the Core both use, whatever
 * line it lands on.
 */
function x86LinkHint(message: string, sources: BuildSources): string | undefined {
    if (/multiple definition of [`']main'/.test(message)) return DUPLICATE_MAIN_HINT
    if (/multiple definition of [`']_start'/.test(message) && linksX86StartUnit(sources))
        return DUPLICATE_START_HINT
    //hand-written assembly links no library by default: say how to get printf
    if (sources.runtimeAbi === undefined)
        return runtimeLibraryHint(message, loadedRuntimeFunctions(CURRENT_RUNTIME_ABI))
    return undefined
}

function mapExecutionStep(step: CoreExecutionStep): ExecutionStep {
    return {
        kind: step.kind,
        undoable: step.undoable,
        mutations: step.mutations.map(mapMutationOperation),
        pc: step.pc,
        old_ccr: { ...step.old_ccr },
        new_ccr: { ...step.new_ccr },
        line: step.line,
        file: step.file,
        ...(step.writes ? { writes: step.writes.map(mapPokeWrite) } : {})
    }
}

/**
 * What a Poke changed, as the History panel reads it. The Core already spells the values the way
 * the panels do — unsigned bit patterns and its own register names, `rax`, `xmm3`, `st0` — so the
 * crossing only copies the byte runs out of the Core's arrays.
 */
function mapPokeWrite(write: CorePokeWrite): PokeWrite {
    if (write.type === 'register') {
        return { type: 'register', name: write.name, old: write.old, new: write.new }
    }
    return {
        type: 'memory',
        address: write.address,
        old: [...write.old],
        new: [...write.new]
    }
}

function mapMutationOperation(operation: CoreMutationOperation): MutationOperation {
    if (operation.type === 'WriteRegister') {
        return {
            type: operation.type,
            value: {
                ...operation.value,
                size: toLocalRegisterSize(operation.value.size)
            }
        }
    }
    if (operation.type === 'WriteMemory') {
        return {
            type: operation.type,
            value: {
                ...operation.value,
                size: toLocalRegisterSize(operation.value.size)
            }
        }
    }
    if (operation.type === 'WriteMemoryBytes') {
        return {
            type: operation.type,
            value: {
                address: operation.value.address,
                old: [...operation.value.old],
                //the bytes the write left, which the Core reports beside the ones it replaced; a
                //write the machine could not account for carries none, and the row shows only the
                //old side, as it did before the Core had a new one to give
                ...(operation.value.new.length > 0 ? { new: [...operation.value.new] } : {})
            }
        }
    }
    return { ...operation }
}

function alignDown(value: bigint, size: bigint): bigint {
    if (size <= 0n) return value
    return value - (value % size)
}

function executableDiagnostic(
    file: string,
    message: string,
    severity: 'error' | 'warning' = 'error'
): Diagnostic {
    return {
        severity,
        file,
        lineIndex: 0,
        column: 1,
        line: { line: '', line_index: 0 },
        message,
        formatted: message
    }
}
