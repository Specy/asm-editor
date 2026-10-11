import type { Screen } from './Screen'

type Effect = { position: number; before: number; restore?: () => void }

/**
 * Associates peripheral changes with positions in CPU execution history, independently of
 * rendering frames and scheduler slices. Positions increase during forward execution; undo
 * removes the abandoned suffix before an adapter can execute that code again.
 *
 * M68K uses execution IDs; Z80 uses bus timestamps inside the instruction's clock interval.
 * Instructions without peripheral effects cost no records and never pop a drawing operation.
 */
export class ScreenInstructionHistory {
    private effects: Effect[] = []
    private discardedThrough = -1

    constructor(
        private readonly screen: Screen,
        private readonly capacity: number
    ) {}

    record(position: number, before: number, restore?: () => void): void {
        if (this.capacity <= 0 || (before === this.screen.history.sequence && !restore)) return
        this.effects.push({ position, before, restore })
        while (this.effects.length > this.capacity) {
            this.discardedThrough = this.effects.shift()!.position
        }
    }

    /** Preflight the whole instruction before either the CPU or a peripheral is rolled back. */
    canUndoAfter(position: number): boolean {
        if (position < this.discardedThrough) return false
        const first = this.effects.find((effect) => effect.position > position)
        const history = this.screen.history
        return !first || first.before >= history.sequence - history.depth
    }

    undoAfter(position: number): void {
        if (!this.canUndoAfter(position)) throw new Error('Screen undo history is exhausted')
        while (this.effects.length && this.effects[this.effects.length - 1].position > position) {
            const effect = this.effects.pop()!
            this.screen.undoToSequence(effect.before)
            effect.restore?.()
        }
    }

    clear(): void {
        this.effects = []
        this.discardedThrough = -1
    }
}
