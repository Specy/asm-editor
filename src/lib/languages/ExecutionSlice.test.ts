import { describe, expect, it } from 'vitest'
import {
    COMPUTE_SLICE_MS,
    MAX_SPEED_CORRECTION,
    MIN_SLICE_CHUNK,
    MIN_SPEED_CORRECTION,
    nextSliceChunk,
    nextSpeedCorrection,
    SCREEN_SLICE_MS,
    sliceDeadline,
    sliceInstructionBudget,
    type ExecutionSliceRequest
} from '$lib/languages/ExecutionSlice'

/**
 * The pure half of the scheduling contract ([ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)):
 * turning a time budget into instructions, and the chunking an adapter uses when its instructions do
 * not all cost the same. The policy itself is tested through a fake adapter in
 * `GenericEmulator.test.ts`.
 */

function request(overrides: Partial<ExecutionSliceRequest> = {}): ExecutionSliceRequest {
    const base: ExecutionSliceRequest = {
        instructionBudget: 1_000_000,
        timeBudgetMs: COMPUTE_SLICE_MS,
        breakpoints: [],
        runInstructionLimit: 1_000_000,
        speedCorrection: 1
    }
    return Object.assign(base, overrides)
}

describe('sliceInstructionBudget', () => {
    it('turns the time budget into instructions with the adapter’s own estimate', () => {
        expect(sliceInstructionBudget(request(), 1_000)).toBe(COMPUTE_SLICE_MS * 1_000)
    })

    it('never runs past what is left of the run’s limit', () => {
        expect(sliceInstructionBudget(request({ instructionBudget: 40 }), 1_000)).toBe(40)
    })

    it('always runs at least one instruction', () => {
        expect(sliceInstructionBudget(request({ timeBudgetMs: 0 }), 0)).toBe(1)
    })

    it('is shorter while a Screen is waiting to be painted', () => {
        expect(SCREEN_SLICE_MS).toBeLessThan(COMPUTE_SLICE_MS)
    })

    it('multiplies the estimate by what the scheduler has learned', () => {
        expect(sliceInstructionBudget(request({ speedCorrection: 4 }), 1_000)).toBe(
            COMPUTE_SLICE_MS * 4_000
        )
    })
})

describe('nextSpeedCorrection', () => {
    it('grows when a slice came back faster than its target', () => {
        //5 ms of a 50 ms target is ten times too small, and one slice may move it by four
        expect(nextSpeedCorrection(1, 50, 5)).toBe(4)
        expect(nextSpeedCorrection(4, 50, 20)).toBe(10)
    })

    it('shrinks when a slice held the host for longer than its target', () => {
        expect(nextSpeedCorrection(1, 50, 100)).toBe(0.5)
    })

    it('stays inside its bounds', () => {
        expect(nextSpeedCorrection(MAX_SPEED_CORRECTION, 50, 1)).toBe(MAX_SPEED_CORRECTION)
        expect(nextSpeedCorrection(MIN_SPEED_CORRECTION, 50, 10_000)).toBe(MIN_SPEED_CORRECTION)
    })

    it('learns nothing from a slice too short to time', () => {
        expect(nextSpeedCorrection(2, 50, 0.4)).toBe(2)
    })
})

describe('sliceDeadline', () => {
    it('is the time budget away from now', () => {
        const deadline = sliceDeadline(request({ timeBudgetMs: 25 }))
        const distance = deadline - performance.now()
        expect(distance).toBeGreaterThan(20)
        expect(distance).toBeLessThanOrEqual(25)
    })
})

describe('nextSliceChunk', () => {
    it('grows a chunk that cost less than its share of the budget', () => {
        //1 000 instructions took a tenth of the 10 ms it was allowed, so ten times as many fit
        expect(nextSliceChunk(1_000, 10, 1, 1_000_000)).toBe(10_000)
    })

    it('shrinks a chunk that cost more, which is the drawing loop case', () => {
        //1 000 instructions that cleared the Screen a hundred times took 100 ms of a 10 ms share
        expect(nextSliceChunk(1_000, 10, 100, 1_000_000)).toBe(MIN_SLICE_CHUNK)
        expect(nextSliceChunk(100_000, 10, 100, 1_000_000)).toBe(10_000)
    })

    it('keeps a chunk between the floor and the cap', () => {
        expect(nextSliceChunk(1_000, 10, 0, 4_000)).toBe(4_000)
        expect(nextSliceChunk(1_000, 10, 1_000_000, 4_000)).toBe(MIN_SLICE_CHUNK)
        //a cap below the floor still leaves a chunk that runs something
        expect(nextSliceChunk(1_000, 10, 1, 4)).toBe(MIN_SLICE_CHUNK)
    })
})
