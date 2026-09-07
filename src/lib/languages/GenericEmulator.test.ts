import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import {
    EmulatorStatus,
    type CompileResult,
    type Instruction
} from '$lib/languages/BaseEmulator.svelte'
import {
    InterpreterStatus,
    RegisterSize,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
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
        super('', { systemSize: RegisterSize.Long, registerNames: ['R0'] }, options)
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

    _writeMemoryBytes(): void {}

    /** How many times the panels have read the Core, so a test can count refreshes. */
    memoryReads = 0

    _readMemoryBytes(_address: bigint, length: bigint): Uint8Array {
        this.memoryReads += 1
        return new Uint8Array(Number(length))
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

    _getUndoHistory(): ExecutionStep[] {
        return []
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
        return [0n]
    }

    _getRegisterValuesRecord(): Record<FakeRegister, bigint> {
        return { R0: 0n }
    }

    _getRegisterValue(): bigint {
        return 0n
    }

    _setRegisterValue(): void {}
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

    it('starts again from the adapters’ own estimates after a clear', async () => {
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
        emulator.clear()
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
        expect(emulator.requests.map((r) => r.breakpoints)).toEqual([[7], [7], [7]])
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
