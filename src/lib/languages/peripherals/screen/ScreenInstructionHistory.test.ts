import { describe, expect, it } from 'vitest'
import { Screen } from './Screen'
import { ScreenInstructionHistory } from './ScreenInstructionHistory'

describe('instruction screen history', () => {
    it('allows unrelated undos after an evicted drawing, then refuses to cross it', () => {
        const screen = new Screen({ width: 8, height: 8 })
        const history = new ScreenInstructionHistory(screen, 10)
        screen.history.byteBudget = 0
        const before = screen.history.sequence
        screen.drawPixel(0, 0)
        history.record(5, before)
        expect(history.canUndoAfter(8)).toBe(true)
        history.undoAfter(8)
        expect(history.canUndoAfter(5)).toBe(true)
        expect(history.canUndoAfter(4)).toBe(false)
    })

    it('preflights every operation belonging to one instruction', () => {
        const screen = new Screen({ width: 8, height: 8 })
        const history = new ScreenInstructionHistory(screen, 10)
        for (const position of [10, 11]) {
            const before = screen.history.sequence
            screen.drawPixel(0, 0)
            history.record(position, before)
        }
        screen.history.byteBudget = 68
        expect(history.canUndoAfter(9)).toBe(false)
        expect(history.canUndoAfter(10)).toBe(true)
    })

    it('bounds metadata and refuses to cross an evicted device effect', () => {
        const screen = new Screen({ width: 8, height: 8 })
        const history = new ScreenInstructionHistory(screen, 1)
        let coordinate = 2
        history.record(1, 0, () => {
            coordinate = 0
        })
        history.record(2, 0, () => {
            coordinate = 1
        })
        history.undoAfter(1)
        expect(coordinate).toBe(1)
        expect(history.canUndoAfter(0)).toBe(false)
        history.clear()
        expect(history.canUndoAfter(0)).toBe(true)
    })
})
