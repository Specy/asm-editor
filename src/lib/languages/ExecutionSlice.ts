/**
 * The scheduling contract between `GenericEmulator` and a language adapter
 * ([ADR 0007](../../../docs/adr/0007-generic-emulator-run-scheduling.md)). The Emulator owns the
 * policy — how long to run before letting the host breathe, how much of the overall instruction
 * limit is left, when a program-requested wait resumes — and the adapter owns nothing but "run my
 * Core for about this much and tell me why you stopped".
 *
 * It replaces the old `_run(limit, breakpoints)`, which ran a whole program in one call and could
 * only be interrupted by an input prompt: a compute-only run froze the GUI until it ended, and Stop
 * was answered whenever the Core felt like returning.
 */

/** What the Emulator asks an adapter to execute. */
export type ExecutionSliceRequest = {
    /**
     * The most instructions this slice may execute: what is left of the run's overall limit. Always
     * finite and at least 1, so an adapter can hand it straight to its Core's halt limit.
     */
    instructionBudget: number
    /**
     * About how long the slice should run for. A cooperative hint, not a guarantee: an adapter turns
     * it into instructions with `sliceInstructionBudget` and its own throughput estimate, because no
     * Core here can stop on a clock.
     */
    timeBudgetMs: number
    /** The 0-based editor lines the run must stop on; the adapter maps them to addresses. */
    breakpoints: number[]
    /**
     * The whole run's instruction limit, which `instructionBudget` counts down from. Only for what
     * an adapter tells the user: the M68K Core reports an exhausted limit by throwing an error that
     * names the halt limit it was given, and that is a slice's share, not the limit the user set.
     */
    runInstructionLimit: number
    /**
     * What the scheduler has learned about this program's speed, multiplied into the adapter's own
     * throughput estimate by `sliceInstructionBudget`. An estimate is one number per Core and a Core
     * is not one speed: phase 8 measured RARS running a `j` loop at 26 instructions a millisecond
     * and everything else at 300, and one M68K trap can be a whole screen of work. The scheduler
     * corrects the estimate from what its slices actually cost, so a wrong constant costs one slice
     * rather than every slice of the run.
     */
    speedCorrection: number
}

/**
 * Why a slice ended. `budget` is the only one the scheduler resumes from without further ado;
 * `wait` resumes once the promise settles; the rest end the run.
 *
 * - `budget`: the slice ran out of instructions or time. Nothing is wrong, run the next slice.
 * - `breakpoint`: the Core stopped on one of the requested breakpoints.
 * - `terminated`: the program ended, normally or with an exception the adapter already reported.
 * - `limit`: the Core refused to continue because of a limit of its own.
 * - `wait`: the program asked for time to pass ([ADR 0010](../../../docs/adr/0010-program-time-without-clock-pacing.md)).
 *   The adapter puts the wait in `wait`; the scheduler awaits it through the execution generation so
 *   Stop cancels it, and then runs the next slice.
 */
export type ExecutionSliceReason = 'budget' | 'breakpoint' | 'terminated' | 'limit' | 'wait'

export type ExecutionSlice = {
    reason: ExecutionSliceReason
    /**
     * Instructions to charge against the run's overall limit. Exact where the Core reports it (the
     * Z80 does), otherwise the budget the Core was given when it came back having used all of it,
     * which is exact for the case that matters — a compute-only slice.
     */
    instructions: number
    /** Only with `reason: 'wait'`: what the scheduler waits for before the next slice. */
    wait?: Promise<void>
}

/**
 * The short slice, used while a Screen is showing pixels the renderer has not painted yet: an
 * animating program has to reach its next frame and its next input poll often enough to look live.
 * Measured in phase 8: it is one display frame, and the animation examples end every slice on a wait
 * long before it anyway.
 */
export const SCREEN_SLICE_MS = 16

/**
 * The long slice, used by everything else. A compute-only run yields this often only to keep Stop
 * and the GUI answering; ADR 0007 budgets under five percent of throughput for it and a tenth of a
 * second for Stop.
 *
 * Phase 8 measured the host being held for as long as the slice runs — a Core runs on the main
 * thread, so a click on Stop is not delivered until the slice it lands in comes back — and lowered
 * this from 100 ms so that a program running two or three times slower than the loop each adapter's
 * estimate was calibrated on still answers Stop inside the ADR's tenth of a second. The yields it
 * adds cost about one percent of throughput.
 */
export const COMPUTE_SLICE_MS = 50

/**
 * Turns a request into the halt limit an adapter hands its Core. `instructionsPerMs` is that
 * adapter's own throughput estimate — every Core here runs at a different speed and none of them can
 * stop on a clock, so the time budget is honored by converting it. Phase 8 measured every estimate
 * on a compute-only loop, which is the fastest a Core ever goes: a program doing heavier work per
 * instruction runs longer than the budget asked for, which is why an adapter whose instructions vary
 * in cost by orders of magnitude also watches `sliceDeadline`.
 */
export function sliceInstructionBudget(
    request: ExecutionSliceRequest,
    instructionsPerMs: number
): number {
    const corrected = instructionsPerMs * (request.speedCorrection || 1)
    const fromTime = Math.max(1, Math.floor(request.timeBudgetMs * corrected))
    return Math.max(1, Math.min(request.instructionBudget, fromTime))
}

type HostScheduler = { yield?: () => Promise<void> }

/**
 * Hands the host a turn between two slices. `scheduler.yield()` gives the task back priority over
 * whatever else the page queued, which a `setTimeout(0)` does not; browsers without it (and node)
 * fall back to the timer.
 */
export function yieldToHost(): Promise<void> {
    const scheduler = (globalThis as { scheduler?: HostScheduler }).scheduler
    if (typeof scheduler?.yield === 'function') return scheduler.yield()
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * When a slice should stop regardless of how many instructions it has run. An instruction budget
 * only tracks time while every instruction costs about the same, and on two of these Cores it does
 * not: one Z80 `out` or one M68K trap can clear a whole Screen, which is a hundred thousand pixels
 * and a journal record of the image it overwrote. Phase 8 measured a Z80 drawing loop holding the
 * host for 57 seconds on an instruction budget alone.
 */
export function sliceDeadline(request: ExecutionSliceRequest): number {
    return performance.now() + request.timeBudgetMs
}

/** The fewest instructions a chunk may run, so a slow program still makes progress. */
export const MIN_SLICE_CHUNK = 256

/**
 * The next chunk for an adapter that spends its budget in pieces to check `sliceDeadline` between
 * them: what the last chunk cost says how many instructions the next one should ask for to land on
 * `targetMs`. Starting small and growing is what keeps the first chunk of a drawing loop from
 * overshooting the whole budget, and the cap keeps a compute-only run down to a handful of calls.
 */
export function nextSliceChunk(
    chunk: number,
    targetMs: number,
    spentMs: number,
    cap: number
): number {
    const scaled = chunk * (targetMs / Math.max(spentMs, 0.01))
    const bounded = Math.min(Math.max(cap, MIN_SLICE_CHUNK), Math.max(MIN_SLICE_CHUNK, scaled))
    return Math.max(1, Math.floor(bounded))
}

/**
 * How far the scheduler's correction may travel, and how far one slice may move it. The bounds are
 * generous enough for the spread phase 8 measured inside a single Core (twelve to one on RARS) and
 * tight enough that a slice distorted by something other than compute — a program waiting for input
 * inside its slice — is forgotten again within two or three slices.
 */
export const MIN_SPEED_CORRECTION = 1 / 8
export const MAX_SPEED_CORRECTION = 16
export const MAX_CORRECTION_STEP = 4

/** A slice shorter than this measures the clock, not the Core, so it is not allowed to teach it. */
export const MIN_MEASURABLE_SLICE_MS = 1

/**
 * The correction after a slice that ran its budget: aim the next one at the target from what this
 * one cost. `busyMs` is the slice's wall time with the program's own waits taken out, so an adapter
 * that serves a `sleep` inside its slice is not mistaken for a slow Core.
 */
export function nextSpeedCorrection(correction: number, targetMs: number, busyMs: number): number {
    if (busyMs < MIN_MEASURABLE_SLICE_MS) return correction
    const ratio = targetMs / busyMs
    const step = Math.min(MAX_CORRECTION_STEP, Math.max(1 / MAX_CORRECTION_STEP, ratio))
    return Math.min(MAX_SPEED_CORRECTION, Math.max(MIN_SPEED_CORRECTION, correction * step))
}
