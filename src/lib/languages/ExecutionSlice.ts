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
 */
export const SCREEN_SLICE_MS = 16

/**
 * The long slice, used by everything else. A compute-only run yields this often only to keep Stop
 * and the GUI answering; ADR 0007 budgets under five percent of throughput for it.
 */
export const COMPUTE_SLICE_MS = 100

/**
 * Turns a request into the halt limit an adapter hands its Core. `instructionsPerMs` is that
 * adapter's own throughput estimate — every Core here runs at a different speed and none of them can
 * stop on a clock, so the time budget is honored by converting it. The estimates are provisional
 * until phase 8 measures them.
 */
export function sliceInstructionBudget(
    request: ExecutionSliceRequest,
    instructionsPerMs: number
): number {
    const fromTime = Math.max(1, Math.floor(request.timeBudgetMs * instructionsPerMs))
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
