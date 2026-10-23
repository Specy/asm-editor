import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
    MarsSlicePacer,
    MAX_MARS_CHUNK_GROWTH,
    MIN_MARS_CHUNK,
    nextMarsChunk,
    type MarsChunkOutcome
} from '#lib/languages/mars/marsSlice.ts'
import { COMPUTE_SLICE_MS, type ExecutionSliceRequest } from '#lib/languages/ExecutionSlice.ts'

/**
 * The chunking of a MIPS or RISC-V slice, on a fake Core: what a chunk costs is scripted, so the
 * sizing and the deadline can be checked without a clock or a real sleep.
 */

const TARGET_MS = 1

function request(overrides: Partial<ExecutionSliceRequest> = {}): ExecutionSliceRequest {
    const base: ExecutionSliceRequest = {
        instructionBudget: 1_000_000,
        timeBudgetMs: COMPUTE_SLICE_MS,
        breakpoints: [],
        skipBreakpointAtPc: true,
        runInstructionLimit: 1_000_000,
        speedCorrection: 1
    }
    return Object.assign(base, overrides)
}

/**
 * A Core whose chunks cost what the script says in wall time, end how it says and execute what it
 * says, the whole limit unless told otherwise.
 */
function fakeCore(
    cost: (
        limit: number,
        index: number
    ) => { ms: number; outcome?: MarsChunkOutcome; executed?: number }
) {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const limits: number[] = []
    const runChunk = async (limit: number) => {
        const spent = cost(limit, limits.length)
        limits.push(limit)
        now += spent.ms
        return { outcome: spent.outcome ?? 'ran', instructions: spent.executed ?? limit }
    }
    return { limits, runChunk }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('nextMarsChunk', () => {
    it('grows a chunk that came back at once by at most the growth factor', () => {
        expect(nextMarsChunk(100, TARGET_MS, 0, 1_000_000)).toBe(100 * MAX_MARS_CHUNK_GROWTH)
        expect(nextMarsChunk(100, TARGET_MS, 0.001, 1_000_000)).toBe(100 * MAX_MARS_CHUNK_GROWTH)
    })

    it('aims a chunk that cost more than the target at the target, down to the floor', () => {
        //a hundred instructions in four milliseconds: a millisecond is twenty five of them, which
        //is under the floor
        expect(nextMarsChunk(100, TARGET_MS, 4, 1_000_000)).toBe(MIN_MARS_CHUNK)
        expect(nextMarsChunk(10_000, TARGET_MS, 4, 1_000_000)).toBe(2_500)
    })

    it('never asks for more than the cap and never for less than one instruction', () => {
        expect(nextMarsChunk(100, TARGET_MS, 0, 150)).toBe(150)
        expect(nextMarsChunk(MIN_MARS_CHUNK, TARGET_MS, 0, 10)).toBe(10)
        expect(nextMarsChunk(1, TARGET_MS, 1_000, 1)).toBe(1)
    })
})

describe('MarsSlicePacer', () => {
    it('spends a compute slice in chunks that grow to the target and ends it on the deadline', async () => {
        //a Core running a thousand instructions a millisecond, as MIPS does
        const core = fakeCore((limit) => ({ ms: limit / 1_000 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        const slice = await pacer.run(request(), 1_000, core.runChunk)
        expect(slice.reason).toBe('budget')
        //the first chunk is the floor, and every one after grows by the factor until it costs the
        //target, from where it stays
        expect(core.limits.slice(0, 5)).toEqual([64, 128, 256, 512, 1_000])
        //a chunk short of the target by the fake clock's rounding is still the target's worth, and
        //the last chunk is whatever the budget had left
        for (const chunk of core.limits.slice(5, -1)) {
            expect(chunk).toBeGreaterThanOrEqual(999)
            expect(chunk).toBeLessThanOrEqual(1_000)
        }
        expect(core.limits[core.limits.length - 1]).toBeLessThanOrEqual(1_000)
        expect(slice.instructions).toBe(core.limits.reduce((sum, limit) => sum + limit, 0))
        expect(performance.now()).toBeGreaterThanOrEqual(COMPUTE_SLICE_MS)
        expect(performance.now()).toBeLessThan(COMPUTE_SLICE_MS + TARGET_MS)
    })

    it('never runs past the budget and reports the budget when it is spent', async () => {
        const core = fakeCore(() => ({ ms: 0 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        const slice = await pacer.run(
            request({ instructionBudget: 300, timeBudgetMs: 1_000 }),
            1_000,
            core.runChunk
        )
        expect(slice).toEqual({ reason: 'budget', instructions: 300 })
        expect(core.limits).toEqual([64, 128, 108])
    })

    it('ends the slice at a sleep, charged what ran and with no promise to wait for', async () => {
        //two chunks of drawing, then one that reaches the sleep forty instructions in and spends
        //eighty milliseconds in it
        const core = fakeCore((_limit, index) =>
            index === 2 ? { ms: 80, outcome: 'paused', executed: 40 } : { ms: 0 }
        )
        const pacer = new MarsSlicePacer(TARGET_MS)
        const slice = await pacer.run(request(), 1_000, core.runChunk)
        expect(slice).toEqual({ reason: 'wait', instructions: 64 + 128 + 40 })
        expect(core.limits).toEqual([64, 128, 256])
    })

    it('keeps the chunk a sleep ended, which the sleep says nothing about', async () => {
        const core = fakeCore((_limit, index) =>
            index === 1
                ? { ms: 80, outcome: 'paused', executed: 10 }
                : { ms: 0, outcome: index === 0 ? 'ran' : 'terminated' }
        )
        const pacer = new MarsSlicePacer(TARGET_MS)
        await pacer.run(request(), 1_000, core.runChunk)
        await pacer.run(request(), 1_000, core.runChunk)
        //sized down from eighty milliseconds the next slice's chunk would be the floor; kept, it is
        //the one that slept
        expect(core.limits).toEqual([64, 128, 128])
    })

    it('ends the slice on a breakpoint or the end of the program, charging what ran', async () => {
        const core = fakeCore((_limit, index) =>
            index === 1 ? { ms: 0, outcome: 'breakpoint', executed: 7 } : { ms: 0 }
        )
        const pacer = new MarsSlicePacer(TARGET_MS)
        expect(await pacer.run(request(), 1_000, core.runChunk)).toEqual({
            reason: 'breakpoint',
            instructions: 64 + 7
        })
        const ending = fakeCore(() => ({ ms: 0, outcome: 'terminated', executed: 3 }))
        expect(await pacer.run(request(), 1_000, ending.runChunk)).toEqual({
            reason: 'terminated',
            instructions: 3
        })
    })

    it('ends a slice whose chunk ran nothing instead of spinning on it', async () => {
        const core = fakeCore(() => ({ ms: 0, executed: 0 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        expect(await pacer.run(request(), 1_000, core.runChunk)).toEqual({
            reason: 'budget',
            instructions: 0
        })
        expect(core.limits).toEqual([64])
    })

    it('forgets the learned chunk at reset', async () => {
        const core = fakeCore((limit) => ({ ms: limit / 1_000 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        await pacer.run(request(), 1_000, core.runChunk)
        pacer.reset()
        await pacer.run(request({ instructionBudget: 1 }), 1_000, core.runChunk)
        expect(core.limits[core.limits.length - 1]).toBe(1)
        await pacer.run(request(), 1_000, core.runChunk)
        //the chunk after the reset starts from the floor again, capped by that one-instruction slice
        expect(core.limits[core.limits.length - 1]).toBeLessThanOrEqual(1_000)
    })
})
