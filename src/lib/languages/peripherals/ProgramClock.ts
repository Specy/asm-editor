/**
 * The Time Source: where a program's program time comes from
 * ([ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)). No environment
 * emulates a clock rate, so this is the whole of it: a wait for a duration, a wait for the next
 * frame, and a read of the time elapsed since the run started.
 *
 * Two modes, chosen with the Input Source for the whole run:
 *
 * - `host`, the interactive run: waits resolve on host timers and frames on the host's animation
 *   frame, so an animation paces itself and a polling program does not spin; `now()` is host time
 *   since `start()`.
 * - `virtual`, a scripted Testcase run: waits and frames resolve immediately and advance a clock
 *   that starts at zero, so elapsed-time output is reproducible and a sleeping program cannot slow
 *   a test down. A program that polls `now()` without ever waiting never sees it advance, which
 *   ADR 0010 accepts.
 *
 * The waits are cancellable because Stop has to answer while a program sits in one: `cancel()`
 * settles every pending wait instead of leaving the run loop hanging, and the resumed run finds its
 * execution generation superseded on its own.
 *
 * Plain TypeScript with no Svelte runes, like the other peripherals, so it runs under node.
 */

/** Milliseconds from some fixed origin; injected everywhere so tests can drive time. */
export type ClockReader = () => number

export type ProgramClockMode = 'host' | 'virtual'

export type ProgramClockOptions = {
    /** Defaults to `host`; a Testcase run asks for `virtual`. */
    mode?: ProgramClockMode
    /** The host time source. Injected so tests do not have to wait for real milliseconds. */
    now?: ClockReader
    /** How far one `nextFrame()` moves the virtual clock. */
    frameIntervalMs?: number
}

/** About 60 frames a second, an integer so virtual times stay exact. */
export const VIRTUAL_FRAME_INTERVAL_MS = 16

/** What `nextFrame()` waits under node, where there is no animation frame to wait for. */
export const HOST_FRAME_FALLBACK_MS = 16

/** EASy68K's task 8 and task 23 count in hundredths of a second, so both helpers convert by this. */
const MS_PER_HUNDREDTH = 10

type PendingWait = {
    /** Stops the host timer or animation frame behind the wait. */
    disarm: () => void
    /** Resolves the promise the program is waiting on. */
    settle: () => void
}

export function hostNow(): number {
    return performance.now()
}

export class ProgramClock {
    private readonly _mode: ProgramClockMode
    private readonly hostTime: ClockReader
    private readonly frameIntervalMs: number
    private readonly pending = new Set<PendingWait>()
    /** Host mode: the host time `start()` was called at, which `now()` counts from. */
    private origin: number
    /** Virtual mode: how far the program's own waits have moved the clock. */
    private elapsed = 0
    private _waitedMs = 0

    constructor(options: ProgramClockOptions = {}) {
        this._mode = options.mode ?? 'host'
        this.hostTime = options.now ?? hostNow
        this.frameIntervalMs = options.frameIntervalMs ?? VIRTUAL_FRAME_INTERVAL_MS
        this.origin = this.hostTime()
    }

    get mode(): ProgramClockMode {
        return this._mode
    }

    get isVirtual(): boolean {
        return this._mode === 'virtual'
    }

    /** How many waits are outstanding; the run loop and the tests use it to see a program suspended. */
    get pendingWaits(): number {
        return this.pending.size
    }

    /**
     * Host milliseconds this clock has spent holding a program in a wait, since the clock was made.
     * The scheduler subtracts it from a slice's wall time before judging how fast the Core is: an
     * adapter that serves a `sleep` inside its slice (MIPS, RISC-V and x86 do) would otherwise look
     * a hundred times slower than it is ([ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md)).
     * A virtual clock never waits at all, so it never moves this.
     */
    get waitedMs(): number {
        return this._waitedMs
    }

    /** Puts the clock back to zero for a new run. Does not touch waits an old run left behind. */
    start(): void {
        this.origin = this.hostTime()
        this.elapsed = 0
    }

    /** Milliseconds of program time since `start()`. */
    now(): number {
        return this.isVirtual ? this.elapsed : this.hostTime() - this.origin
    }

    /** Program time in hundredths of a second, the unit of EASy68K's task 8. */
    nowHundredths(): number {
        return Math.floor(this.now() / MS_PER_HUNDREDTH)
    }

    /**
     * The program-requested wait of ADR 0010: the run loop awaits it and resumes the program after
     * it, without blocking the GUI.
     */
    wait(ms: number): Promise<void> {
        const duration = Number.isFinite(ms) ? Math.max(0, ms) : 0
        if (this.isVirtual) {
            this.elapsed += duration
            return Promise.resolve()
        }
        return this.schedule((resume) => {
            const timer = setTimeout(resume, duration)
            return () => clearTimeout(timer)
        })
    }

    /** A wait in hundredths of a second, the unit of EASy68K's task 23. */
    waitHundredths(hundredths: number): Promise<void> {
        return this.wait(hundredths * MS_PER_HUNDREDTH)
    }

    /**
     * Waits for the host's next animation frame, which is how a program paces an animation to the
     * display rather than to an emulated clock. The Screen still repaints on its own frame loop:
     * this only decides when the program continues.
     */
    nextFrame(): Promise<void> {
        if (this.isVirtual) {
            this.elapsed += this.frameIntervalMs
            return Promise.resolve()
        }
        return this.schedule((resume) => {
            if (typeof requestAnimationFrame !== 'function') {
                const timer = setTimeout(resume, HOST_FRAME_FALLBACK_MS)
                return () => clearTimeout(timer)
            }
            const frame = requestAnimationFrame(() => resume())
            return () => cancelAnimationFrame(frame)
        })
    }

    /**
     * Releases every pending wait, for Stop and for clear. The waits resolve rather than reject:
     * both callers invalidate the execution generation first, so the resumed run throws
     * `ExecutionSupersededError` by itself and nobody has to handle a second kind of error.
     */
    cancel(): void {
        const waits = [...this.pending]
        this.pending.clear()
        for (const wait of waits) {
            wait.disarm()
            wait.settle()
        }
    }

    /** The clock's half of the Terminal's clear path: no pending waits, and time back to zero. */
    reset(): void {
        this.cancel()
        this.start()
    }

    private schedule(arm: (resume: () => void) => () => void): Promise<void> {
        return new Promise<void>((resolve) => {
            const armedAt = this.hostTime()
            const wait: PendingWait = { disarm: () => {}, settle: () => {} }
            wait.settle = () => {
                if (this.pending.has(wait)) this._waitedMs += this.hostTime() - armedAt
                this.pending.delete(wait)
                resolve()
            }
            this.pending.add(wait)
            wait.disarm = arm(() => wait.settle())
        })
    }
}
