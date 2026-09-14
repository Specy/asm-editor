import {
    EmulatorStatus,
    type CompileResult,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
import {
    type BuildArtifact,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    type MutationOperation,
    type RegisterFileDescriptor,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'
import type { ExecutionGeneration } from '$lib/languages/ExecutionController'
import type { Testcase } from '$lib/Project.svelte'
import {
    BlinkState,
    createX86Emulator,
    decodeFpuState,
    locateDiagnosticColumn,
    readLogicalStTags,
    EmulatorStatus as CoreEmulatorStatus,
    RegisterSize as CoreRegisterSize,
    X86_REGISTER_NAMES,
    X86_SSE_REGISTERS,
    X86_X87_REGISTERS,
    type ExecutionStep as CoreExecutionStep,
    type MonacoError as CoreMonacoError,
    type MutationOperation as CoreMutationOperation,
    type X86CompileResult,
    type X86CompilationDiagnostic,
    type X86Emulator as CoreX86Emulator,
    type X86FpuState,
    type X86RegisterName
} from '@specy/x86'
import structuredClone from '@ungap/structured-clone'
import { x86DiagnosticHint } from './X86-diagnostics'
import { type BuildInput, type BuildSources } from '$lib/projectFiles'
import {
    expandLegacyX86Project,
    stageLegacyX86ProjectFiles,
    toX86Project,
    x86GeneratedLinesFor,
    x86SourceLineAt,
    type X86ProjectDiagnostic,
    type X86ProjectInput,
    type X86SourceLine
} from './x86Project'

/**
 * How many instructions Blink runs in a millisecond, used to turn a slice's time budget into a run
 * limit. Measured in phase 8 on a compute-only loop under node: about 11, two hundred times slower
 * than the estimate this replaces, which held the host for nine tenths of a second per slice and
 * answered Stop seventeen seconds after it was pressed.
 */
const X86_INSTRUCTIONS_PER_MS = 10

/**
 * The Register files x86 holds beside the general registers
 * ([the design record](../../../../docs/design/register-files.md)): the SSE registers and the x87
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

export async function X86Emulator(source: BuildInput, options: EmulatorSettings = {}) {
    let wrapper: AsmEditorX86Emulator | null = null
    const core = await createX86Emulator({
        mode: 'NASM_trunk',
        callbacks: {
            stdout: (charCode) => wrapper?.appendOutput(charCode),
            stderr: (charCode) => wrapper?.appendOutput(charCode)
        }
    })
    wrapper = new AsmEditorX86Emulator(source, options, core)
    return wrapper
}

class AsmEditorX86Emulator extends GenericEmulator<CoreX86Emulator, X86RegisterName> {
    private core: CoreX86Emulator | null = null
    private diagnosticCore: CoreX86Emulator | null = null
    private compileQueue: Promise<void> = Promise.resolve()
    private checkCodeQueue: Promise<void> = Promise.resolve()
    private buildLineMap: X86SourceLine[] = []
    /**
     * Which x87 stack slots were empty in the block the values read decoded. A refresh reads a
     * file's values immediately before its blanks, so the tags cost no second bridge call. Before
     * the first read every slot is empty, which is what a machine that does not exist yet reports.
     */
    private x87Blanks: boolean[] = new Array(X87_STACK_DEPTH).fill(true)

    constructor(source: BuildInput, options: EmulatorSettings, core: CoreX86Emulator) {
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
                stackAddress: options.stackAddress ?? 0x4ffffffffff0n,
                baseAddress: options.baseAddress ?? 0x4ffffffffff0n,
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        this.core = core
        if (this._emulatorOptions.automaticChecking) void this.semanticCheck()
    }

    appendOutput(charCode: number): void {
        if (!this.isProgramOutput()) return
        this._peripherals.terminal.write(String.fromCharCode(charCode))
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

    _canUndo(): boolean {
        return this.core?.canUndo() ?? false
    }

    async _checkCode(sources: BuildSources): Promise<Diagnostic[]> {
        if (!this.core && !this.diagnosticCore) return []
        const currentCheck = this.checkCodeQueue.then(async () => {
            const checker = await this.getDiagnosticCore()
            if (hasNativeProjectApi(checker)) {
                const errors = await checkNativeProject(checker, toX86Project(sources))
                return errors.map((error) => mapCoreDiagnosticToProject(sources, error))
            }
            const expanded = expandLegacyX86Project(sources)
            if (expanded.diagnostics.length > 0) {
                return expanded.diagnostics.map((diagnostic) =>
                    projectDiagnosticToDiagnostic(sources, diagnostic)
                )
            }
            stageLegacyX86ProjectFiles(checker.module, expanded)
            const errors = await checker.checkCode(expanded.code)
            return errors.map((error) =>
                mapCoreDiagnosticToProject(sources, error, expanded.lineMap)
            )
        })
        this.checkCodeQueue = currentCheck.catch(() => undefined).then(() => undefined)
        return currentCheck
    }

    async _compile(sources: BuildSources): Promise<CompileResult> {
        const core = this.requireCore()
        if (!hasNativeProjectApi(core)) return this.compileLegacyProject(core, sources)
        this.buildLineMap = []
        const result = await compileNativeProject(core, toX86Project(sources))
        // Carried on both outcomes: a build that succeeded with warnings is the
        // case where they are worth reading.
        const diagnostics = result.diagnostics.map((diagnostic) =>
            coreDiagnosticToDiagnostic(sources, diagnostic)
        )
        if (!('errors' in result)) return { ok: true, diagnostics }
        return { ok: false, diagnostics, report: result.report }
    }

    _initialize(undoSize: number): void {
        const core = this.requireCore()
        core.initialize(undoSize)
        this.updateMemoryAddresses()
    }

    _dispose(): void {
        this.core?.dispose()
        this.diagnosticCore?.dispose()
        this.core = null
        this.diagnosticCore = null
    }

    _getCallStack(): StackFrame[] {
        const entry = this.buildSources?.entry ?? this._sources.entry
        return (
            this.core?.getCallStack().map((frame) => {
                const file = coreSourceFile(frame)
                if (file) return { ...frame, file }
                const source = x86SourceLineAt(this.buildLineMap, frame.line, entry)
                return { ...frame, line: source.line, file: source.path }
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
        if (!core || !hasCompiledInstructionApi(core)) return []
        const fallback = this.buildSources?.entry ?? this._sources.entry
        return core.getCompiledInstructions().flatMap((instruction) => {
            const file = coreSourceFile(instruction) ?? fallback
            const bytes = coreInstructionBytes(instruction)
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
        if (!instruction) return null
        const file = coreSourceFile(instruction)
        if (file) return { ...instruction, file }
        const source = x86SourceLineAt(
            this.buildLineMap,
            instruction.lineNumber,
            this.buildSources?.entry ?? this._sources.entry
        )
        return {
            ...instruction,
            lineNumber: source.line,
            file: source.path
        }
    }

    _getNextInstruction(): Instruction | null {
        const instruction = this.core?.getNextInstruction()
        if (!instruction) return null
        const file = coreSourceFile(instruction)
        if (file) return { ...instruction, file }
        const source = x86SourceLineAt(
            this.buildLineMap,
            instruction.lineNumber,
            this.buildSources?.entry ?? this._sources.entry
        )
        return {
            ...instruction,
            lineNumber: source.line,
            file: source.path
        }
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

    _getSp(): bigint {
        return this.core?.getSp() ?? 0n
    }

    _getStatus(): EmulatorStatus {
        return toLocalStatus(this.core?.getStatus() ?? CoreEmulatorStatus.NotReady)
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const entry = this.buildSources?.entry ?? this._sources.entry
        return (
            this.core?.getUndoHistory(max).map((step) => {
                const mapped = mapExecutionStep(step)
                const file = coreSourceFile(step)
                if (file) return { ...mapped, file }
                const source = x86SourceLineAt(this.buildLineMap, mapped.line, entry)
                return { ...mapped, line: source.line, file: source.path }
            }) ?? []
        )
    }

    _hasTerminated(): boolean {
        return this.core?.hasTerminated() ?? true
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

    /**
     * Blink has no instruction counter and its `run` stops for input rather than for a clock, so a
     * slice is one `run` with the budget as its limit: exact when it comes back still running, which
     * is the compute-only case the budget exists for. x86 has no Screen, so it never sees the short
     * slice ([screen-peripherals.md](../../../../docs/design/screen-peripherals.md)).
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const budget = sliceInstructionBudget(request, X86_INSTRUCTIONS_PER_MS)
        const breakpoints = hasNativeProjectApi(this.requireCore())
            ? request.breakpoints.map(({ file, line }) => ({ path: file, line }))
            : request.breakpoints.flatMap((breakpoint) =>
                  x86GeneratedLinesFor(this.buildLineMap, breakpoint.file, breakpoint.line)
              )
        const status = await this.runWithInput(budget, breakpoints)
        if (status === CoreEmulatorStatus.Running) {
            //still runnable: either the budget ran out or a breakpoint stopped it, and `run` does
            //not say which. The line the program is about to execute does: a run that stopped on a
            //breakpoint is parked on it
            const next = this._getNextInstruction()
            const onBreakpoint =
                next !== null &&
                request.breakpoints.some(
                    (breakpoint) =>
                        breakpoint.file === next.file && breakpoint.line === next.lineNumber
                )
            return { reason: onBreakpoint ? 'breakpoint' : 'budget', instructions: budget }
        }
        return { reason: 'terminated', instructions: budget }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const limit = haltLimit <= 0 ? Number.MAX_SAFE_INTEGER : haltLimit
        await this.runWithInput(limit, [])
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
        const result = await this.executionController.waitFor(execution, () => core.step())
        if (core.getStatus() === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput(execution)
        }
        this.executionController.ensureCurrent(execution)
        return { terminated: result.terminated || core.hasTerminated() }
    }

    _stringifyError(error: unknown, _line?: number): string {
        if (error instanceof Error) return error.message
        return String(error)
    }

    _undo(): void {
        this.requireCore().undo()
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireCore().writeMemoryBytes(address, data)
    }

    private async runWithInput(
        limit: number | undefined,
        breakpoints: Array<number | { path: string; line: number }>
    ): Promise<CoreEmulatorStatus> {
        const core = this.requireCore()
        const execution = this.executionController.capture()
        let status = await this.executionController.waitFor(execution, () =>
            runX86Core(core, limit, breakpoints)
        )
        while (status === CoreEmulatorStatus.WaitingForInput) {
            await this.provideProgramInput(execution)
            status = await this.executionController.waitFor(execution, () =>
                runX86Core(core, limit, breakpoints)
            )
        }
        return status
    }

    private async provideProgramInput(execution: ExecutionGeneration): Promise<void> {
        const core = this.requireCore()
        const value = await this.requestInput('Program input', execution)
        this.executionController.ensureCurrent(execution)
        core.provideInput(ensureLineInput(value))
    }

    private async getDiagnosticCore(): Promise<CoreX86Emulator> {
        this.diagnosticCore ??= await createX86Emulator({ mode: 'NASM_trunk' })
        return this.diagnosticCore
    }

    private requireCore(): CoreX86Emulator {
        if (!this.core) throw new Error('Interpreter not initialized')
        return this.core
    }

    private async compileLegacyProject(
        core: CoreX86Emulator,
        sources: BuildSources
    ): Promise<CompileResult> {
        const expanded = expandLegacyX86Project(sources)
        this.buildLineMap = expanded.lineMap
        if (expanded.diagnostics.length > 0) {
            return {
                ok: false,
                diagnostics: expanded.diagnostics.map((diagnostic) =>
                    projectDiagnosticToDiagnostic(sources, diagnostic)
                ),
                report: 'NASM Project expansion failed'
            }
        }
        stageLegacyX86ProjectFiles(core.module, expanded)
        const result = await core.compile(expanded.code)
        if (!('errors' in result)) return { ok: true }
        return {
            ok: false,
            diagnostics: result.errors.map((error) =>
                coreDiagnosticToDiagnostic(sources, error, expanded.code, expanded.lineMap)
            ),
            report: result.report
        }
    }

    private updateMemoryAddresses(): void {
        const pageSize = BigInt(this.state.memory.global.pageSize)
        this.state.memory.global.address = alignDown(this._getSp(), pageSize)
        const stackTab = this.state.memory.tabs.find((tab) => tab.name === 'Stack')
        if (stackTab) {
            const stackPageSize = BigInt(stackTab.pageSize)
            stackTab.address = alignDown(this._getSp(), stackPageSize)
        }
    }

    private isProgramOutput(): boolean {
        const state = this.core?.state
        return (
            state !== undefined && state !== BlinkState.Assembling && state !== BlinkState.Linking
        )
    }
}

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

type NativeProjectCore = CoreX86Emulator & {
    compileProject(project: X86ProjectInput): Promise<X86CompileResult>
    checkProject(project: X86ProjectInput): Promise<Array<CoreMonacoError & { file?: string }>>
}

type CompiledInstructionCore = CoreX86Emulator & {
    getCompiledInstructions(): Array<Instruction & { bytes?: Uint8Array; file?: string }>
}

function hasNativeProjectApi(core: CoreX86Emulator): boolean {
    const candidate = core as Partial<NativeProjectCore>
    return (
        typeof candidate.compileProject === 'function' &&
        typeof candidate.checkProject === 'function'
    )
}

function compileNativeProject(
    core: CoreX86Emulator,
    project: X86ProjectInput
): Promise<X86CompileResult> {
    return (core as NativeProjectCore).compileProject(project)
}

function checkNativeProject(
    core: CoreX86Emulator,
    project: X86ProjectInput
): Promise<Array<CoreMonacoError & { file?: string }>> {
    return (core as NativeProjectCore).checkProject(project)
}

function coreSourceFile(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || !('file' in value)) return undefined
    return typeof value.file === 'string' ? value.file : undefined
}

function hasCompiledInstructionApi(core: CoreX86Emulator): core is CompiledInstructionCore {
    return typeof (core as Partial<CompiledInstructionCore>).getCompiledInstructions === 'function'
}

function coreInstructionBytes(value: unknown): Uint8Array {
    if (!value || typeof value !== 'object' || !('bytes' in value)) return new Uint8Array()
    return value.bytes instanceof Uint8Array ? value.bytes : new Uint8Array()
}

function runX86Core(
    core: CoreX86Emulator,
    limit: number | undefined,
    breakpoints: Array<number | { path: string; line: number }>
): Promise<CoreEmulatorStatus> {
    return (
        core.run as (
            limit?: number,
            breakpoints?: Array<number | { path: string; line: number }>
        ) => Promise<CoreEmulatorStatus>
    )(limit, breakpoints)
}

function sourceLine(sources: BuildSources, source: { path: string; line: number }): string {
    const file = sources.files[source.path]
    return file?.encoding === 'plain' ? (file.content.split(/\r?\n/)[source.line] ?? '') : ''
}

function mapCoreDiagnosticToProject(
    sources: BuildSources,
    error: CoreMonacoError,
    lineMap: readonly X86SourceLine[] = []
): Diagnostic {
    const file = coreSourceFile(error)
    const source = file
        ? { path: file, line: error.lineIndex }
        : x86SourceLineAt(lineMap, error.lineIndex, sources.entry)
    const line = sourceLine(sources, source)
    const hint = x86DiagnosticHint(error.code)
    return {
        severity: error.severity ?? 'error',
        file: source.path,
        lineIndex: source.line,
        column: Math.max(1, error.column),
        ...(error.code ? { code: error.code } : {}),
        line: { line, line_index: source.line },
        message: error.message,
        ...(hint ? { hint } : {}),
        formatted: hint ? `${error.formatted}\n${hint}` : error.formatted
    }
}

function coreDiagnosticToDiagnostic(
    sources: BuildSources,
    diagnostic: X86CompilationDiagnostic,
    code = '',
    lineMap: readonly X86SourceLine[] = []
): Diagnostic {
    const generatedLine = Math.max(0, diagnostic.line - 1)
    const file = coreSourceFile(diagnostic)
    const source = file
        ? { path: file, line: generatedLine }
        : x86SourceLineAt(lineMap, generatedLine, sources.entry)
    const line = sourceLine(sources, source) || code.split('\n')[generatedLine] || ''
    const hint = x86DiagnosticHint(diagnostic.warningClass)
    return {
        severity: diagnostic.severity ?? 'error',
        file: source.path,
        lineIndex: source.line,
        column: locateDiagnosticColumn(diagnostic.error, line, diagnostic.warningClass),
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

function projectDiagnosticToDiagnostic(
    sources: BuildSources,
    diagnostic: X86ProjectDiagnostic
): Diagnostic {
    const source = { path: diagnostic.path, line: diagnostic.line }
    const line = sourceLine(sources, source)
    return {
        severity: 'error',
        file: diagnostic.path,
        lineIndex: diagnostic.line,
        column: diagnostic.column + 1,
        line: { line, line_index: diagnostic.line },
        message: diagnostic.message,
        formatted: diagnostic.message
    }
}

function mapExecutionStep(step: CoreExecutionStep): ExecutionStep {
    return {
        mutations: step.mutations.map(mapMutationOperation),
        pc: step.pc,
        old_ccr: { ...step.old_ccr },
        new_ccr: { ...step.new_ccr },
        line: step.line,
        file: coreSourceFile(step)
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
                old: [...operation.value.old]
            }
        }
    }
    return { ...operation }
}

function ensureLineInput(input: string): string {
    return input.endsWith('\n') ? input : `${input}\n`
}

function alignDown(value: bigint, size: bigint): bigint {
    if (size <= 0n) return value
    return value - (value % size)
}
