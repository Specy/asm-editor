import {
    type AssembledLine,
    assemble,
    type AssemblyResult,
    type ExecutionRecord,
    type RegisterSet,
    SourceMap,
    StopReason,
    Z80Machine
} from '@specy/z80'
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
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    MIN_SLICE_CHUNK,
    nextSliceChunk,
    sliceDeadline,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'
import type { ExecutionGeneration } from '$lib/languages/ExecutionController'
import type { Testcase } from '$lib/Project.svelte'
import { Z80Device } from '$lib/languages/Z80/Z80Device'
import { ScreenInstructionHistory } from '$lib/languages/peripherals/screen/ScreenInstructionHistory'
import {
    Z80_DEFAULT_ORG,
    Z80_FLAGS,
    Z80_MEMORY_SIZE,
    Z80_REGISTER_NAMES,
    Z80_STACK_TOP,
    Z80_STARTING_REGISTER_NAMES,
    type Z80RegisterName
} from '$lib/languages/Z80/Z80-model'
import { assemblyFiles, type BuildInput, type BuildSources } from '$lib/projectFiles'

/**
 * The `RegisterSet` field behind each register the panel shows. The alternate registers are spelled
 * with a prime in the source and in the UI (`af'`), and `Prime` in the core.
 */
const CORE_REGISTER_BY_NAME = {
    a: 'a',
    bc: 'bc',
    de: 'de',
    hl: 'hl',
    ix: 'ix',
    iy: 'iy',
    sp: 'sp',
    pc: 'pc',
    "af'": 'afPrime',
    "bc'": 'bcPrime',
    "de'": 'dePrime',
    "hl'": 'hlPrime'
} as const satisfies Record<Z80RegisterName, keyof RegisterSet>

type CoreRegisterKey = (typeof CORE_REGISTER_BY_NAME)[Z80RegisterName]

/**
 * How many instructions the machine runs in a millisecond, used to turn a slice's time budget into
 * an instruction budget. Measured in phase 8 on a compute-only loop under node, which came to about
 * eleven thousand; the estimate is rounded down because every other program is slower.
 */
const Z80_INSTRUCTIONS_PER_MS = 10_000

/**
 * How much of a slice's time budget one `run` call aims at. A quarter means a compute-only run costs
 * four calls per slice, which is nothing, and a run whose instructions turn out to be far more
 * expensive than the estimate — a drawing loop, where one `out` clears the Screen — overshoots the
 * budget by at most that quarter before the deadline stops it.
 */
const CHUNK_TARGET_FRACTION = 1 / 4

const NOT_INITIALIZED_ERROR = 'Interpreter not initialized'

export function Z80Emulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorZ80Emulator(source, options)
}

class AsmEditorZ80Emulator extends GenericEmulator<Z80Machine, Z80RegisterName> {
    private machine: Z80Machine | null = null
    private assembly: AssemblyResult | null = null
    private sourceMap: SourceMap | null = null
    private device: Z80Device | null = null
    private screenInstructions: ScreenInstructionHistory | null = null
    /** Echo is drawn while an IN is suspended; commit it with that IN when it succeeds. */
    private pendingEchoBefore: number | null = null
    private sourceLines: Record<string, string[]> = {}
    /**
     * One past the last byte of every assembled segment. The Z80 has no "end of program": running
     * past the last instruction just executes whatever the RAM holds (zeroes decode as `nop`), so
     * these addresses are added to every run's breakpoint set to stop the machine at the bottom of
     * the code, where `_hasTerminated` then reports it as terminated. Computed once per compile.
     */
    private cliffBreakpoints: number[] = []
    /**
     * The address of the instruction the machine last started executing, or `null` while nothing
     * has run. The core's own `z80.instructionAddress` cannot answer this: it is 0 on a fresh
     * machine, which is a perfectly valid address, and `undo()` does not rewind it.
     */
    private lastInstructionAddress: number | null = null

    constructor(source: BuildInput, options: EmulatorSettings) {
        super(
            source,
            {
                systemSize: RegisterSize.Word,
                registerNames: [...Z80_REGISTER_NAMES],
                endianness: 'little'
            },
            {
                ...options,
                language: options.language ?? 'Z80',
                baseAddress: options.baseAddress ?? BigInt(Z80_DEFAULT_ORG),
                stackAddress: options.stackAddress ?? BigInt(Z80_STACK_TOP),
                initialMemoryValue: options.initialMemoryValue ?? 0x0
            }
        )
        //`pc` is where the loaded program says execution starts, so it is readable but not presettable
        this.state.startingRegisterNames = [...Z80_STARTING_REGISTER_NAMES]
    }

    protected getInstance(): Z80Machine | null {
        return this.machine ?? null
    }

    clear(): void {
        super.clear()
        //stopping a program while it was waiting on an `in` leaves a half consumed input line, a
        //granted wait or a staged coordinate in the device; the next run must not find them.
        //Optional chaining because `GenericEmulator`'s constructor calls `clear()` before this
        //subclass' fields are initialized.
        this.device?.reset()
        this.screenInstructions?.clear()
        this.pendingEchoBefore = null
    }

    protected positionStackTabOnCompile(): void {
        //SP starts at the very top of RAM and the stack grows down, so the interesting page is the
        //last one of the address space. The default (one page below SP) would show 0xFFDF-0xFFFE
        //and cut the first pushed word in half.
        const stackTab = this.state.memory.tabs.find((tab) => tab.name === 'Stack')
        if (stackTab) {
            stackTab.address = BigInt(Z80_STACK_TOP + 1 - stackTab.pageSize)
        }
    }

    protected scrollStackTab(): void {
        //a program that ends with a top level `ret` pops its return address off a stack that starts
        //at the very top of RAM, so SP wraps around to 0x0001 and the base implementation would
        //scroll the tab to the 0x0000 page, hiding the stack the program actually used
        if (this.machine?.stopReason === StopReason.RETURNED) return
        super.scrollStackTab()
    }

    protected setRegisters(override?: bigint[]): void {
        super.setRegisters(override)
        //`a` is the only 8 bit register in the list, everything else is a 16 bit pair (the system
        //size), so it is the only one that has to be resized for the panel to render one byte
        this.state.registers.find((register) => register.name === 'a')?.setSize(RegisterSize.Byte)
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        //`check()` would do, but the macro attribution below needs the assembled lines, and the
        //assembler does the same work either way
        const result = assemble(assemblyFiles(sources), { entryPathname: sources.entry })
        return toDiagnostics(result, sourceLinesOf(sources))
    }

    _compile(sources: BuildSources): CompileResult {
        this.machine = null
        this.assembly = null
        this.sourceMap = null
        this.device = null
        this.cliffBreakpoints = []
        this.sourceLines = sourceLinesOf(sources)
        const result = assemble(assemblyFiles(sources), { entryPathname: sources.entry })
        const diagnostics = toDiagnostics(result, this.sourceLines)
        //the assembler has no warning concept: every diagnostic it produces is an error
        if (result.hasErrors()) {
            return {
                ok: false,
                diagnostics,
                report: diagnostics.map((diagnostic) => diagnostic.message).join('\n')
            }
        }
        this.assembly = result
        this.sourceMap = new SourceMap(result)
        this.cliffBreakpoints = result
            .segments()
            .map((segment) => segment.address + segment.bytes.length)
        return { ok: true }
    }

    _initialize(undoSize: number): void {
        const assembly = this.assembly
        if (!assembly) throw new Error(NOT_INITIALIZED_ERROR)
        const peripherals = this._peripherals
        const device = new Z80Device({
            write: (text) => peripherals.terminal.write(text),
            hasInput: () => peripherals.terminal.hasPendingInput(),
            //the clock is swapped for a virtual one during a testcase, so it is read per call
            timeHundredths: () => this._peripherals.clock.nowHundredths(),
            screen: peripherals.screen,
            keyboard: peripherals.keyboard,
            mouse: peripherals.mouse,
            onGraphicalUse: () =>
                peripherals.terminal.useKeyboardInput(peripherals.keyboard, (text) =>
                    device.echo(text)
                )
        })
        //a run starts with the prompt every Z80 program has always had; the device switches the
        //Terminal over the first time the program touches the Screen, the Keyboard or the Mouse,
        //which is what "in graphical use" means for a language whose console is just more ports
        //([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md))
        peripherals.terminal.usePromptInput()
        const screenInstructions = new ScreenInstructionHistory(
            peripherals.screen,
            normalizeUndoSize(undoSize)
        )
        const machine = new Z80Machine({
            historySize: normalizeUndoSize(undoSize),
            initialSp: Z80_STACK_TOP,
            //a program written as a routine ends with a top level `ret`, which the machine can only
            //recognize as an ending when it knows where the stack started
            exitOnReturn: true,
            onPortRead: (address) => {
                const before = this.pendingEchoBefore ?? peripherals.screen.history.sequence
                const value = device.readPort(address)
                if (value !== undefined) {
                    screenInstructions.record(machine.tStateCount, before)
                    this.pendingEchoBefore = null
                }
                return value
            },
            onPortWrite: (address, value) => {
                const before = peripherals.screen.history.sequence
                const state = device.drawingState()
                device.writePort(address, value)
                const after = device.drawingState()
                const changed =
                    state.x !== after.x ||
                    state.y !== after.y ||
                    state.x2 !== after.x2 ||
                    state.y2 !== after.y2 ||
                    state.lastCommand !== after.lastCommand
                //Bus callbacks run after the instruction has spent clock cycles. The timestamp
                //therefore lies after its history record's tStateCountBefore, including in loops.
                screenInstructions.record(
                    machine.tStateCount,
                    before,
                    changed ? () => device.restoreDrawingState(state) : undefined
                )
            }
        })
        //throws only for an assembly with errors, which `_compile` already refused
        machine.loadAssembly(assembly)
        this.device = device
        this.machine = machine
        this.screenInstructions = screenInstructions
        this.lastInstructionAddress = null
    }

    _dispose(): void {
        this.machine = null
        this.assembly = null
        this.sourceMap = null
        this.device = null
        this.cliffBreakpoints = []
        this.lastInstructionAddress = null
    }

    _canUndo(): boolean {
        const record = this.machine?.getHistory(1)[0]
        return !!record && (this.screenInstructions?.canUndoAfter(record.tStateCountBefore) ?? true)
    }

    _undo(): void {
        const machine = this.requireMachine()
        const record = machine.getHistory(1)[0]
        machine.undo()
        if (record) this.screenInstructions?.undoAfter(record.tStateCountBefore)
        //the core restores the registers but not `instructionAddress`, so without this the panel
        //would keep naming the instruction that was just undone. The newest surviving record is
        //the one that ran last, and there always is one while the machine could undo at all.
        this.lastInstructionAddress = machine.getHistory(1)[0]?.address ?? null
    }

    _getStatus(): EmulatorStatus {
        return this._hasTerminated() ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _hasTerminated(): boolean {
        const machine = this.machine
        if (!machine) return false
        //`halt` with interrupts disabled and a top level `ret`
        if (machine.isTerminated()) return true
        //`ei` + `halt` parks the CPU until an interrupt arrives, and nothing in this app ever raises
        //one, so the program is over as far as the user is concerned
        if (machine.stopReason === StopReason.WAITING_FOR_INTERRUPT) return true
        //the cliff: the PC left the assembled code, which is where the other languages stop too
        return this.sourceMap?.addressToLocation(machine.z80.regs.pc) === undefined
    }

    /**
     * The machine reports its own instruction count, so this is the one adapter whose progress is
     * exact. A stop for input is served inside the slice, as it was inside the old run loop: the
     * program is suspended on the Terminal, not on the scheduler.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const machine = this.requireMachine()
        const budget = sliceInstructionBudget(request, Z80_INSTRUCTIONS_PER_MS)
        const execution = this.executionController.capture()
        const stops = [...this.toBreakpointAddresses(request.breakpoints), ...this.cliffBreakpoints]
        let instructions = 0
        //the budget is spent in chunks so the wall clock can be looked at between them: a Z80
        //instruction is a fraction of a microsecond, but one `out` can clear the whole Screen and
        //journal the image it overwrote, so instructions alone say nothing about how long the host
        //will be held. The first chunk is small and the next ones are sized from what it cost
        const deadline = sliceDeadline(request)
        const chunkTargetMs = request.timeBudgetMs * CHUNK_TARGET_FRACTION
        const chunkCap = Math.floor(budget * CHUNK_TARGET_FRACTION)
        let chunk = MIN_SLICE_CHUNK
        while (instructions < budget) {
            const startedAt = performance.now()
            const result = machine.run({
                maxInstructions: Math.min(chunk, budget - instructions),
                breakpoints: stops
            })
            const spentMs = performance.now() - startedAt
            this.trackLastInstruction(result.instructions > 0, result.reason)
            instructions += result.instructions
            if (result.reason === StopReason.WAITING_FOR_INPUT) {
                //a stop on a time port is a program-requested wait, which the scheduler owns: it
                //awaits the clock through the execution generation so Stop still answers, and the
                //re-executed `in` finds the wait granted (ADR 0007, ADR 0010). Console input is
                //served here instead, because the program is suspended on the Terminal, not on time
                const wait = this.pendingWait()
                if (wait) return { reason: 'wait', instructions, wait }
                await this.provideInput(execution)
                continue
            }
            if (this._hasTerminated()) return { reason: 'terminated', instructions }
            //anything else the machine stopped for is a breakpoint: the user's, or a cliff one that
            //`_hasTerminated` did not recognize as the end of the program
            if (result.reason !== StopReason.INSTRUCTIONS_EXHAUSTED) {
                return { reason: 'breakpoint', instructions }
            }
            //the slice ends on the clock as well as on the budget, but never without progress: a
            //slice that ran nothing ends the whole run
            if (instructions > 0 && performance.now() >= deadline) {
                return { reason: 'budget', instructions }
            }
            chunk = nextSliceChunk(chunk, chunkTargetMs, spentMs, chunkCap)
        }
        return { reason: 'budget', instructions }
    }

    async _runTestcase(_testcase: Testcase, haltLimit: number): Promise<void> {
        const execution = this.executionController.capture()
        //the testcase input is served by the terminal's scripted source, swapped in by the caller.
        //No user breakpoints during a test, but the cliff ones still have to stop the machine.
        await this.runWithInput(execution, toInstructionLimit(haltLimit), [])
    }

    async _step(): Promise<{ terminated: boolean }> {
        const machine = this.requireMachine()
        const execution = this.executionController.capture()
        let reason = machine.step()
        if (reason === StopReason.WAITING_FOR_INPUT) {
            //the `in` was rolled back, so nothing has executed yet: feed the device (or let the
            //wait it asked for elapse) and retry it
            await this.serveInputStop(execution)
            reason = machine.step()
        }
        this.executionController.ensureCurrent(execution)
        this.trackLastInstruction(reason !== StopReason.WAITING_FOR_INPUT, reason)
        return { terminated: this._hasTerminated() }
    }

    _getPc(): bigint {
        return BigInt(this.machine?.z80.regs.pc ?? 0)
    }

    _getSp(): bigint {
        return BigInt(this.machine?.z80.regs.sp ?? 0)
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        const machine = this.machine
        if (!machine) return Z80_FLAGS.map((flag) => ({ name: flag.name, value: 0, prev: 0 }))
        const flags = machine.z80.regs.f
        //the flags the last executed instruction found on entry, so the panel can highlight what it
        //changed. Without history there is nothing to compare against and `prev` is left out.
        const previous = machine.getHistory(1)[0]?.stateBefore.regs.f
        return Z80_FLAGS.map((flag) => ({
            name: flag.name,
            value: (flags >> flag.bit) & 1,
            prev: previous === undefined ? undefined : (previous >> flag.bit) & 1
        }))
    }

    _getRegisterValues(): bigint[] {
        const regs = this.machine?.z80.regs
        if (!regs) return new Array(this._registerNames.length).fill(0n)
        return this._registerNames.map((name) => BigInt(regs[CORE_REGISTER_BY_NAME[name]]))
    }

    _getRegisterValuesRecord(): Record<Z80RegisterName, bigint> {
        const values = this._getRegisterValues()
        return Object.fromEntries(
            this._registerNames.map((name, i) => [name, values[i] ?? 0n])
        ) as Record<Z80RegisterName, bigint>
    }

    _getRegisterValue(register: Z80RegisterName, _size?: RegisterSize): bigint {
        const regs = this.requireMachine().z80.regs
        return BigInt(regs[coreRegisterKey(register)])
    }

    _setRegisterValue(register: Z80RegisterName, value: bigint, _size?: RegisterSize): void {
        const regs = this.requireMachine().z80.regs
        //the core clamps `a` itself but stores the 16 bit pairs verbatim, so writing 0x12345 to HL
        //would leave a value no Z80 instruction could have produced. Masking both also keeps the
        //conversion below inside the range `Number` can represent exactly.
        const mask = register === 'a' ? 0xffn : 0xffffn
        regs[coreRegisterKey(register)] = Number(value & mask)
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        const memory = this.requireMachine().memory
        const start = Number(address)
        const size = Number(length)
        const bytes = new Uint8Array(size)
        //the UI clamps addresses to the top of RAM but a page can still straddle the end of the
        //address space, and the Z80 does not wrap around: the bytes past 0xFFFF read as zero
        const readable = Math.max(0, Math.min(size, Z80_MEMORY_SIZE - start))
        if (readable > 0) bytes.set(memory.subarray(start, start + readable))
        return bytes
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        const memory = this.requireMachine().memory
        const start = Number(address)
        const writable = Math.max(0, Math.min(data.length, Z80_MEMORY_SIZE - start))
        //direct RAM access, like the other adapters' testcase setup: it bypasses the memory hooks
        //and the history journal, which is what setting up a program's initial state should do
        if (writable > 0) memory.set(data.subarray(0, writable), start)
    }

    _getNextInstruction(): Instruction | null {
        const machine = this.machine
        if (!machine) return null
        return this._getInstructionAt(BigInt(machine.z80.regs.pc))
    }

    _getLastInstruction(): Instruction | null {
        const address = this.lastInstructionAddress
        if (!this.machine || address === null) return null
        return this._getInstructionAt(BigInt(address))
    }

    _getInstructionAt(address: bigint): Instruction | null {
        const location = this.sourceMap?.addressToLocation(Number(address))
        if (!location) return null
        return {
            address,
            lineNumber: location.lineNumber,
            file: location.pathname,
            code: this.sourceLines[location.pathname]?.[location.lineNumber]?.trim() ?? ''
        }
    }

    _getCallStack(): StackFrame[] {
        const machine = this.machine
        const sourceMap = this.sourceMap
        if (!machine || !sourceMap) return []
        //`namedCallStack` hands back the innermost frame first; the call stack panel reverses the
        //list before drawing it, so it is stored outermost first, the way M68K produces it
        return sourceMap
            .namedCallStack(machine)
            .reverse()
            .map((frame, i) => ({
                name: frame.name ?? `0x${frame.targetAddress.toString(16).padStart(4, '0')}`,
                //the routine that is executing, and the `call` that entered it
                address: BigInt(frame.targetAddress),
                destination: BigInt(frame.callSiteAddress),
                sp: BigInt(frame.stackAddress),
                line: sourceMap.addressToLocation(frame.targetAddress)?.lineNumber ?? -1,
                file: sourceMap.addressToLocation(frame.targetAddress)?.pathname,
                color: makeLabelColor(i, frame.stackAddress)
            }))
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const machine = this.machine
        if (!machine || max <= 0) return []
        //oldest first, at most `max` of the most recent records
        const records = machine.getHistory(max)
        const steps: ExecutionStep[] = []
        for (let i = records.length - 1; i >= 0; i--) {
            const record = records[i]
            //the state the instruction produced is the state the next one found, and for the newest
            //record it is the machine as it stands now
            const after = records[i + 1]?.stateBefore.regs ?? machine.z80.regs
            steps.push({
                pc: record.address,
                line: this.sourceMap?.addressToLocation(record.address)?.lineNumber ?? -1,
                file: this.sourceMap?.addressToLocation(record.address)?.pathname,
                old_ccr: { bits: record.stateBefore.regs.f },
                new_ccr: { bits: after.f },
                mutations: this.recordToMutations(record, after)
            })
        }
        return steps
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        const assembly = this.assembly
        if (!assembly) return { decorations: [], code: '' }
        const decorations: EmulatorDecoration[] = []
        for (const line of assembly.asm.assembledLines) {
            if (line.lineNumber === undefined || line.expandedTo.length === 0) continue
            const expanded = flattenExpansion(line).map((expansion) => expansion.line.trim())
            if (expanded.length === 0) continue
            decorations.push({
                type: 'below-line',
                file: line.fileInfo.pathname,
                note: 'Expanded macro',
                belowLine: line.lineNumber,
                //shiki has no z80 grammar, `asm` is the closest thing that highlights mnemonics
                md: `\`\`\`asm\n${expanded.join('\n')}\n\`\`\``
            })
        }
        //Z80 has no generated code panel, only the per line expansion decorations
        return { decorations, code: '' }
    }

    _stringifyError(error: unknown, _line?: number): string {
        return error instanceof Error ? error.message : String(error)
    }

    /**
     * Runs until the machine stops for a reason other than input, refilling the console device
     * whenever an `in` could not be served. Every await goes through `execution` so that a Stop or a
     * recompile while the prompt is open cannot resume a run that no longer exists.
     */
    private async runWithInput(
        execution: ExecutionGeneration,
        limit: number,
        breakpoints: number[]
    ): Promise<void> {
        const machine = this.requireMachine()
        const stops = [...breakpoints, ...this.cliffBreakpoints]
        let remaining = limit
        while (remaining > 0) {
            const result = machine.run({ maxInstructions: remaining, breakpoints: stops })
            this.trackLastInstruction(result.instructions > 0, result.reason)
            //the budget is shared by every slice of one run, so a program that stops for input ten
            //times still gets the halt limit it was given, not ten times it
            remaining -= result.instructions
            if (result.reason !== StopReason.WAITING_FOR_INPUT) return
            //a testcase runs unsliced, so a wait is awaited here; its clock is the virtual one, on
            //which waits complete at once (ADR 0010)
            await this.serveInputStop(execution)
        }
    }

    /**
     * Serves a stop on an `in` that could not be answered, whichever kind it is: a wait is awaited
     * on the clock, an input request goes to the Terminal. The step and testcase paths use it; the
     * sliced run path reports waits to the scheduler instead, which is what ADR 0007 asks for.
     */
    private async serveInputStop(execution: ExecutionGeneration): Promise<void> {
        const wait = this.pendingWait()
        if (wait) {
            await this.executionController.waitFor(execution, () => wait)
            return
        }
        await this.provideInput(execution)
    }

    /**
     * The clock wait the pending `in` is asking for, or null when it is asking for input. Granting
     * it also tells the device to answer the instruction when it re-executes, and only then: a wait
     * that is cancelled (Stop resolves pending waits) leaves a run that is superseded anyway.
     */
    private pendingWait(): Promise<void> | null {
        const port = this.requireMachine().pendingInputPort ?? 0
        if (!Z80Device.isWaitPort(port)) return null
        const device = this.requireDevice()
        const clock = this._peripherals.clock
        const wait =
            Z80Device.portNameOf(port) === 'TIME_FRAME'
                ? clock.nextFrame()
                : clock.waitHundredths(Z80Device.waitHundredthsOf(port))
        return wait.then(() => device.completeWait(port))
    }

    /**
     * Asks the Terminal for input and hands it to the device. The `in` that could not be served was
     * rolled back by the machine, so resuming re-executes it and the device answers it then. The
     * character port takes one keystroke at a time once the Screen's Keyboard is the source
     * (ADR 0009); every other case is the line the port has always read (ADR 0002), which is also
     * what a testcase's scripted input is made of.
     *
     * The whole read is one journal record: the echo draws a glyph per typed character, and all of
     * them belong to the single `in` the machine is about to re-execute, which is the one step Undo
     * rolls back ([ADR 0005](../../../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    private async provideInput(execution: ExecutionGeneration): Promise<void> {
        const machine = this.requireMachine()
        const device = this.requireDevice()
        const terminal = this._peripherals.terminal
        const screen = this._peripherals.screen
        const port = machine.pendingInputPort ?? 0
        const question = device.inputQuestion(port)
        this.pendingEchoBefore ??= screen.history.sequence
        screen.beginCompoundOperation()
        try {
            if (
                Z80Device.isCharacterPort(port) &&
                terminal.inputSource === 'interactive' &&
                terminal.interactiveSource === 'keyboard'
            ) {
                const character = await this.requestCharacter(question, execution)
                this.executionController.ensureCurrent(execution)
                device.provideCharacter(character)
                return
            }
            const value = await this.requestInput(question, execution)
            this.executionController.ensureCurrent(execution)
            //throws for a line that does not parse as the number the port asked for, stopping the run
            device.provideInput(port, value)
        } finally {
            screen.endCompoundOperation()
        }
    }

    /**
     * Remembers where the machine last was, for the line the UI highlights when a program ends and
     * for the line an error is reported on. A stop for input counts even though the `in` was rolled
     * back: it is the instruction the user has to look at when the line they typed does not parse.
     */
    private trackLastInstruction(executed: boolean, reason: StopReason | undefined): void {
        if (!executed && reason !== StopReason.WAITING_FOR_INPUT) return
        this.lastInstructionAddress = this.requireMachine().z80.instructionAddress
    }

    private recordToMutations(record: ExecutionRecord, after: RegisterSet): MutationOperation[] {
        const mutations: MutationOperation[] = []
        const before = record.stateBefore.regs
        for (const name of this._registerNames) {
            //`pc` moves on every instruction and is already shown next to the step itself
            if (name === 'pc') continue
            const key = CORE_REGISTER_BY_NAME[name]
            if (before[key] === after[key]) continue
            mutations.push({
                type: 'WriteRegister',
                value: {
                    register: name,
                    old: BigInt(before[key]),
                    size: name === 'a' ? RegisterSize.Byte : RegisterSize.Word
                }
            })
        }
        for (const write of record.memoryWrites) {
            mutations.push({
                type: 'WriteMemory',
                value: {
                    address: BigInt(write.address),
                    old: BigInt(write.before),
                    size: RegisterSize.Byte
                }
            })
        }
        for (const write of record.portWrites) {
            //the journal records the whole address bus, the port is its low byte
            const port = (write.port & 0xff).toString(16).padStart(2, '0')
            mutations.push({ type: 'Other', value: `out (0x${port}) ← ${write.value}` })
        }
        if (record.interrupt) {
            mutations.push({ type: 'Other', value: `${record.interrupt} interrupt` })
        }
        return mutations
    }

    /** 0 based editor lines to the addresses they assembled to; a line with no code has none. */
    private toBreakpointAddresses(lines: { file: string; line: number }[]): number[] {
        const sourceMap = this.sourceMap
        if (!sourceMap) return []
        const addresses: number[] = []
        for (const breakpoint of lines) {
            const address = sourceMap.locationToAddress(breakpoint.line, breakpoint.file)
            if (address !== undefined) addresses.push(address)
        }
        return addresses
    }

    private requireMachine(): Z80Machine {
        if (!this.machine) throw new Error(NOT_INITIALIZED_ERROR)
        return this.machine
    }

    private requireDevice(): Z80Device {
        if (!this.device) throw new Error(NOT_INITIALIZED_ERROR)
        return this.device
    }
}

function coreRegisterKey(register: Z80RegisterName): CoreRegisterKey {
    const key = CORE_REGISTER_BY_NAME[register]
    if (!key) throw new Error(`Unsupported register: ${register}`)
    return key
}

/**
 * The undo depth comes from a user setting, so it can be any number (or NaN). The machine treats 0
 * as "no history at all", which is also what it costs at run time.
 */
function normalizeUndoSize(undoSize: number): number {
    return Number.isFinite(undoSize) ? Math.max(0, Math.floor(undoSize)) : 0
}

function toInstructionLimit(limit: number | undefined): number {
    //`maxInstructions` has to stay a finite number: Infinity would make the machine's budget
    //comparison meaningless the moment it is used in arithmetic
    return !limit || limit <= 0 ? Number.MAX_SAFE_INTEGER : limit
}

function toDiagnostics(
    result: AssemblyResult,
    sourceLines: Record<string, string[]>
): Diagnostic[] {
    return result.diagnostics.map((diagnostic) => {
        const lineIndex = diagnostic.lineNumber ?? expansionLineOf(result, diagnostic.message) ?? 0
        return {
            severity: 'error',
            file: diagnostic.pathname,
            lineIndex,
            //the assembler reports the offending line, not a column inside it
            column: 0,
            line: {
                line: sourceLines[diagnostic.pathname]?.[lineIndex] ?? '',
                line_index: lineIndex
            },
            message: diagnostic.message,
            formatted: diagnostic.message
        }
    })
}

function sourceLinesOf(sources: BuildSources): Record<string, string[]> {
    return Object.fromEntries(
        Object.entries(sources.files).flatMap(([path, file]) =>
            file.encoding === 'plain' ? [[path, file.content.split('\n')]] : []
        )
    )
}

/**
 * A diagnostic raised inside a macro body or an included file has no line number of its own: the
 * line it belongs to does not exist in the source the editor is showing. The assembled listing does
 * hold the expansion, so the error is attributed to the line that invoked it, which is the line the
 * user can actually fix.
 */
function expansionLineOf(result: AssemblyResult, message: string): number | undefined {
    for (const line of result.asm.assembledLines) {
        if (line.lineNumber !== undefined || line.error !== message) continue
        for (let source = line.expandedFrom; source; source = source.expandedFrom) {
            if (source.lineNumber !== undefined) return source.lineNumber
        }
    }
    return undefined
}

/**
 * A macro can expand into another macro: recurse so the note lists the fully expanded lines the
 * assembler emitted, instead of a nested macro call the reader would have to expand in their head.
 */
function flattenExpansion(line: AssembledLine): AssembledLine[] {
    return line.expandedTo.flatMap((expansion) =>
        expansion.expandedTo.length > 0 ? flattenExpansion(expansion) : [expansion]
    )
}
