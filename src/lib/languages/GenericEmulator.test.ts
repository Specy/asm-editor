import { afterEach, describe, expect, it } from 'vitest'
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
    SCREEN_SLICE_MS,
    type ExecutionSlice,
    type ExecutionSliceRequest
} from '$lib/languages/ExecutionSlice'
import { Screen } from '$lib/languages/peripherals/screen/Screen'
import { RECORD_OVERHEAD_BYTES } from '$lib/languages/peripherals/screen/ScreenHistory'
import type { Testcase } from '$lib/Project.svelte'
import { settingsStore } from '$stores/settingsStore.svelte'

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

    _readMemoryBytes(_address: bigint, length: bigint): Uint8Array {
        return new Uint8Array(Number(length))
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

const budgetSetting = settingsStore.values.screenHistoryBudgetMb.value
const showScreenSetting = settingsStore.values.showScreen.value

afterEach(() => {
    settingsStore.values.screenHistoryBudgetMb.value = budgetSetting
    settingsStore.values.showScreen.value = showScreenSetting
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

    it('takes the Screen history budget from the settings', () => {
        settingsStore.values.screenHistoryBudgetMb.value = 2
        const emulator = new FakeEmulator()
        expect(emulator.peripherals.screen.history.byteBudget).toBe(2 * 1024 * 1024)
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

    it('asks for the short budget only while a Screen is showing unpainted pixels', async () => {
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
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = (_request, index) => {
            //five milliseconds of a fifty millisecond target: the adapter's estimate is ten times
            //too small, and one slice may move the correction by four
            burnMilliseconds(5)
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
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = async (_request, index) => {
            //the MIPS, RISC-V and x86 adapters serve a program's sleep without leaving their slice
            await emulator.peripherals.clock.wait(30)
            if (index < 2) return { reason: 'budget', instructions: 1_000 }
            return { reason: 'terminated', instructions: 1 }
        }
        await emulator.run(1_000_000)
        expect(emulator.requests.map((r) => r.speedCorrection)).toEqual([1, 1, 1])
    })

    it('starts again from the adapters’ own estimates after a clear', async () => {
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.behavior = (_request, index) => {
            burnMilliseconds(5)
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

describe('pause and resume', () => {
    it('parks the run at a slice boundary and stops advancing', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (request, index) => {
            if (index === 0) emulator.pause()
            return { reason: 'budget', instructions: Math.min(request.instructionBudget, 10) }
        }
        const run = emulator.run(1000)
        await settle()
        expect(emulator.paused).toBe(true)
        //the slice that asked for the pause is the last one that ran, and it stays that way
        expect(emulator.requests).toHaveLength(1)
        await settle()
        expect(emulator.requests).toHaveLength(1)
        emulator.resume()
        emulator.behavior = () => ({ reason: 'terminated', instructions: 1 })
        await run
        expect(emulator.paused).toBe(false)
    })

    it('carries on from where it parked, with the limit intact', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (request, index) => {
            if (index === 0) emulator.pause()
            return { reason: 'budget', instructions: Math.min(request.instructionBudget, 100) }
        }
        const run = emulator.run(250)
        await settle()
        expect(emulator.paused).toBe(true)
        emulator.resume()
        await run
        //the same three slices the un-paused run makes: the limit did not restart with the program
        expect(emulator.requests.map((r) => r.instructionBudget)).toEqual([250, 150, 50])
        expect(emulator.coreSteps).toBe(250)
    })

    it('keeps the breakpoints and the speed correction across the pause', async () => {
        const emulator = new FakeEmulator()
        emulator.peripherals.screen.markPainted()
        emulator.toggleBreakpoint(7)
        emulator.behavior = (_request, index) => {
            burnMilliseconds(5)
            if (index === 0) emulator.pause()
            if (index < 2) return { reason: 'budget', instructions: 1_000 }
            return { reason: 'terminated', instructions: 1 }
        }
        const run = emulator.run(1_000_000)
        await settle()
        expect(emulator.paused).toBe(true)
        emulator.resume()
        await run
        expect(emulator.requests.map((r) => r.breakpoints)).toEqual(
            emulator.requests.map(() => [7])
        )
        //what the first slice taught is still there after the pause, rather than back at 1
        expect(emulator.requests.map((r) => r.speedCorrection)).toEqual([1, 4, 16])
    })

    it('shows where the program got to instead of where it started', async () => {
        const emulator = new FakeEmulator()
        //a register and a memory byte the "Core" only reveals once the run has moved
        let value = 0n
        emulator._getRegisterValues = () => [value]
        emulator._readMemoryBytes = (_address, length) =>
            new Uint8Array(Number(length)).fill(Number(value))
        emulator._getPc = () => value
        emulator._getFlags = () => [{ name: 'Z', value: Number(value) }]
        emulator._getNextInstruction = () => ({ lineNumber: Number(value) }) as Instruction
        emulator.behavior = (_request, index) => {
            if (index === 0) {
                value = 3n
                emulator.pause()
            }
            return { reason: 'budget', instructions: 10 }
        }
        const run = emulator.run(1000)
        await settle()
        expect(emulator.paused).toBe(true)
        expect(emulator.registers[0].value).toBe(3n)
        expect(emulator.memory.global.data.current[0]).toBe(3)
        expect(emulator.pc).toBe(3n)
        expect(emulator.statusRegisters[0].value).toBe(1)
        expect(emulator.line).toBe(3)
        //the Core has steps behind it, so Undo is offered while parked
        expect(emulator.canUndo).toBe(true)
        emulator.clear()
        await run
    })

    it('takes the pause after a program-requested wait rather than skipping it', async () => {
        const emulator = new FakeEmulator()
        let waited = false
        emulator.behavior = (_request, index) => {
            if (index === 0) {
                emulator.pause()
                return {
                    reason: 'wait',
                    instructions: 1,
                    wait: emulator.peripherals.clock.wait(1).then(() => {
                        waited = true
                    })
                }
            }
            return { reason: 'terminated', instructions: 1 }
        }
        const run = emulator.run(1000)
        await settle()
        expect(waited).toBe(true)
        expect(emulator.paused).toBe(true)
        expect(emulator.requests).toHaveLength(1)
        emulator.resume()
        await run
        expect(emulator.requests).toHaveLength(2)
    })

    it('does nothing when no run is in flight', async () => {
        const emulator = new FakeEmulator()
        emulator.pause()
        expect(emulator.paused).toBe(false)
        emulator.behavior = (_request, index) => ({
            reason: index < 1 ? 'budget' : 'terminated',
            instructions: 1
        })
        //the request is not remembered: the next run is not stopped before its first slice
        await emulator.run(1000)
        expect(emulator.paused).toBe(false)
        expect(emulator.requests).toHaveLength(2)
    })

    it('is torn down by Stop, which also frees the Build path', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (_request, index) => {
            if (index === 0) emulator.pause()
            return { reason: 'budget', instructions: 1 }
        }
        const run = emulator.run(1000)
        await settle()
        expect(emulator.paused).toBe(true)
        //Stop, and the same call a Build makes first
        emulator.clear()
        const status = await run
        expect(status).toBe(InterpreterStatus.Terminated)
        expect(emulator.paused).toBe(false)
        //the parked slice is the last one that ever ran
        expect(emulator.requests).toHaveLength(1)
        //and the emulator is idle again, not still holding a core operation
        await emulator.compile(0, '')
        expect(emulator.canExecute).toBe(true)
    })

    it('leaves the paused time out of the reported execution time', async () => {
        const emulator = new FakeEmulator()
        emulator.behavior = (_request, index) => {
            if (index === 0) emulator.pause()
            return { reason: index < 1 ? 'budget' : 'terminated', instructions: 1 }
        }
        const run = emulator.run(1000)
        await settle()
        burnMilliseconds(30)
        emulator.resume()
        await run
        expect(emulator.executionTime).toBeLessThan(30)
    })
})

describe('undo', () => {
    it('rolls the Screen back with the Core', () => {
        const emulator = new FakeEmulator()
        const screen = emulator.peripherals.screen
        emulator.coreSteps = 4
        screen.setPenColor(0xff0000)
        screen.drawPixel(2, 2)
        expect(screen.getPixel(2, 2)).toBe(0xff0000)
        emulator.undo(1)
        expect(screen.getPixel(2, 2)).toBe(screen.backgroundColor)
        expect(emulator.coreSteps).toBe(3)
    })

    it('offers the smaller of the two histories', () => {
        const emulator = new FakeEmulator()
        const screen = emulator.peripherals.screen
        //room for two one-pixel records and nothing more, so the budget drops the older ones
        screen.history.byteBudget = 2 * (RECORD_OVERHEAD_BYTES + 4)
        emulator.coreSteps = 10
        for (let i = 0; i < 5; i++) screen.drawPixel(i, 0)
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

/** Holds the host for a while, which is what a Core does inside a slice. */
function burnMilliseconds(milliseconds: number): void {
    const until = performance.now() + milliseconds
    while (performance.now() < until) {
        //a busy loop is the point: a slice is measured by the wall clock it holds
    }
}
