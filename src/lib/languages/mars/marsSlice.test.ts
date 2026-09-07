import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    MarsSlicePacer,
    MAX_MARS_CHUNK_GROWTH,
    MIN_MARS_CHUNK,
    nextMarsChunk,
    type MarsChunkOutcome
} from '$lib/languages/mars/marsSlice'
import { COMPUTE_SLICE_MS, type ExecutionSliceRequest } from '$lib/languages/ExecutionSlice'

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
        runInstructionLimit: 1_000_000,
        speedCorrection: 1
    }
    return Object.assign(base, overrides)
}

/** A Core whose chunks cost what the script says, in wall time and in sleep, and end how it says. */
function fakeCore(
    cost: (
        limit: number,
        index: number
    ) => { ms: number; slept?: number; outcome?: MarsChunkOutcome }
) {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const clock = { waitedMs: 0 }
    const limits: number[] = []
    const runChunk = async (limit: number): Promise<MarsChunkOutcome> => {
        const spent = cost(limit, limits.length)
        limits.push(limit)
        now += spent.ms
        clock.waitedMs += spent.slept ?? 0
        return spent.outcome ?? 'ran'
    }
    return { clock, limits, runChunk, advance: (ms: number) => void (now += ms) }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('nextMarsChunk', () => {
    it('grows a chunk that came back at once by at most the growth factor', () => {
        expect(nextMarsChunk(100, TARGET_MS, 0, false, 1_000_000)).toBe(100 * MAX_MARS_CHUNK_GROWTH)
        expect(nextMarsChunk(100, TARGET_MS, 0.001, false, 1_000_000)).toBe(
            100 * MAX_MARS_CHUNK_GROWTH
        )
    })

    it('aims a chunk that cost more than the target at the target', () => {
        //a hundred instructions in four milliseconds: a millisecond is twenty five of them, and the
        //floor is what a chunk that did not sleep may not go under
        expect(nextMarsChunk(100, TARGET_MS, 4, false, 1_000_000)).toBe(MIN_MARS_CHUNK)
        expect(nextMarsChunk(10_000, TARGET_MS, 4, false, 1_000_000)).toBe(2_500)
    })

    it('sizes a chunk that slept on its wall time with no floor', () => {
        //four instructions and a ten millisecond sleep, sixty four times: the next chunk should
        //carry a millisecond of that, not the floor's sixteen sleeps
        expect(nextMarsChunk(256, TARGET_MS, 640, true, 1_000_000)).toBe(1)
        expect(nextMarsChunk(256, 10, 640, true, 1_000_000)).toBe(4)
        //a chunk that slept less than the target may still grow, by the same factor as any other
        expect(nextMarsChunk(8, TARGET_MS, 0.5, true, 1_000_000)).toBe(8 * MAX_MARS_CHUNK_GROWTH)
    })

    it('walks a chunk back up from a sleep instead of jumping to the floor', () => {
        expect(nextMarsChunk(2, TARGET_MS, 0, false, 1_000_000)).toBe(4)
        expect(nextMarsChunk(32, TARGET_MS, 0.001, false, 1_000_000)).toBe(64)
    })

    it('never asks for more than the cap and never for less than one instruction', () => {
        expect(nextMarsChunk(100, TARGET_MS, 0, false, 150)).toBe(150)
        expect(nextMarsChunk(MIN_MARS_CHUNK, TARGET_MS, 0, false, 10)).toBe(10)
        expect(nextMarsChunk(1, TARGET_MS, 1_000, true, 1_000_000)).toBe(1)
    })
})

describe('MarsSlicePacer', () => {
    it('spends a compute slice in chunks that grow to the target and ends it on the deadline', async () => {
        //a Core running a thousand instructions a millisecond, as MIPS does
        const core = fakeCore((limit) => ({ ms: limit / 1_000 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        const slice = await pacer.run(request(), 1_000, core.clock, core.runChunk)
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
        //fifty milliseconds of chunks, charged in full
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
            core.clock,
            core.runChunk
        )
        expect(slice).toEqual({ reason: 'budget', instructions: 300 })
        expect(core.limits).toEqual([64, 128, 108])
    })

    it('shrinks the chunk of a sleeping program to about one sleep', async () => {
        //four instructions then a ten millisecond sleep, over and over: a chunk costs a sleep per
        //four instructions and nothing else
        const core = fakeCore((limit) => ({ ms: (limit / 4) * 10, slept: (limit / 4) * 10 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        const first = await pacer.run(request(), 1_000, core.clock, core.runChunk)
        //the floor's worth of sleeps overshoots the deadline, so the first slice is one chunk
        expect(first).toEqual({ reason: 'budget', instructions: MIN_MARS_CHUNK })
        const second = await pacer.run(request(), 1_000, core.clock, core.runChunk)
        //the pace learned in the first slice is kept: the second asks for one instruction at a
        //time, and ends at the first sleep past the deadline
        expect(core.limits[1]).toBe(1)
        expect(second.reason).toBe('budget')
        expect(second.instructions).toBeLessThanOrEqual(24)
    })

    it('creeps up on the next sleep after a chunk that did not reach one', async () => {
        //a loop of three hundred instructions ending in a hundred millisecond sleep, run from a
        //chunk that has just been sized down to two instructions
        let executed = 0
        const core = fakeCore((limit) => {
            const before = executed
            executed += limit
            const sleeps = Math.floor(executed / 300) - Math.floor(before / 300)
            return { ms: sleeps * 100, slept: sleeps * 100 }
        })
        const pacer = new MarsSlicePacer(TARGET_MS)
        //the first slice: the floor spans the sleep, and the chunk is sized down from it
        await pacer.run(request({ timeBudgetMs: 1 }), 1_000, core.clock, core.runChunk)
        expect(core.limits).toEqual([64, 128, 256])
        const before = core.limits.length
        await pacer.run(request({ timeBudgetMs: 1 }), 1_000, core.clock, core.runChunk)
        const chunks = core.limits.slice(before)
        //doubling from two, never jumping to the compute size, so the chunk that spans the sleep
        //is the first one to reach it and no chunk carries more than one
        expect(chunks[0]).toBe(2)
        for (let i = 1; i < chunks.length; i++) {
            expect(chunks[i]).toBeLessThanOrEqual(chunks[i - 1]! * MAX_MARS_CHUNK_GROWTH)
        }
        expect(core.clock.waitedMs).toBe(200)
    })

    it('ends the slice on a breakpoint or the end of the program, charging the chunk', async () => {
        const core = fakeCore((_limit, index) => ({
            ms: 0,
            outcome: index === 1 ? 'breakpoint' : 'ran'
        }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        expect(await pacer.run(request(), 1_000, core.clock, core.runChunk)).toEqual({
            reason: 'breakpoint',
            instructions: 64 + 128
        })
        const ending = fakeCore(() => ({ ms: 0, outcome: 'terminated' }))
        expect(await pacer.run(request(), 1_000, ending.clock, ending.runChunk)).toEqual({
            reason: 'terminated',
            instructions: 256
        })
    })

    it('forgets the learned chunk at reset', async () => {
        const core = fakeCore((limit) => ({ ms: limit / 1_000 }))
        const pacer = new MarsSlicePacer(TARGET_MS)
        await pacer.run(request(), 1_000, core.clock, core.runChunk)
        pacer.reset()
        await pacer.run(request({ instructionBudget: 1 }), 1_000, core.clock, core.runChunk)
        expect(core.limits[core.limits.length - 1]).toBe(1)
        await pacer.run(request(), 1_000, core.clock, core.runChunk)
        //the chunk after the reset starts from the floor again, capped by that one-instruction slice
        expect(core.limits[core.limits.length - 1]).toBeLessThanOrEqual(1_000)
    })
})
