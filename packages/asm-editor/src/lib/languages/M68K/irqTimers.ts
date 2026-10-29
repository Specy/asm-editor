/**
 * The program's IRQ timers ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
 * decisions 18 and 19; [ADR 0065](../../../../../../docs/adr/0065-m68k-devices-deliver-irqs.md)).
 * Task 32 with 6 in D1.B sets one per level, an IRQ every so many milliseconds. The Core keeps the
 * settings and Undo puts them back; the editor runs the timers on program time
 * ([ADR 0010](../../../../../../docs/adr/0010-program-time-without-clock-pacing.md)) and raises each
 * firing with `raiseIrq`.
 *
 * EASy68K's timers are Windows timers that run only while the program runs, so these count from
 * the start of each Run (`restart`) and fire only between a Run's slices: a Step never meets one.
 *
 * Plain TypeScript with the time handed in, so its tests drive it with numbers.
 */

/** One timer as the Core reports it: an IRQ at `level` every `intervalMs` milliseconds. */
export type IrqTimerSetting = { level: number; intervalMs: number }

type Timer = { intervalMs: number; nextAt: number }

export class IrqTimers {
    private readonly timers = new Map<number, Timer>()

    /**
     * Takes the settings the Core holds now. A timer the program turned on, or set to another
     * interval, counts from `now`; one it turned off, or Undo took back, is dropped; the others
     * keep counting. An interval of 0 never fires, as a Windows timer with none does not.
     */
    sync(settings: readonly IrqTimerSetting[], now: number): void {
        const levels = new Set<number>()
        for (const { level, intervalMs } of settings) {
            if (!(intervalMs > 0)) continue
            levels.add(level)
            if (this.timers.get(level)?.intervalMs === intervalMs) continue
            this.timers.set(level, { intervalMs, nextAt: now + intervalMs })
        }
        for (const level of [...this.timers.keys()]) {
            if (!levels.has(level)) this.timers.delete(level)
        }
    }

    /** Counts every timer from `now` again: a Run starts, and EASy68K's timers start with it. */
    restart(now: number): void {
        for (const timer of this.timers.values()) timer.nextAt = now + timer.intervalMs
    }

    /**
     * The levels whose timers have fired by `now`, highest first, each once however often it fired
     * since it was last asked: a request is one latched bit per level, and a second firing before
     * the first is taken changes nothing. Each then counts on to its first firing after `now`, on
     * its own beat.
     */
    due(now: number): number[] {
        const fired: number[] = []
        for (const [level, timer] of this.timers) {
            if (timer.nextAt > now) continue
            fired.push(level)
            const missed = Math.floor((now - timer.nextAt) / timer.intervalMs) + 1
            timer.nextAt += missed * timer.intervalMs
        }
        return fired.sort((a, b) => b - a)
    }

    /**
     * How long after `now` the next firing comes, of the timers whose level `counts`, all of them
     * by default; 0 when one is due already, undefined when none is on.
     */
    untilNext(now: number, counts: (level: number) => boolean = () => true): number | undefined {
        let next: number | undefined
        for (const [level, timer] of this.timers) {
            if (!counts(level)) continue
            if (next === undefined || timer.nextAt < next) next = timer.nextAt
        }
        return next === undefined ? undefined : Math.max(0, next - now)
    }

    /** The levels with a timer on, lowest first. */
    get levels(): number[] {
        return [...this.timers.keys()].sort((a, b) => a - b)
    }

    /** No timer on: a new Build's program has set none yet. */
    clear(): void {
        this.timers.clear()
    }
}
