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

    constructor(cancelPrompt: () => void) {
        this.cancelPrompt = cancelPrompt
    }

    capture(): ExecutionGeneration {
        return { value: this.generation }
    }

    invalidate(): void {
        this.generation += 1
        if (this.pendingPrompts > 0) this.cancelPrompt()
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
