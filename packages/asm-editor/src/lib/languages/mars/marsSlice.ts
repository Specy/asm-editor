import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceDeadline,
    sliceInstructionBudget
} from '#lib/languages/ExecutionSlice.ts'

/**
 * The slice loop of the MARS and RARS derived adapters (MIPS and RISC-V), whose Cores serve a
 * program's waits *inside* a `simulate*` call: a `sleep` syscall suspends the pending call until the
 * clock settles the handler's promise, and a read until it is answered
 * ([ADR 0007](../../../../../../docs/adr/0007-generic-emulator-run-scheduling.md),
 * [ADR 0010](../../../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
 *
 * A sleep ends the slice. The sleep handler asks the Core to `pause()` after the syscall, so the
 * call comes back where the program's frame ends, and the slice with it. The Screen catches up at
 * the end of every slice, and a slice that ran on past a sleep into the next frame left that frame
 * half drawn on the Screen until the following sleep: measured on the flappy-bird example, a
 * quarter of the slice ends did, and about one painted frame in fifteen showed a torn bird. Ending the
 * slice at the sleep is also what keeps a sleeping program's slice, and the pause it holds off, to
 * one sleep; before the Cores could stop there, only chunks sized on the sleeps did.
 *
 * The budget is still spent in chunks with the deadline looked at between them, because no Core
 * here can stop on a clock and an instruction budget is only a throughput estimate: a program
 * storing to the bitmap display runs several times slower than the compute loop the estimate was
 * measured on, and a slice handed its whole budget in one call holds the host for as many times
 * longer. A chunk is sized on what the last one cost in wall time.
 *
 * Re-entering the Core is cheap enough for this. Measured under node with the shipped undo history:
 * a `simulateWithBreakpointsAndLimit` call costs about 5 µs on MIPS, which reaches its full 1 100
 * instructions a millisecond from 64-instruction chunks, and the RISC-V Core spends 40 µs on every
 * instruction, so its throughput is the same at any chunk size from one instruction up.
 */

/** The first chunk of a program, and the fewest a chunk shrinks to: where the call overhead stops showing on MIPS. */
export const MIN_MARS_CHUNK = 64

/**
 * How much a chunk may grow over the one before it. A chunk that came back at once says little
 * about the next one, so the chunk creeps up on its target instead of jumping to it.
 */
export const MAX_MARS_CHUNK_GROWTH = 2

/** A chunk shorter than this measures the clock, not the Core. */
const MIN_MEASURABLE_CHUNK_MS = 0.01

/**
 * Why one chunk came back: `ran` is the halt limit, `paused` a sleep (the handler's `pause()`).
 * Termination and breakpoints are the adapter's call, because only it can read its Core's answer.
 */
export type MarsChunkOutcome = 'ran' | 'paused' | 'breakpoint' | 'terminated'

/** One chunk's outcome and how many instructions the Core says it executed. */
export type MarsChunk = { outcome: MarsChunkOutcome; instructions: number }

/**
 * The next chunk, from what the last one cost: `spentMs` of wall time for `chunk` instructions.
 * Aims at `targetMs`, grows by at most `MAX_MARS_CHUNK_GROWTH`, and stays between
 * `MIN_MARS_CHUNK` and `cap`.
 */
export function nextMarsChunk(
    chunk: number,
    targetMs: number,
    spentMs: number,
    cap: number
): number {
    const ratio = targetMs / Math.max(spentMs, MIN_MEASURABLE_CHUNK_MS)
    const scaled = Math.floor(chunk * Math.min(MAX_MARS_CHUNK_GROWTH, ratio))
    return Math.max(1, Math.min(cap, Math.max(MIN_MARS_CHUNK, scaled)))
}

/**
 * One adapter's chunk size, kept across slices so that a slow program is not rediscovered at every
 * slice, whose first chunk would otherwise be the floor.
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

    /** Runs one slice: `runChunk` is the adapter's Core call with the halt limit to give it. */
    async run(
        request: ExecutionSliceRequest,
        instructionsPerMs: number,
        runChunk: (limit: number) => Promise<MarsChunk>
    ): Promise<ExecutionSlice> {
        const budget = sliceInstructionBudget(request, instructionsPerMs)
        const deadline = sliceDeadline(request)
        let instructions = 0
        while (instructions < budget) {
            const limit = Math.min(this.chunk, budget - instructions)
            const startedAt = performance.now()
            const { outcome, instructions: executed } = await runChunk(limit)
            instructions += executed
            //the wait was served inside the call, so there is no promise left for the scheduler
            //to await: a wait slice without one is a yield, and it teaches the scheduler nothing
            //about the Core's speed, as the sleep teaches this chunk size nothing either
            if (outcome === 'paused') return { reason: 'wait', instructions }
            const now = performance.now()
            this.chunk = nextMarsChunk(limit, this.chunkTargetMs, now - startedAt, budget)
            if (outcome !== 'ran') return { reason: outcome, instructions }
            //the slice ends on the clock as well as on the budget, and on a chunk that ran
            //nothing, which would otherwise spin here: no progress ends the whole run
            if (now >= deadline || executed <= 0) return { reason: 'budget', instructions }
        }
        return { reason: 'budget', instructions }
    }
}
