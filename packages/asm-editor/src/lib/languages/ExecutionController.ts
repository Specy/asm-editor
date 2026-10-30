export class ExecutionSupersededError extends Error {
    constructor() {
        super('Execution superseded')
        this.name = 'ExecutionSupersededError'
    }
}

export type ExecutionGeneration = {
    readonly value: number
}

export class ExecutionController {
    private generation = 0
    private pendingPrompts = 0
    private readonly cancelPrompt: () => void
    /** The waits `whileCurrent` ends at the next `invalidate`. */
    private readonly supersessionListeners = new Set<() => void>()
    /** The waits `whileUnpaused` ends at the next `requestPause`. */
    private readonly pauseListeners = new Set<() => void>()
    private pausing = false

    constructor(cancelPrompt: () => void) {
        this.cancelPrompt = cancelPrompt
    }

    /**
     * Whether Pause was pressed during the run in flight and the run has not taken it yet. The run
     * loop takes it at its next slice boundary
     * ([ADR 0007](../../../../../docs/adr/0007-generic-emulator-run-scheduling.md)).
     */
    get pauseRequested(): boolean {
        return this.pausing
    }

    /**
     * Pause was pressed: every wait `whileUnpaused` holds ends now, and so does any it is asked
     * for until `endPause`, so that the run reaches the slice boundary where it takes the pause.
     * Waits made with `waitFor` are left to finish, as ADR 0007 has a program's Delay run out
     * before the pause is taken.
     */
    requestPause(): void {
        this.pausing = true
        const released = [...this.pauseListeners]
        this.pauseListeners.clear()
        for (const listener of released) listener()
    }

    /** The pause was taken, or the run it was asked of ended: `whileUnpaused` waits again. */
    endPause(): void {
        this.pausing = false
    }

    capture(): ExecutionGeneration {
        return { value: this.generation }
    }

    invalidate(): void {
        this.generation += 1
        if (this.pendingPrompts > 0) this.cancelPrompt()
        const superseded = [...this.supersessionListeners]
        this.supersessionListeners.clear()
        for (const listener of superseded) listener()
    }

    isCurrent(execution: ExecutionGeneration): boolean {
        return execution.value === this.generation
    }

    ensureCurrent(execution: ExecutionGeneration): void {
        if (!this.isCurrent(execution)) throw new ExecutionSupersededError()
    }

    /**
     * Waits for `operation` on behalf of `execution`, and fails once it is over if `execution` was
     * superseded meanwhile. One already superseded does not wait at all: a Core that Stop could not
     * halt, finishing a Testcase unseen, must not ask the Terminal for input on its behalf.
     */
    async waitFor<T>(execution: ExecutionGeneration, operation: () => PromiseLike<T>): Promise<T> {
        this.ensureCurrent(execution)
        try {
            const result = await operation()
            this.ensureCurrent(execution)
            return result
        } catch (error) {
            this.ensureCurrent(execution)
            throw error
        }
    }

    /**
     * Waits for `promise` only while `execution` is current: once it is superseded the wait ends at
     * once with `ExecutionSupersededError`, even when `promise` never settles, and however `promise`
     * settles later is dropped. For a wait nothing else bounds, such as a chunk import, which must
     * not hold whatever comes after the execution it was for.
     */
    whileCurrent<T>(execution: ExecutionGeneration, promise: PromiseLike<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const superseded = () => reject(new ExecutionSupersededError())
            if (this.isCurrent(execution)) this.supersessionListeners.add(superseded)
            else superseded()
            const settle = (outcome: () => void) => {
                this.supersessionListeners.delete(superseded)
                if (this.isCurrent(execution)) outcome()
                else superseded()
            }
            promise.then(
                (value) => settle(() => resolve(value)),
                (error: unknown) => settle(() => reject(error))
            )
        })
    }

    /**
     * Waits for `promise` until it settles, until Pause is pressed, or until `execution` is
     * superseded, whichever comes first. A Pause ends the wait resolved, as `promise` would have,
     * and a Stop with `ExecutionSupersededError`, as `whileCurrent` does. A Pause pressed before
     * the wait began ends it at once, so a pause asked for while the slice that made it ran is not
     * lost.
     *
     * For a wait that owes the program nothing when it is cut short: a processor `stop` stopped,
     * waiting for an IRQ (M68K, [m68k-machine.md](../../../../../docs/design/m68k-machine.md),
     * decision 29), which Run goes on waiting for after the Pause. A program's Delay is not one.
     */
    whileUnpaused(execution: ExecutionGeneration, promise: PromiseLike<void>): Promise<void> {
        if (this.pausing) return this.whileCurrent(execution, Promise.resolve())
        let release!: () => void
        const paused = new Promise<void>((resolve) => (release = resolve))
        this.pauseListeners.add(release)
        const ended = () => this.pauseListeners.delete(release)
        return this.whileCurrent(execution, Promise.race([promise, paused])).then(
            () => {
                ended()
            },
            (error: unknown) => {
                ended()
                throw error
            }
        )
    }

    async waitForPrompt<T>(
        execution: ExecutionGeneration,
        operation: () => PromiseLike<T>
    ): Promise<T> {
        this.ensureCurrent(execution)
        this.pendingPrompts += 1
        try {
            return await this.waitFor(execution, operation)
        } finally {
            this.pendingPrompts -= 1
        }
    }
}
