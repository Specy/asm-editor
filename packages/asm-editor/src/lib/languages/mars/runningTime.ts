/**
 * The running program's elapsed time, which RISC-V's timer registers count
 * ([ADR 0074](../../../../../../docs/adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md)):
 * Program time from 0 at the start of each run, counting only while the program runs. It stops at
 * a Pause, at a Breakpoint and between Steps, so a person stepping through a program with a 10 ms
 * timer is not taken into the handler at nearly every Step after a pause; it keeps counting through
 * a Run's waits and between its slices, so a "fire in one second" fires after a second of the Run.
 *
 * Plain TypeScript with the time handed in, so its tests drive it with numbers.
 */
export class RunningTime {
    /** The milliseconds counted before the stretch running now, if one is. */
    private total = 0
    /** When the stretch running now began, or undefined while the program does not run. */
    private since: number | undefined
    /** When the last stretch ended, for a slice that continues the same Run. */
    private stoppedAt: number | undefined

    /**
     * The program runs again from `now`. A slice that continues a Run counts the gap since the
     * last one ended too, since the Run went on meanwhile, the host's turn between slices; a
     * Step, or the first slice of a Run, does not.
     */
    start(now: number, continuesRun: boolean): void {
        if (this.since !== undefined) return
        if (continuesRun && this.stoppedAt !== undefined)
            this.total += Math.max(0, now - this.stoppedAt)
        this.since = now
    }

    /** The program stops running at `now`, until the next `start`. */
    stop(now: number): void {
        if (this.since === undefined) return
        this.total += Math.max(0, now - this.since)
        this.since = undefined
        this.stoppedAt = now
    }

    /** The running time at `now`, in milliseconds. */
    read(now: number): number {
        return this.since === undefined ? this.total : this.total + Math.max(0, now - this.since)
    }

    /** A new run: 0, and stopped. */
    reset(): void {
        this.total = 0
        this.since = undefined
        this.stoppedAt = undefined
    }
}
