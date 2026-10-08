import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_FRAME_FALLBACK_MS, ProgramClock, VIRTUAL_FRAME_INTERVAL_MS } from './ProgramClock'

/** A settled promise takes one microtask, which is what "resolves immediately" means here. */
function flush() {
    return Promise.resolve()
}

describe('virtual mode', () => {
    it('starts at zero for every run', () => {
        let time = 5000
        const clock = new ProgramClock({ mode: 'virtual', now: () => time })
        expect(clock.now()).toBe(0)
        time = 9000
        expect(clock.now()).toBe(0)
        clock.start()
        expect(clock.now()).toBe(0)
    })

    it('resolves a wait immediately and advances the clock by its duration', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        let resumed = false
        const wait = clock.wait(1500).then(() => (resumed = true))
        expect(clock.now()).toBe(1500)
        await flush()
        expect(resumed).toBe(true)
        await wait
    })

    it('advances a frame by the virtual frame interval', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        await clock.nextFrame()
        await clock.nextFrame()
        expect(clock.now()).toBe(2 * VIRTUAL_FRAME_INTERVAL_MS)
    })

    it('reads and waits in hundredths of a second', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        await clock.waitHundredths(250)
        expect(clock.now()).toBe(2500)
        expect(clock.nowHundredths()).toBe(250)
    })

    it('does not move on its own, which is what makes a scripted run reproducible', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        await clock.wait(10)
        const seen = clock.now()
        for (let poll = 0; poll < 1000; poll++) expect(clock.now()).toBe(seen)
    })
})

describe('host mode', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('reads the time elapsed since the run started', () => {
        let time = 1000
        const clock = new ProgramClock({ now: () => time })
        time = 1250
        expect(clock.now()).toBe(250)
        expect(clock.nowHundredths()).toBe(25)
        time = 4000
        clock.start()
        expect(clock.now()).toBe(0)
    })

    it('resumes a wait on a host timer', async () => {
        vi.useFakeTimers()
        const clock = new ProgramClock()
        let resumed = false
        const wait = clock.wait(50).then(() => (resumed = true))
        expect(clock.pendingWaits).toBe(1)
        await vi.advanceTimersByTimeAsync(49)
        expect(resumed).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await wait
        expect(resumed).toBe(true)
        expect(clock.pendingWaits).toBe(0)
    })

    it('falls back to a timer for a frame where there is no animation frame', async () => {
        vi.useFakeTimers()
        const clock = new ProgramClock()
        let resumed = false
        const frame = clock.nextFrame().then(() => (resumed = true))
        await vi.advanceTimersByTimeAsync(HOST_FRAME_FALLBACK_MS)
        await frame
        expect(resumed).toBe(true)
    })

    it('uses the host animation frame when there is one', async () => {
        const frames: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.push(callback)
            return frames.length
        })
        vi.stubGlobal('cancelAnimationFrame', () => {})
        try {
            const clock = new ProgramClock()
            let resumed = false
            const frame = clock.nextFrame().then(() => (resumed = true))
            expect(frames).toHaveLength(1)
            expect(resumed).toBe(false)
            frames[0](0)
            await frame
            expect(resumed).toBe(true)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('releases pending waits on cancel, so Stop is answered during one', async () => {
        const clock = new ProgramClock()
        let resumed = false
        const wait = clock.wait(60_000).then(() => (resumed = true))
        expect(clock.pendingWaits).toBe(1)
        clock.cancel()
        await wait
        expect(resumed).toBe(true)
        expect(clock.pendingWaits).toBe(0)
    })

    it('cancels and restarts on reset, the clear path', async () => {
        let time = 1000
        const clock = new ProgramClock({ now: () => time })
        const wait = clock.wait(60_000)
        time = 3000
        clock.reset()
        await wait
        expect(clock.pendingWaits).toBe(0)
        expect(clock.now()).toBe(0)
    })
})

describe('abortable waits', () => {
    it('disarms a host wait on its own AbortSignal without cancelling other waits', async () => {
        vi.useFakeTimers()
        try {
            const clock = new ProgramClock()
            const controller = new AbortController()
            const aborted = clock.wait(1000, controller.signal).catch((error: unknown) => error)
            const other = clock.wait(20)
            expect(clock.pendingWaits).toBe(2)
            controller.abort(new Error('input woke the wait'))
            expect(((await aborted) as Error).message).toBe('input woke the wait')
            expect(clock.pendingWaits).toBe(1)
            await vi.advanceTimersByTimeAsync(20)
            await other
            expect(clock.pendingWaits).toBe(0)
            expect(vi.getTimerCount()).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('calendar and CPU clocks', () => {
    it('uses host calendar independently of elapsed time', () => {
        let elapsed = 10,
            calendar = 1700000000000
        const clock = new ProgramClock({ now: () => elapsed, calendarNow: () => calendar })
        elapsed += 500
        expect(clock.now()).toBe(500)
        expect(clock.calendarNow()).toBe(calendar)
        calendar += 1000
        expect(clock.calendarNow()).toBe(calendar)
        expect(clock.cpuNow(100_000_000n)).toBe(1000)
    })
    it('fixes virtual calendar at Y2K, excludes waits from CPU time and follows Undo counters', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        expect(clock.calendarNow()).toBe(946684800000)
        expect(clock.calendarHundredths()).toBe(0)
        await clock.wait(2500)
        expect(clock.calendarNow()).toBe(946684802500)
        expect(clock.calendarHundredths()).toBe(250)
        expect(clock.cpuNow(100n)).toBe(0.001)
        expect(clock.cpuNow(0n)).toBe(0)
        clock.start()
        expect(clock.calendarNow()).toBe(946684800000)
    })
})
