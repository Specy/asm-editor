import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceDeadline,
    sliceInstructionBudget
} from '$lib/languages/ExecutionSlice'

/**
 * The slice loop of the MARS and RARS derived adapters (MIPS and RISC-V), whose Cores serve a
 * program's waits *inside* a `simulate*` call: a `sleep` syscall suspends the pending call until the
 * clock settles the handler's promise, and nothing outside the Core can end the call before its
 * halt limit ([ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md),
 * [ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
 *
 * That makes the halt limit the only bound on how long one call holds the slice, and an instruction
 * budget says nothing about wall time once the program sleeps: a compute slice's whole budget handed
 * to a loop that sleeps ten milliseconds every four instructions is two minutes on MIPS. The slice
 * boundary is where a pause is taken and where the host gets its turn, so the budget is spent in
 * chunks sized on what the last one cost in wall time, sleeps included, with the deadline looked at
 * between them: a sleeping program settles on a chunk of about one sleep, and a pause lands within a
 * sleep or two instead of at the end of the budget.
 *
 * Re-entering the Core is cheap enough for this. Measured under node with the shipped undo history:
 * a `simulateWithBreakpointsAndLimit` call costs about 5 µs on MIPS, which reaches its full 1 100
 * instructions a millisecond from 64-instruction chunks, and the RISC-V Core spends 40 µs on every
 * instruction, so its throughput is the same at any chunk size from one instruction up.
 */

/**
 * The first chunk of a program, and the fewest a chunk shrinks to when its instructions turn out
 * expensive: where the call overhead stops showing on MIPS. A chunk that slept has no floor, because
 * the floor guards the cost of re-entering the Core, which is nothing next to a sleep, and a floor
 * would hold a sleeping loop at this many sleeps a chunk.
 */
export const MIN_MARS_CHUNK = 64

/**
 * How much a chunk may grow over the one before it. A chunk that came back at once says nothing
 * about the next sleep, only that it did not reach one, so the chunk creeps up on the sleep instead
 * of jumping to the compute size and carrying a dozen sleeps once it gets there: a loop of three
 * hundred instructions and one sleep is walked in a handful of calls, the last of which spans the
 * sleep and is sized down again from what it cost.
 */
export const MAX_MARS_CHUNK_GROWTH = 2

/** A chunk shorter than this measures the clock, not the Core. */
const MIN_MEASURABLE_CHUNK_MS = 0.01

/**
 * Why one chunk came back: `ran` is the halt limit, the only outcome the next chunk follows.
 * Termination and breakpoints are the adapter's call, because only it can read its Core's answer.
 */
export type MarsChunkOutcome = 'ran' | 'breakpoint' | 'terminated'

/** The one thing the pacer reads of the program clock: how long it has held the program in waits. */
export type WaitedClock = { readonly waitedMs: number }

/**
 * The next chunk, from what the last one cost: `spentMs` of wall time for `chunk` instructions, and
 * whether any of it was a program wait. Aims at `targetMs`, grows by at most
 * `MAX_MARS_CHUNK_GROWTH`, and never asks for more than `cap`.
 */
export function nextMarsChunk(
    chunk: number,
    targetMs: number,
    spentMs: number,
    slept: boolean,
    cap: number
): number {
    const ratio = targetMs / Math.max(spentMs, MIN_MEASURABLE_CHUNK_MS)
    const scaled = Math.floor(chunk * Math.min(MAX_MARS_CHUNK_GROWTH, ratio))
    //the floor is for a chunk whose instructions turned out expensive: one that slept is sized on
    //the sleep, and one growing back from a sleep's worth walks up from where it is, or it would
    //jump to the floor and carry the floor's worth of sleeps once it reaches them
    const floor = slept || scaled >= chunk ? 1 : MIN_MARS_CHUNK
    return Math.max(1, Math.min(cap, Math.max(floor, scaled)))
}

/**
 * One adapter's chunk size, kept across slices so that a sleeping program is not rediscovered at
 * every slice, whose first chunk would otherwise be the floor's worth of sleeps.
 */
export class MarsSlicePacer {
    private chunk = MIN_MARS_CHUNK
    private readonly chunkTargetMs: number

    /** `chunkTargetMs` is how much wall time one Core call aims at; each adapter measures its own. */
    constructor(chunkTargetMs: number) {
        this.chunkTargetMs = chunkTargetMs
    }

    /** A Build is a new program, and what the previous one taught about its pace does not apply. */
    reset(): void {
        this.chunk = MIN_MARS_CHUNK
    }

    /**
     * Runs one slice: `runChunk` is the adapter's Core call with the halt limit to give it, and
     * `clock` is the program clock its waits go through, read at the start of the slice because a
     * Testcase swaps the instance.
     */
    async run(
        request: ExecutionSliceRequest,
        instructionsPerMs: number,
        clock: WaitedClock,
        runChunk: (limit: number) => Promise<MarsChunkOutcome>
    ): Promise<ExecutionSlice> {
        const budget = sliceInstructionBudget(request, instructionsPerMs)
        const deadline = sliceDeadline(request)
        let instructions = 0
        while (instructions < budget) {
            const limit = Math.min(this.chunk, budget - instructions)
            const startedAt = performance.now()
            const waitedAt = clock.waitedMs
            const outcome = await runChunk(limit)
            //the Core reports no count, so a chunk is charged in full: exact for every chunk that
            //ran out of limit, which is all of them but the one a breakpoint or the end of the
            //program cut short
            instructions += limit
            const now = performance.now()
            this.chunk = nextMarsChunk(
                limit,
                this.chunkTargetMs,
                now - startedAt,
                clock.waitedMs > waitedAt,
                budget
            )
            if (outcome !== 'ran') return { reason: outcome, instructions }
            //the slice ends on the clock as well as on the budget, but never without progress: a
            //slice that ran nothing ends the whole run
            if (now >= deadline) return { reason: 'budget', instructions }
        }
        return { reason: 'budget', instructions }
    }
}
