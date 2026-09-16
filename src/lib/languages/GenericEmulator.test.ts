import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    ANIMATING_PANEL_REFRESH_MS,
    CPU_REGISTER_FILE_ID,
    GenericEmulator,
    RUNNING_PANEL_REFRESH_MS
} from '$lib/languages/GenericEmulator.svelte'
import {
    EmulatorStatus,
    type CompileResult,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
import {
    InterpreterStatus,
    RegisterSize,
    type BaseEmulatorState,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    type RegisterFileDescriptor,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import {
    COMPUTE_SLICE_MS,
    SCREEN_ACTIVITY_MS,
    SCREEN_SLICE_MS,
    type ExecutionSlice,
    type ExecutionSliceRequest
} from '$lib/languages/ExecutionSlice'
import { Screen } from '$lib/languages/peripherals/screen/Screen'
import { RECORD_OVERHEAD_BYTES } from '$lib/languages/peripherals/screen/ScreenHistory'
import { ScreenInstructionHistory } from '$lib/languages/peripherals/screen/ScreenInstructionHistory'
import type { Testcase } from '$lib/Project.svelte'

/**
 * The scheduler, the injection, the reset path and the Undo rule of phase 3, exercised through a
 * fake adapter: no Core, so a slice runs exactly what the test says it runs and the assertions are
 * about `GenericEmulator`'s own behavior.
 */

type FakeRegister = 'R0'

type SliceBehavior = (
    request: ExecutionSliceRequest,
    slice: number
) => ExecutionSlice | Promise<ExecutionSlice>

/** One declared Register file, enough to exercise the values, the sizes and the flags of one. */
const FAKE_FPU: RegisterFileDescriptor = {
    id: 'fpu',
    label: 'FPU',
    size: RegisterSize.Double,
    formats: ['single', 'double', 'hex'],
    flagNames: ['0', '1'],
    registers: [{ name: 'f0' }, { name: 'f1' }]
}

class FakeEmulator extends GenericEmulator<object, FakeRegister> {
    /** Every request the scheduler made, in order. */
    readonly requests: ExecutionSliceRequest[] = []
    /** What each slice pretends to do; the default runs the whole budget and asks for more. */
    behavior: SliceBehavior = (request) => ({
        reason: 'budget',
        instructions: Math.min(request.instructionBudget, 1000)
    })
    coreSteps = 0
    hasEnded = false

    constructor(options: EmulatorSettings = {}) {
        super(
            '',
            { systemSize: RegisterSize.Long, registerNames: ['R0'], registerFiles: [FAKE_FPU] },
            options
        )
        // Scheduler tests exercise an already-built fake Core without paying the unrelated compile
        // setup cost. Real adapters acquire this capability only after a successful Build.
        this.state.canExecute = true
    }

    sourceIdentity(): object {
        return this._sources
    }

    protected getInstance(): object | null {
        return this
    }

    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        this.requests.push(request)
        const slice = await this.behavior(request, this.requests.length - 1)
        this.coreSteps += slice.instructions
        return slice
    }

    _canUndo(): boolean {
        return this.coreSteps > 0
    }

    _undo(): void {
        this.coreSteps -= 1
        this.history = this.history.slice(1)
    }

    _checkCode(): Diagnostic[] {
        return []
    }

    _compile(): CompileResult {
        return { ok: true }
    }

    _initialize(): void {}

    _dispose(): void {}

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        return { decorations: [], code: '' }
    }

    async _runTestcase(): Promise<void> {}

    _stringifyError(error: unknown): string {
        return String(error)
    }

    async _step(): Promise<{ terminated: boolean }> {
        this.coreSteps += 1
        return { terminated: this.hasEnded }
    }

    _getStatus(): EmulatorStatus {
        return this.hasEnded ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _hasTerminated(): boolean {
        return this.hasEnded
    }

    /** A byte of fake memory per address, so what a Poke wrote can be read back. */
    readonly memoryBytes = new Map<bigint, number>()

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.pokeLog.push(`memory $${address.toString(16)}=${[...data].join(',')}`)
        data.forEach((byte, offset) => this.memoryBytes.set(address + BigInt(offset), byte))
    }

    /** How many times the panels have read the Core, so a test can count refreshes. */
    memoryReads = 0

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        this.memoryReads += 1
        const bytes = new Uint8Array(Number(length))
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = this.memoryBytes.get(address + BigInt(i)) ?? 0
        }
        return bytes
    }

    /** `refreshRunningPanels` is what an adapter calls from inside a slice; it is protected. */
    refreshPanels(force: boolean): void {
        this.refreshRunningPanels(force)
    }

    _getNextInstruction(): Instruction | null {
        return null
    }

    _getInstructionAt(): Instruction | null {
        return null
    }

    /** What the fake Core's Undo history holds, newest first, as an adapter reports it. */
    history: ExecutionStep[] = []

    _getUndoHistory(max: number): ExecutionStep[] {
        return this.history.slice(0, max)
    }

    _getPc(): bigint {
        return 0n
    }

    _getSp(): bigint {
        return 0n
    }

    _getFlags(): { name: string; value: number }[] {
        return []
    }

    _getCallStack(): StackFrame[] {
        return []
    }

    _getRegisterValues(): bigint[] {
        return [this.registerValue]
    }

    /** What the fake Core answers with, so a test can move a value and look at the diff. */
    registerValue = 0n
    fileValues: bigint[] = [0n, 0n]
    fileFlags = [0, 0]
    /** How many times the file has been read, so a test can count the calls a refresh makes. */
    fileReads = 0

    _getRegisterFileValues(id: string): bigint[] {
        expect(id).toBe('fpu')
        this.fileReads += 1
        return this.fileValues
    }

    _getRegisterFileFlags(): { name: string; value: number }[] {
        return this.fileFlags.map((value, i) => ({ name: String(i), value }))
    }

    /** Which rows the fake Core says hold nothing; empty is a file that never blanks. */
    fileBlanks: boolean[] = []

    _getRegisterFileBlanks(id: string): boolean[] {
        expect(id).toBe('fpu')
        return this.fileBlanks
    }

    /** Seeding the CPU registers from outside a clear, which only `clear` does today. */
    seedRegisters(values: bigint[]): void {
        this.setRegisters(values)
    }

    /** Rebuilding the CPU registers out of the Core, which an adapter does after a Core write. */
    rebuildRegistersFromCore(): void {
        this.setRegisters()
    }

    _getRegisterValuesRecord(): Record<FakeRegister, bigint> {
        return { R0: 0n }
    }

    _getRegisterValue(): bigint {
        return 0n
    }

    _setRegisterValue(register: FakeRegister, value: bigint, size?: RegisterSize): void {
        this.pokeLog.push(`register ${register}=${value} at ${size ?? 'default'} bytes`)
        this.registerValue = value
    }

    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        this.pokeLog.push(`file ${id}.${register}=${value}`)
        const index = FAKE_FPU.registers.findIndex((candidate) => candidate.name === register)
        if (index >= 0) this.fileValues[index] = value
    }

    /** Everything the Core was told to do, in order, so a test can see what a Poke bracketed. */
    pokeLog: string[] = []
    pokeOpen = false
    /** Whether the fake Core records an entry; a history of 0 would not, as for an instruction. */
    pokeRecords = true

    _beginPoke(): void {
        if (this.pokeOpen) throw new Error('a Poke transaction is already open')
        this.pokeOpen = true
        this.pokeLog.push('begin')
    }

    _endPoke(): boolean {
        this.pokeOpen = false
        this.pokeLog.push('end')
        if (!this.pokeRecords) return false
        //a recorded Poke is one entry of the same history as the instructions, undoable like one
        this.coreSteps += 1
        this.history = [makePokeStep(), ...this.history]
        return true
    }

    /** How often the Screen re-read the memory it is mapped over, which a Poke into it triggers. */
    screenResyncs = 0

    _resyncScreenFromMemory(): void {
        this.screenResyncs += 1
    }

    /** Reaches into the state as a Build, an input request or a termination would. */
    setSessionState(
        state: Partial<
            Pick<
                BaseEmulatorState,
                | 'canExecute'
                | 'terminated'
                | 'interrupt'
                | 'startingRegisterNames'
                | 'hiddenRegisters'
            >
        >
    ): void {
        Object.assign(this.state, state)
    }
}

/** A poke entry of the fake Core's history, shaped as the adapters map one. */
function makePokeStep(): ExecutionStep {
    return {
        kind: 'poke',
        mutations: [],
        writes: [],
        pc: -1,
        line: -1,
        old_ccr: { bits: 0 },
        new_ccr: { bits: 0 }
    }
}

const emptyTestcase: Testcase = {
    input: ['1', '2'],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('source updates', () => {
    it('does not rewrite reactive source state when the text is unchanged', () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        const initial = emulator.sourceIdentity()

        emulator.setCode('')
        emulator.setSources('')
        expect(emulator.sourceIdentity()).toBe(initial)

        emulator.setCode('nop')
        const changed = emulator.sourceIdentity()
        expect(changed).not.toBe(initial)
        emulator.setSources('nop')
        expect(emulator.sourceIdentity()).toBe(changed)
    })
})

describe('register files', () => {
    it('shows the CPU file first, holding the very register array of the Emulator', () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        const [cpu, fpu] = emulator.registerFiles
        expect(cpu.id).toBe('cpu')
        expect(cpu.label).toBe('CPU')
        expect(cpu.size).toBe(RegisterSize.Long)
        expect(cpu.formats).toEqual(['hex'])
        expect(cpu.registers).toBe(emulator.registers)
        //the CPU's own Status flags stay in `statusRegisters`, where every caller reads them
        expect(cpu.flags).toEqual([])
        expect(fpu.id).toBe('fpu')
        expect(fpu.layout).toEqual([
            { name: 'f0', size: RegisterSize.Double, kind: 'float' },
            { name: 'f1', size: RegisterSize.Double, kind: 'float' }
        ])
    })

    it('keeps the CPU file on the register array a rebuild replaced', () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.clear()
        expect(emulator.registerFiles[0].registers).toBe(emulator.registers)
    })

    it('zeroes every declared file before a Build', () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers.map((register) => register.value)).toEqual([0n, 0n])
        expect(fpu.registers.map((register) => register.toHex())).toEqual([
            '0000000000000000',
            '0000000000000000'
        ])
        expect(fpu.flags).toEqual([
            { name: '0', value: 0, prev: 0 },
            { name: '1', value: 0, prev: 0 }
        ])
    })

    it('reads the values and the flags of every file on a Build', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileValues = [0x3ff8000000000000n, 7n]
        emulator.fileFlags = [1, 0]
        await emulator.compile(0, undefined)
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers.map((register) => register.value)).toEqual([0x3ff8000000000000n, 7n])
        expect(fpu.flags.map((flag) => flag.value)).toEqual([1, 0])
    })

    it('diffs a file against what the last refresh read, like the CPU registers', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        await emulator.compile(0, undefined)
        emulator.fileValues = [1n, 0n]
        emulator.fileFlags = [1, 0]
        await emulator.step()
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers.map((register) => [register.prev, register.value])).toEqual([
            [0n, 1n],
            [0n, 0n]
        ])
        //the fake Core reports no previous flag, so the previous refresh is what it is diffed
        //against, which is the only way a highlight can mean "changed since then"
        expect(fpu.flags).toEqual([
            { name: '0', value: 1, prev: 0 },
            { name: '1', value: 0, prev: 0 }
        ])
    })

    it('reads each file once per refresh', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        await emulator.compile(0, undefined)
        emulator.fileReads = 0
        emulator.refreshPanels(true)
        expect(emulator.fileReads).toBe(1)
    })

    it('zeroes the files again on a clear, with nothing left to highlight', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileValues = [5n, 6n]
        emulator.fileFlags = [1, 1]
        await emulator.compile(0, undefined)
        emulator.clear()
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers.map((register) => [register.prev, register.value])).toEqual([
            [0n, 0n],
            [0n, 0n]
        ])
        expect(fpu.flags).toEqual([
            { name: '0', value: 0, prev: 0 },
            { name: '1', value: 0, prev: 0 }
        ])
    })

    it('blanks the rows the hook names, on every refresh', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileValues = [1n, 2n]
        emulator.fileBlanks = [false, true]
        await emulator.compile(0, undefined)
        const [, fpu] = emulator.registerFiles
        expect(fpu.blanks).toEqual([false, true])
        //a blanked row still carries the value the Core reported, which the panel keeps a hover
        //away, and a row that fills up again stops being blank on the very next refresh
        expect(fpu.registers.map((register) => register.value)).toEqual([1n, 2n])
        emulator.fileBlanks = [true, false]
        await emulator.step()
        expect(fpu.blanks).toEqual([true, false])
    })

    it('blanks nothing for a file whose hook names no row', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileBlanks = []
        await emulator.compile(0, undefined)
        expect(emulator.registerFiles[1].blanks).toEqual([false, false])
    })

    it('blanks nothing for an adapter that has no blanking hook at all', async () => {
        class BlanklessEmulator extends FakeEmulator {}
        //the hook is optional: a file that never blanks, which is every file but x86's x87, says so
        //by leaving it out and must still refresh
        BlanklessEmulator.prototype._getRegisterFileBlanks =
            undefined as unknown as FakeEmulator['_getRegisterFileBlanks']
        const emulator = new BlanklessEmulator({ automaticChecking: false })
        emulator.fileValues = [1n, 2n]
        await emulator.compile(0, undefined)
        const [, fpu] = emulator.registerFiles
        expect(fpu.blanks).toEqual([false, false])
        expect(fpu.registers.map((register) => register.value)).toEqual([1n, 2n])
    })

    it('unblanks every row on a clear, as it zeroes the values', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileBlanks = [true, true]
        await emulator.compile(0, undefined)
        emulator.clear()
        //a cleared file shows zeros, and a blank row would hide them
        expect(emulator.registerFiles[1].blanks).toEqual([false, false])
    })

    it('refuses to build an adapter that declares a file it cannot read', () => {
        class UnreadableFileEmulator extends FakeEmulator {}
        //an adapter that declared a file and forgot the hook, which is a programming error and not
        //something the panel should discover one refresh later
        UnreadableFileEmulator.prototype._getRegisterFileValues =
            undefined as unknown as FakeEmulator['_getRegisterFileValues']
        expect(() => new UnreadableFileEmulator({ automaticChecking: false })).toThrow(
            '_getRegisterFileValues'
        )
    })

    it('refuses to build an adapter whose file names flags it cannot read', () => {
        class FlaglessEmulator extends FakeEmulator {}
        //a file that names Status flags and has no hook would show a row of zeros for ever, which
        //reads as "nothing ever happened" rather than as the missing implementation it is
        FlaglessEmulator.prototype._getRegisterFileFlags =
            undefined as unknown as FakeEmulator['_getRegisterFileFlags']
        expect(() => new FlaglessEmulator({ automaticChecking: false })).toThrow(
            '_getRegisterFileFlags'
        )
    })

    it('leaves the other files alone when the CPU registers are seeded outside a clear', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        emulator.fileValues = [5n, 6n]
        await emulator.compile(0, undefined)
        emulator.seedRegisters([0n])
        const [, fpu] = emulator.registerFiles
        //only `clear` blanks the other files, so seeding the CPU registers while a Core is live
        //does not leave the panel showing zeros the Core disagrees with
        expect(fpu.registers.map((register) => register.value)).toEqual([5n, 6n])
    })

    it('reads the other files when the CPU registers are rebuilt out of the Core', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        await emulator.compile(0, undefined)
        emulator.registerValue = 3n
        emulator.fileValues = [7n, 8n]
        emulator.rebuildRegistersFromCore()
        const [cpu, fpu] = emulator.registerFiles
        //rebuilding from the Core is a read of the Core, so every file is read with it and the
        //panel never shows a refreshed CPU next to files of an older moment
        expect(cpu.registers.map((register) => register.value)).toEqual([3n])
        expect(fpu.registers.map((register) => register.value)).toEqual([7n, 8n])
    })
})

describe('peripheral injection', () => {
    it('builds a default set when the caller passes none', () => {
        const emulator = new FakeEmulator()
        expect(emulator.peripherals.screen).toBeInstanceOf(Screen)
        expect(emulator.peripherals.keyboard).toBeDefined()
        expect(emulator.peripherals.mouse).toBeDefined()
        expect(emulator.peripherals.clock.mode).toBe('host')
        expect(emulator.peripherals.terminal).toBeDefined()
    })

    it('keeps the instances the caller injected', () => {
        const screen = new Screen({ width: 32, height: 16 })
        const emulator = new FakeEmulator({ peripherals: { screen } })
        expect(emulator.peripherals.screen).toBe(screen)
        //the Mouse clamps against the injected Screen, not against a default one
        emulator.peripherals.mouse.moveTo(100, 100)
        expect(emulator.peripherals.mouse.x).toBe(31)
    })

    it('sizes the default Screen from the language', () => {
        expect(new FakeEmulator({ language: 'M68K' }).peripherals.screen.width).toBe(640)
        const z80 = new FakeEmulator({ language: 'Z80' }).peripherals.screen
        expect([z80.width, z80.height]).toEqual([256, 192])
    })

    it('takes the Screen history budget from the Project Settings it was opened with', () => {
        const emulator = new FakeEmulator({ screenHistoryBudgetMb: 2 })
        expect(emulator.peripherals.screen.history.byteBudget).toBe(2 * 1024 * 1024)
        expect(new FakeEmulator().peripherals.screen.history.byteBudget).toBe(64 * 1024 * 1024)
    })

    it('applies a changed budget on the next clear, which is what a Build starts with', () => {
        const emulator = new FakeEmulator({ screenHistoryBudgetMb: 2 })
        emulator.setScreenHistoryBudgetMb(3)
        expect(emulator.peripherals.screen.history.byteBudget).toBe(2 * 1024 * 1024)
        emulator.clear()
        expect(emulator.peripherals.screen.history.byteBudget).toBe(3 * 1024 * 1024)
    })
})

describe('slice scheduling', () => {
    it('keeps the overall instruction limit across slices', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (request) => ({
            reason: 'budget',
            instructions: Math.min(request.instructionBudget, 100)
        })
        await emulator.run(250)
        expect(emulator.coreSteps).toBe(250)
        //100 + 100 + the 50 the last slice was allowed to run, and no slice beyond the limit
        expect(emulator.requests.map((r) => r.instructionBudget)).toEqual([250, 150, 50])
    })

    it('stops on a breakpoint, a termination and the Core’s own limit', async () => {
        for (const reason of ['breakpoint', 'terminated', 'limit'] as const) {
            const emulator = new FakeEmulator()
            emulator.behavior = () => ({ reason, instructions: 1 })
            await emulator.run(1000)
            expect(emulator.requests).toHaveLength(1)
        }
    })

    it('asks for the short budget only once a program has drawn on a watched Screen', async () => {
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.watch()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = (request, index) => {
            //the second slice runs into a program that drew something
            if (index === 0) emulator.peripherals.screen.drawPixel(1, 1)
            return { reason: index < 2 ? 'budget' : 'terminated', instructions: 1 }
        }
        await emulator.run(1000)
        expect(emulator.requests.map((r) => r.timeBudgetMs)).toEqual([
            COMPUTE_SLICE_MS,
            SCREEN_SLICE_MS,
            SCREEN_SLICE_MS
        ])
    })

    it('keeps the short budget after the renderer has painted, while the program keeps drawing', async () => {
        //the dirty flag is instantaneous: the renderer clears it the moment it paints, and a
        //drawing loop with no wait of its own would then be handed the compute budget and spend all
        //of it on frames nothing can show until it comes back (ADR 0007)
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.watch()
        emulator.behavior = (_request, index) => {
            emulator.peripherals.screen.drawPixel(1, index)
            //the renderer paints between two slices, which used to give the next one 50 ms
            emulator.peripherals.screen.markPainted()
            return { reason: index < 3 ? 'budget' : 'terminated', instructions: 1 }
        }
        await emulator.run(1000)
        expect(emulator.requests.slice(1).map((r) => r.timeBudgetMs)).toEqual([
            SCREEN_SLICE_MS,
            SCREEN_SLICE_MS,
            SCREEN_SLICE_MS
        ])
    })

    it('goes back to the long budget once the drawing stops', async () => {
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.watch()
        emulator.peripherals.screen.drawPixel(1, 1)
        emulator.behavior = async (_request, index) => {
            //nothing draws again, so the activity window runs out
            if (index === 0) await new Promise((resolve) => setTimeout(resolve, SCREEN_ACTIVITY_MS))
            return { reason: index < 1 ? 'budget' : 'terminated', instructions: 1 }
        }
        await emulator.run(1000)
        expect(emulator.requests.map((r) => r.timeBudgetMs)).toEqual([
            SCREEN_SLICE_MS,
            COMPUTE_SLICE_MS
        ])
    })

    it('reads the Core for the panels at most once a display frame, unless forced', async () => {
        //an adapter reaches this once per Core interrupt, which a graphical program hits a few
        //hundred times a second; nothing can be seen more than once a frame
        const emulator = new FakeEmulator()
        emulator.refreshPanels(false)
        const afterFirst = emulator.memoryReads
        expect(afterFirst).toBeGreaterThan(0)
        for (let index = 0; index < 20; index++) emulator.refreshPanels(false)
        expect(emulator.memoryReads).toBe(afterFirst)
        //a trap that stops to ask the user something shows the panels beside the prompt
        emulator.refreshPanels(true)
        expect(emulator.memoryReads).toBeGreaterThan(afterFirst)
    })

    it('reads them far less often while a program is drawing on a watched Screen', async () => {
        //reading the panels republishes `pc`, which re-renders the editor's zones and makes Monaco
        //re-measure; while a Screen is being animated that is competing with the frames the user
        //is actually watching
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.watch()
        emulator.refreshPanels(false)
        const afterFirst = emulator.memoryReads
        emulator.peripherals.screen.drawPixel(1, 1)
        await new Promise((resolve) => setTimeout(resolve, RUNNING_PANEL_REFRESH_MS * 2))
        //a display frame has passed, which would have been enough without a Screen being drawn on
        for (let index = 0; index < 20; index++) emulator.refreshPanels(false)
        expect(emulator.memoryReads).toBe(afterFirst)
        await new Promise((resolve) => setTimeout(resolve, ANIMATING_PANEL_REFRESH_MS))
        emulator.refreshPanels(false)
        expect(emulator.memoryReads).toBeGreaterThan(afterFirst)
    })

    it('goes back to a refresh a frame once the drawing stops', async () => {
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.watch()
        emulator.peripherals.screen.drawPixel(1, 1)
        emulator.refreshPanels(false)
        const afterFirst = emulator.memoryReads
        //nothing draws again, so the activity window runs out and the panels are live again. The
        //margin is what keeps this deterministic: a timer that fires at exactly the window's length
        //leaves `performance.now()` free to land on the last millisecond of it under a loaded suite
        await new Promise((resolve) => setTimeout(resolve, SCREEN_ACTIVITY_MS + 50))
        emulator.refreshPanels(false)
        expect(emulator.memoryReads).toBeGreaterThan(afterFirst)
    })

    it('runs a long budget when no renderer is painting the Screen', async () => {
        //x86 has a Screen for shape and no panel, and any surface can have its Screen toggle closed:
        //nothing ever paints those, so `dirty` stays set and must not shorten every slice
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.drawPixel(1, 1)
        emulator.behavior = (_request, index) => ({
            reason: index < 2 ? 'budget' : 'terminated',
            instructions: 1
        })
        await emulator.run(1000)
        expect(emulator.requests.map((r) => r.timeBudgetMs)).toEqual(
            emulator.requests.map(() => COMPUTE_SLICE_MS)
        )
    })

    it('goes back to the long budget when the renderer goes away', async () => {
        const emulator = new FakeEmulator()
        const unwatch = emulator.peripherals.screen.watch()
        emulator.peripherals.screen.drawPixel(1, 1)
        emulator.behavior = (_request, index) => {
            if (index === 0) unwatch()
            return { reason: index < 1 ? 'budget' : 'terminated', instructions: 1 }
        }
        await emulator.run(1000)
        expect(emulator.requests.map((r) => r.timeBudgetMs)).toEqual([
            SCREEN_SLICE_MS,
            COMPUTE_SLICE_MS
        ])
    })

    it('grows the budget of a Core the estimate was too slow for', async () => {
        const time = controlledPerformanceTime()
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = (_request, index) => {
            //five milliseconds of a fifty millisecond target: the adapter's estimate is ten times
            //too small, and one slice may move the correction by four
            time.advance(5)
            if (index < 3) return { reason: 'budget', instructions: 1_000 }
            return { reason: 'terminated', instructions: 1 }
        }
        await emulator.run(1_000_000)
        expect(emulator.requests.map((r) => r.timeBudgetMs)).toEqual(
            emulator.requests.map(() => COMPUTE_SLICE_MS)
        )
        expect(emulator.requests.map((r) => r.speedCorrection)).toEqual([1, 4, 16, 16])
    })

    it('does not mistake a program’s own wait for a slow Core', async () => {
        const time = controlledPerformanceTime()
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = async (_request, index) => {
            //the MIPS, RISC-V and x86 adapters serve a program's sleep without leaving their slice
            const wait = emulator.peripherals.clock.wait(1)
            time.advance(30)
            await wait
            if (index < 2) return { reason: 'budget', instructions: 1_000 }
            return { reason: 'terminated', instructions: 1 }
        }
        await emulator.run(1_000_000)
        expect(emulator.requests.map((r) => r.speedCorrection)).toEqual([1, 1, 1])
    })

    it('starts again from the adapters’ own estimates after a new Build', async () => {
        const time = controlledPerformanceTime()
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = (_request, index) => {
            time.advance(5)
            if (index < 1) return { reason: 'budget', instructions: 1_000 }
            return { reason: 'terminated', instructions: 1 }
        }
        await emulator.run(1_000_000)
        expect(emulator.requests[1].speedCorrection).toBe(4)
        await emulator.compile(0, '')
        emulator.behavior = () => ({ reason: 'terminated', instructions: 1 })
        await emulator.run(1_000_000)
        expect(emulator.requests[emulator.requests.length - 1].speedCorrection).toBe(1)
    })

    it('resumes after a program-requested wait without charging it', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (request, index) => {
            if (index === 0) {
                return {
                    reason: 'wait',
                    instructions: 10,
                    wait: emulator.peripherals.clock.wait(1)
                }
            }
            return { reason: 'terminated', instructions: 5 }
        }
        await emulator.run(1000)
        expect(emulator.requests).toHaveLength(2)
        expect(emulator.requests[1].instructionBudget).toBe(990)
    })
})

describe('stop', () => {
    it('cancels a run suspended on a wait', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = () => ({
            reason: 'wait',
            instructions: 1,
            //long enough that only the clock's cancellation can end the test
            wait: emulator.peripherals.clock.wait(60_000)
        })
        const run = emulator.run(1000)
        await Promise.resolve()
        //Stop: the same path the GUI takes, which invalidates the generation and resets the clock
        emulator.clear()
        const status = await run
        expect(status).toBe(InterpreterStatus.Terminated)
        //the slice that was waiting is the last one that ever ran
        expect(emulator.requests).toHaveLength(1)
    })
})

describe('pause', () => {
    it('returns from Run at a slice boundary and makes Step and Undo available', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = () => {
            emulator.pause()
            return { reason: 'budget', instructions: 10 }
        }
        expect(await emulator.run(1000)).toBe(InterpreterStatus.Running)
        expect(emulator.paused).toBe(true)
        expect(emulator.requests).toHaveLength(1)
        emulator.undo(1)
        expect(emulator.coreSteps).toBe(9)
        await emulator.step()
        expect(emulator.coreSteps).toBe(10)
        emulator.behavior = () => ({ reason: 'breakpoint', instructions: 2 })
        await emulator.run(1000)
        expect(emulator.coreSteps).toBe(12)
        expect(emulator.paused).toBe(false)
    })

    it('gives the next Run its own limit, just as after a breakpoint', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (request, index) => {
            if (index === 0) emulator.pause()
            return { reason: 'budget', instructions: Math.min(request.instructionBudget, 100) }
        }
        await emulator.run(250)
        await emulator.run(150)
        expect(emulator.requests.map((r) => r.instructionBudget)).toEqual([250, 150, 50])
        expect(emulator.coreSteps).toBe(250)
    })

    it('keeps breakpoints and the speed estimate across separate runs', async () => {
        const time = controlledPerformanceTime()
        const emulator = new FakeEmulator()
        emulator.toggleBreakpoint(7)
        emulator.behavior = (_request, index) => {
            time.advance(5)
            if (index === 0) emulator.pause()
            return { reason: index < 2 ? 'budget' : 'breakpoint', instructions: 1000 }
        }
        await emulator.run(1_000_000)
        await emulator.run(1_000_000)
        expect(emulator.requests.map((r) => r.breakpoints)).toEqual([
            [{ file: 'main', line: 7 }],
            [{ file: 'main', line: 7 }],
            [{ file: 'main', line: 7 }]
        ])
        expect(emulator.requests.map((r) => r.speedCorrection)).toEqual([1, 4, 16])
    })

    it('refreshes the registers, memory and current instruction before returning', async () => {
        const emulator = new FakeEmulator()
        let value = 0n
        emulator._getRegisterValues = () => [value]
        emulator._readMemoryBytes = (_address, length) =>
            new Uint8Array(Number(length)).fill(Number(value))
        emulator._getPc = () => value
        emulator._getNextInstruction = () => ({ lineNumber: Number(value) }) as Instruction
        emulator.behavior = () => {
            value = 3n
            emulator.pause()
            return { reason: 'budget', instructions: 10 }
        }
        await emulator.run(1000)
        expect(emulator.registers[0].value).toBe(3n)
        expect(emulator.memory.global.data.current[0]).toBe(3)
        expect(emulator.pc).toBe(3n)
        expect(emulator.line).toBe(3)
        expect(emulator.canUndo).toBe(true)
    })

    it('finishes a program-requested wait before releasing the Core', async () => {
        const emulator = new FakeEmulator()
        let waited = false
        emulator.behavior = () => {
            emulator.pause()
            return {
                reason: 'wait',
                instructions: 1,
                wait: emulator.peripherals.clock.wait(1).then(() => {
                    waited = true
                })
            }
        }
        await emulator.run(1000)
        expect(waited).toBe(true)
        expect(emulator.paused).toBe(true)
        expect(emulator.requests).toHaveLength(1)
    })

    it('does not carry an idle Pause into the next Run', async () => {
        const emulator = new FakeEmulator()
        emulator.pause()
        emulator.behavior = () => ({ reason: 'breakpoint', instructions: 1 })
        await emulator.run(1000)
        expect(emulator.paused).toBe(false)
        expect(emulator.requests).toHaveLength(1)
    })

    it('allows Build after Pause, and Stop clears the paused program', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = () => {
            emulator.pause()
            return { reason: 'budget', instructions: 1 }
        }
        await emulator.run(1000)
        await emulator.compile(0, '')
        expect(emulator.canExecute).toBe(true)
        expect(emulator.paused).toBe(false)
        await emulator.run(1000)
        emulator.clear()
        expect(emulator.paused).toBe(false)
    })

    it('does not include time spent idle in execution time', async () => {
        const time = controlledPerformanceTime()
        const emulator = new FakeEmulator()
        emulator.behavior = () => {
            time.advance(5)
            emulator.pause()
            return { reason: 'budget', instructions: 1 }
        }
        await emulator.run(1000)
        const elapsed = emulator.executionTime
        time.advance(1000)
        expect(emulator.executionTime).toBe(elapsed)
        expect(elapsed).toBeLessThan(1000)
    })

    it('clears the pause flag if refreshing the Core fails', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = () => {
            emulator.pause()
            emulator._getPc = () => {
                throw new Error('core unreadable')
            }
            return { reason: 'budget', instructions: 1 }
        }
        expect(await emulator.run(1000)).toBe(InterpreterStatus.TerminatedWithException)
        expect(emulator.paused).toBe(false)
    })

    it('serializes a quick Step then Run and rejects synchronous Undo while stepping', async () => {
        const emulator = new FakeEmulator()
        emulator.coreSteps = 2
        let finish!: () => void
        emulator._step = async () => {
            await new Promise<void>((resolve) => {
                finish = resolve
            })
            emulator.coreSteps++
            return { terminated: false }
        }
        emulator.behavior = () => ({ reason: 'breakpoint', instructions: 1 })
        const step = emulator.step()
        const run = emulator.run(100)
        await settle()
        emulator.undo(1)
        expect(emulator.coreSteps).toBe(2)
        expect(emulator.requests).toHaveLength(0)
        finish()
        await Promise.all([step, run])
        expect(emulator.coreSteps).toBe(4)
        expect(emulator.requests).toHaveLength(1)
    })

    it('drops a queued Run when Stop invalidates the pending Step', async () => {
        const emulator = new FakeEmulator()
        let finish!: () => void
        emulator._step = async () => {
            await new Promise<void>((resolve) => {
                finish = resolve
            })
            return { terminated: false }
        }
        const step = emulator.step()
        const run = emulator.run(100)
        await settle()
        emulator.clear()
        finish()
        await Promise.all([step, run])
        expect(emulator.requests).toHaveLength(0)
    })

    it('lets Build cancel an active Run before taking the execution lock', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = () => ({
            reason: 'wait',
            instructions: 1,
            wait: emulator.peripherals.clock.wait(60_000)
        })
        const run = emulator.run(100)
        await settle()
        await emulator.compile(10, '')
        expect(await run).toBe(InterpreterStatus.Terminated)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.requests).toHaveLength(1)
    })
})

describe('undo', () => {
    it('lets the adapter restore its Screen effects exactly once', () => {
        const emulator = new FakeEmulator()
        const screen = emulator.peripherals.screen
        emulator.coreSteps = 4
        screen.setPenColor(0xff0000)
        screen.drawPixel(2, 2)
        emulator._undo = () => {
            emulator.coreSteps--
            screen.undo()
        }
        expect(screen.getPixel(2, 2)).toBe(0xff0000)
        emulator.undo(1)
        expect(screen.getPixel(2, 2)).toBe(screen.backgroundColor)
        expect(emulator.coreSteps).toBe(3)
        expect(screen.penColor).toBe(0xff0000)
    })

    it('offers the smaller of the two histories', () => {
        const emulator = new FakeEmulator()
        const screen = emulator.peripherals.screen
        //room for two one-pixel records and nothing more, so the budget drops the older ones
        screen.history.byteBudget = 2 * (RECORD_OVERHEAD_BYTES + 4)
        emulator.coreSteps = 10
        const history = new ScreenInstructionHistory(screen, 10)
        for (let i = 0; i < 5; i++) {
            const before = screen.history.sequence
            screen.drawPixel(i, 0)
            history.record(i + 6, before)
        }
        emulator._canUndo = () =>
            emulator.coreSteps > 0 && history.canUndoAfter(emulator.coreSteps - 1)
        emulator._undo = () => {
            emulator.coreSteps--
            history.undoAfter(emulator.coreSteps)
        }
        expect(screen.history.depth).toBe(2)
        expect(screen.history.sequence).toBe(5)

        emulator.undo(2)
        expect(emulator.coreSteps).toBe(8)
        //the Screen can no longer restore, so the Core is not offered a deeper Undo either
        expect(emulator.canUndo).toBe(false)
        emulator.undo(1)
        expect(emulator.coreSteps).toBe(8)
    })

    it('never limits a program that drew nothing', () => {
        const emulator = new FakeEmulator()
        emulator.coreSteps = 3
        emulator.undo(3)
        expect(emulator.coreSteps).toBe(0)
    })

    it('calls the memory re-sync hook of a framebuffer adapter', () => {
        const emulator = new FakeEmulator()
        let resynced = 0
        emulator._resyncScreenFromMemory = () => {
            resynced++
        }
        emulator.coreSteps = 2
        emulator.undo(2)
        //once for the whole rollback, not once per step: it re-reads a whole region
        expect(resynced).toBe(1)
        //and not at all when there was nothing to roll back
        emulator.coreSteps = 0
        emulator.undo(1)
        expect(resynced).toBe(1)
    })
})

describe('reset', () => {
    it('clears every peripheral on the Terminal’s path', () => {
        const emulator = new FakeEmulator()
        const { terminal, screen, keyboard, mouse } = emulator.peripherals
        terminal.write('output')
        screen.drawPixel(3, 3)
        screen.setDoubleBuffering(true)
        keyboard.typeText('hi')
        keyboard.pressKey(0x41)
        mouse.buttonDown('left', 5, 6)

        emulator.clear()

        expect(terminal.output).toBe('')
        expect(screen.getPixel(3, 3)).toBe(screen.backgroundColor)
        expect(screen.doubleBuffering).toBe(false)
        expect(screen.history.sequence).toBe(0)
        expect(keyboard.hasTypedInput()).toBe(false)
        expect(keyboard.anyKeyDown()).toBe(false)
        expect(mouse.lastDown().event).toBe(0)
    })

    it('restarts the clock', async () => {
        const emulator = new FakeEmulator()
        const clock = emulator.peripherals.clock
        await clock.wait(2)
        expect(clock.now()).toBeGreaterThan(0)
        emulator.clear()
        expect(clock.now()).toBeLessThan(2)
    })
})

describe('testcase run configuration', () => {
    it('selects scripted input and virtual time together, and restores them', async () => {
        const emulator = new FakeEmulator()
        const interactive = emulator.peripherals.clock
        let insideTest: { input: string; virtual: boolean } | null = null
        emulator._runTestcase = async () => {
            insideTest = {
                input: emulator.peripherals.terminal.inputSource,
                virtual: emulator.peripherals.clock.isVirtual
            }
            //a virtual wait completes at once and advances the clock, so a test never sleeps
            await emulator.peripherals.clock.wait(5000)
        }
        await emulator.runTestcase(emptyTestcase, 100)
        expect(insideTest).toEqual({ input: 'scripted', virtual: true })
        expect(emulator.peripherals.terminal.inputSource).toBe('interactive')
        expect(emulator.peripherals.clock).toBe(interactive)
        expect(emulator.peripherals.clock.isVirtual).toBe(false)
    })

    it('restores them after a testcase that threw', async () => {
        const emulator = new FakeEmulator()
        emulator._runTestcase = async () => {
            throw new Error('boom')
        }
        await emulator.runTestcase(emptyTestcase, 100)
        expect(emulator.peripherals.terminal.inputSource).toBe('interactive')
        expect(emulator.peripherals.clock.isVirtual).toBe(false)
    })
})

describe('pokes', () => {
    /** A built fake Core with nothing logged yet, which is where every Poke below starts. */
    async function pokeableEmulator(): Promise<FakeEmulator> {
        const emulator = new FakeEmulator({ automaticChecking: false })
        await emulator.compile(0, undefined)
        emulator.pokeLog = []
        return emulator
    }

    it('is possible exactly when a Step is', async () => {
        const emulator = new FakeEmulator({ automaticChecking: false })
        //before a Build there is no session to poke
        emulator.setSessionState({ canExecute: false })
        expect(emulator.canPoke).toBe(false)
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'R0')).toBe(false)
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 1n }])).toBe(
            false
        )
        expect(emulator.pokeMemory(0x1000n, new Uint8Array([1]))).toBe(false)

        await emulator.compile(0, undefined)
        expect(emulator.canPoke).toBe(true)

        //a terminated program is not poked: undoing the Poke would resume the machine
        emulator.setSessionState({ terminated: true })
        expect(emulator.canPoke).toBe(false)
        //nor is one suspended on an Interrupt, which owns the Core until it is answered
        emulator.setSessionState({ terminated: false, interrupt: { type: 'ReadInput' } })
        expect(emulator.canPoke).toBe(false)
        emulator.setSessionState({ interrupt: undefined })
        expect(emulator.canPoke).toBe(true)
        //nothing above opened a transaction
        expect(emulator.pokeLog).toEqual([])
    })

    it('is refused while a Core operation is in flight, and possible again after it', async () => {
        const emulator = await pokeableEmulator()
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        emulator._step = async () => {
            await gate
            return { terminated: false }
        }
        const stepping = emulator.step()
        await settle()
        expect(emulator.canPoke).toBe(false)
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 1n }])).toBe(
            false
        )
        expect(emulator.pokeMemory(0x1000n, new Uint8Array([1]))).toBe(false)
        expect(emulator.pokeLog).toEqual([])
        release()
        await stepping
        expect(emulator.canPoke).toBe(true)
    })

    it('refuses the program counter and the registers the Core hides', async () => {
        const emulator = await pokeableEmulator()
        emulator.setSessionState({
            //the CPU registers a Testcase may seed, as MIPS and x86 report them
            startingRegisterNames: ['R0', 'zero', 'pc', 'rip'],
            hiddenRegisters: ['zero']
        })
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'R0')).toBe(true)
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'zero')).toBe(false)
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'pc')).toBe(false)
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'rip')).toBe(false)
        //`hi` and `lo` are read but never set, so the Core does not offer them at all
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, 'hi')).toBe(false)
        expect(emulator.canPokeRegister('nosuchfile', 'f0')).toBe(false)
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'pc', value: 1n }])).toBe(
            false
        )
        //one refused register refuses the whole Poke, which is one step or none
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [
                { register: 'R0', value: 1n },
                { register: 'pc', value: 1n }
            ])
        ).toBe(false)
        expect(emulator.pokeLog).toEqual([])
    })

    it('refuses a row the Core blanked, which holds no value to change', async () => {
        const emulator = await pokeableEmulator()
        expect(emulator.canPokeRegister('fpu', 'f1')).toBe(true)
        emulator.fileBlanks = [false, true]
        emulator.refreshPanels(true)
        expect(emulator.canPokeRegister('fpu', 'f0')).toBe(true)
        expect(emulator.canPokeRegister('fpu', 'f1')).toBe(false)
        expect(emulator.canPokeRegister('fpu', 'f2')).toBe(false)
    })

    it('brackets exactly the writes of one Poke in one transaction', async () => {
        const emulator = await pokeableEmulator()
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 0x2an }])
        ).toBe(true)
        expect(emulator.pokeLog).toEqual(['begin', 'register R0=42 at 4 bytes', 'end'])
        expect(emulator.pokeOpen).toBe(false)
    })

    it('writes a Register file register through its own setter, several in one step', async () => {
        const emulator = await pokeableEmulator()
        expect(
            emulator.pokeRegisters('fpu', [
                { register: 'f0', value: 0x3ff8000000000000n },
                { register: 'f1', value: 2n }
            ])
        ).toBe(true)
        //one transaction for both writes, which is how a MIPS double reaches its register pair
        expect(emulator.pokeLog).toEqual([
            'begin',
            `file fpu.f0=${0x3ff8000000000000n}`,
            'file fpu.f1=2',
            'end'
        ])
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers.map((register) => register.value)).toEqual([0x3ff8000000000000n, 2n])
    })

    it('records nothing when the value is the one the register already holds', async () => {
        const emulator = await pokeableEmulator()
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 0n }])).toBe(
            false
        )
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [])).toBe(false)
        expect(emulator.pokeLog).toEqual([])
        //the writes that do change something are still made, without the ones that do not
        expect(
            emulator.pokeRegisters('fpu', [
                { register: 'f0', value: 0n },
                { register: 'f1', value: 5n }
            ])
        ).toBe(true)
        expect(emulator.pokeLog).toEqual(['begin', 'file fpu.f1=5', 'end'])
    })

    it('drops a write the register already holds under another sign', async () => {
        const emulator = await pokeableEmulator()
        //MIPS and RISC-V report their CPU registers signed, so a register of all ones reads `-1n`
        //here while a poked value is unsigned by contract: the two are the same bits, and a Poke
        //of the digits the panel is showing has nothing to record
        emulator.registerValue = -1n
        emulator.rebuildRegistersFromCore()
        expect(emulator.registers[0].value).toBe(-1n)
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 0xffffffffn }])
        ).toBe(false)
        expect(emulator.pokeLog).toEqual([])
        //a value that is not those bits is still poked
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 0xfffffffen }])
        ).toBe(true)
        expect(emulator.pokeLog).toEqual(['begin', `register R0=${0xfffffffen} at 4 bytes`, 'end'])
    })

    it('refuses a value that does not fit the register, rather than truncating it', async () => {
        const emulator = await pokeableEmulator()
        expect(() =>
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [
                { register: 'R0', value: 0x1_0000_0000n }
            ])
        ).toThrow(/does not fit R0, which is 32 bits wide/)
        expect(() =>
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: -1n }])
        ).toThrow(/does not fit R0/)
        //the wide value of a wider file is fine there
        expect(
            emulator.pokeRegisters('fpu', [{ register: 'f0', value: 0xffffffffffffffffn }])
        ).toBe(true)
        expect(() => emulator.pokeRegisters('fpu', [{ register: 'f1', value: 1n << 64n }])).toThrow(
            /does not fit f1, which is 64 bits wide/
        )
        //a refused value opened no transaction and left nothing for the panels to report
        expect(emulator.pokeOpen).toBe(false)
        expect(emulator.errors).toEqual([])
    })

    it('pokes a run of memory bytes as one step, and re-syncs a memory backed Screen', async () => {
        const emulator = await pokeableEmulator()
        expect(emulator.pokeMemory(0x2000n, new Uint8Array([1, 2, 3, 4]))).toBe(true)
        expect(emulator.pokeLog).toEqual(['begin', 'memory $2000=1,2,3,4', 'end'])
        expect(emulator.screenResyncs).toBe(1)
        expect([...emulator.readMemoryBytes(0x2000n, 4)]).toEqual([1, 2, 3, 4])

        emulator.pokeLog = []
        //the same bytes again change nothing, so no transaction and no re-paint
        expect(emulator.pokeMemory(0x2000n, new Uint8Array([1, 2, 3, 4]))).toBe(false)
        expect(emulator.pokeMemory(0x2000n, new Uint8Array())).toBe(false)
        expect(emulator.pokeLog).toEqual([])
        expect(emulator.screenResyncs).toBe(1)
    })

    it('refreshes the panels and the Undo state the way an Undo does', async () => {
        const emulator = await pokeableEmulator()
        expect(emulator.canUndo).toBe(false)
        const memoryReads = emulator.memoryReads
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 7n }])).toBe(
            true
        )
        //the registers are read back out of the Core, with the previous value left to highlight
        expect(emulator.registers[0].value).toBe(7n)
        expect(emulator.registers[0].prev).toBe(0n)
        expect(emulator.memoryReads).toBeGreaterThan(memoryReads)
        //a recorded Poke is undoable like an instruction and is a History row of its own
        expect(emulator.canUndo).toBe(true)
        expect(emulator.latestSteps.map((step) => step.kind)).toEqual(['poke'])
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.canUndo).toBe(false)
        expect(emulator.latestSteps).toEqual([])
    })

    it('applies a Poke the Core kept no history for, and says it recorded nothing', async () => {
        const emulator = await pokeableEmulator()
        //a history Setting of 0 records nothing, for a Poke as for an instruction
        emulator.pokeRecords = false
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 9n }])).toBe(
            false
        )
        expect(emulator.pokeLog).toEqual(['begin', 'register R0=9 at 4 bytes', 'end'])
        expect(emulator.registers[0].value).toBe(9n)
        expect(emulator.canUndo).toBe(false)
    })

    it('closes the transaction when a setter throws, and reports the failure', async () => {
        const emulator = await pokeableEmulator()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        emulator._setRegisterValue = () => {
            throw new Error('the Core refused')
        }
        expect(() =>
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'R0', value: 1n }])
        ).toThrow('the Core refused')
        //a Core left journaling into an entry nothing ends would swallow the next instruction
        expect(emulator.pokeOpen).toBe(false)
        expect(emulator.pokeLog).toEqual(['begin', 'end'])
        expect(emulator.errors).toEqual(['Error: the Core refused'])
    })

    it('shows what a Poke wrote before a setter threw, rather than hiding it', async () => {
        const emulator = await pokeableEmulator()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const write = emulator._setRegisterFileValue.bind(emulator)
        emulator._setRegisterFileValue = (id: string, register: string, value: bigint) => {
            if (register === 'f1') throw new Error('the Core refused')
            write(id, register, value)
        }
        expect(() =>
            emulator.pokeRegisters('fpu', [
                { register: 'f0', value: 1n },
                { register: 'f1', value: 2n }
            ])
        ).toThrow('the Core refused')
        expect(emulator.pokeLog).toEqual(['begin', 'file fpu.f0=1', 'end'])
        //the Core kept the write that landed, so the panels and the Undo state say so: a refresh
        //skipped here leaves the user with no sign of a change the next Undo would revert
        const [, fpu] = emulator.registerFiles
        expect(fpu.registers[0].value).toBe(1n)
        expect(emulator.canUndo).toBe(true)
        expect(emulator.latestSteps.map((step) => step.kind)).toEqual(['poke'])
    })
})

/** Lets every pending microtask and timer of a paused or waiting run land. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 1))
}

/** A Core consumes wall time inside a slice; control it so host load cannot change the assertion. */
function controlledPerformanceTime(): { advance(milliseconds: number): void } {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    return {
        advance(milliseconds: number): void {
            now += milliseconds
        }
    }
}
