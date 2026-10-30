import { describe, expect, it } from 'vite-plus/test'
import { IrqTimers } from './irqTimers'

/**
 * The M68K's IRQ timers on a clock the test holds, in milliseconds of program time
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 19).
 */
describe('IRQ timers', () => {
    it('fires a timer every interval from when the program set it', () => {
        const timers = new IrqTimers()
        timers.sync([{ level: 2, intervalMs: 500 }], 100)
        expect(timers.untilNext(100)).toBe(500)
        expect(timers.due(599)).toEqual([])
        expect(timers.due(600)).toEqual([2])
        expect(timers.due(600)).toEqual([])
        expect(timers.untilNext(700)).toBe(400)
        expect(timers.due(1100)).toEqual([2])
    })

    it('fires once for every firing it was not asked about in time, and keeps its beat', () => {
        const timers = new IrqTimers()
        timers.sync([{ level: 3, intervalMs: 100 }], 0)
        //three firings went by: one request, as a level is one latched bit
        expect(timers.due(350)).toEqual([3])
        expect(timers.untilNext(350)).toBe(50)
    })

    it('answers the levels that fired together highest first', () => {
        const timers = new IrqTimers()
        timers.sync(
            [
                { level: 1, intervalMs: 100 },
                { level: 6, intervalMs: 50 },
                { level: 4, intervalMs: 100 }
            ],
            0
        )
        expect(timers.due(100)).toEqual([6, 4, 1])
        expect(timers.levels).toEqual([1, 4, 6])
    })

    it('keeps counting a timer the program left alone, and starts again one it changed', () => {
        const timers = new IrqTimers()
        timers.sync([{ level: 2, intervalMs: 500 }], 0)
        timers.sync([{ level: 2, intervalMs: 500 }], 300)
        expect(timers.untilNext(300)).toBe(200)
        timers.sync([{ level: 2, intervalMs: 1000 }], 300)
        expect(timers.untilNext(300)).toBe(1000)
    })

    it('drops a timer turned off, or taken back by Undo', () => {
        const timers = new IrqTimers()
        timers.sync(
            [
                { level: 2, intervalMs: 500 },
                { level: 5, intervalMs: 20 }
            ],
            0
        )
        timers.sync([{ level: 5, intervalMs: 20 }], 10)
        expect(timers.levels).toEqual([5])
        timers.sync([], 10)
        expect(timers.untilNext(10)).toBe(undefined)
        expect(timers.due(10_000)).toEqual([])
    })

    it('never fires a timer of no interval, as a Windows timer of none does not', () => {
        const timers = new IrqTimers()
        timers.sync([{ level: 2, intervalMs: 0 }], 0)
        expect(timers.levels).toEqual([])
        expect(timers.due(1_000_000)).toEqual([])
    })

    it('counts every timer from the start of a Run again', () => {
        const timers = new IrqTimers()
        timers.sync([{ level: 2, intervalMs: 500 }], 0)
        //paused at 400 for a minute: the next Run fires half a second after it starts
        timers.restart(60_400)
        expect(timers.due(60_800)).toEqual([])
        expect(timers.due(60_900)).toEqual([2])
    })

    it('finds the next firing among the levels that count, as a mask lets them through', () => {
        const timers = new IrqTimers()
        timers.sync(
            [
                { level: 1, intervalMs: 10 },
                { level: 5, intervalMs: 300 }
            ],
            0
        )
        expect(timers.untilNext(0)).toBe(10)
        expect(timers.untilNext(0, (level) => level > 3)).toBe(300)
        expect(timers.untilNext(0, (level) => level > 6)).toBe(undefined)
    })
})
