class ExecutionSupersededError extends Error {
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

    constructor(cancelPrompt: () => void) {
        this.cancelPrompt = cancelPrompt
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

    async waitFor<T>(execution: ExecutionGeneration, operation: () => PromiseLike<T>): Promise<T> {
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
