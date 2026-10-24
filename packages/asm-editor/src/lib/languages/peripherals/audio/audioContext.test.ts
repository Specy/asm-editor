import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
    IDLE_SUSPEND_MS,
    PageAudio,
    preferenceGain,
    setAudioPreferences,
    wakeAudio
} from './audioContext'
import { FakeAudioContext } from './webAudioFakes'

class FakeGestures {
    readonly listeners = new Map<string, () => void>()

    addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, listener)
    }

    removeEventListener(type: string): void {
        this.listeners.delete(type)
    }

    fire(type: string): void {
        this.listeners.get(type)?.()
    }
}

function setup(state: AudioContextState = 'running') {
    const context = new FakeAudioContext(state)
    const gestures = new FakeGestures()
    const page = new PageAudio({ createContext: () => context.asContext, gestures })
    return { context, gestures, page, gain: () => context.gains[0].gain.value }
}

afterEach(() => {
    vi.useRealTimers()
})

describe('the page audio under node', () => {
    it('imports and wakes without a window, doing nothing', () => {
        expect(typeof window).toBe('undefined')
        expect(() => wakeAudio()).not.toThrow()
        expect(() => setAudioPreferences({ enabled: false, volume: 10 })).not.toThrow()
    })
})

describe('preferences', () => {
    it('maps mute and volume to the master gain', () => {
        expect(preferenceGain({ enabled: true, volume: 100 })).toBe(1)
        expect(preferenceGain({ enabled: true, volume: 50 })).toBe(0.25)
        expect(preferenceGain({ enabled: true, volume: 0 })).toBe(0)
        expect(preferenceGain({ enabled: false, volume: 100 })).toBe(0)
        expect(preferenceGain({ enabled: true, volume: 250 })).toBe(1)
    })

    it('sets the gain the context is made with, and follows later changes', () => {
        const { page, context, gain } = setup()
        page.setPreferences({ enabled: true, volume: 20 })
        const route = page.open()!
        expect(gain()).toBeCloseTo(0.04)
        expect(context.gains[0].connections).toEqual([context.destination])
        expect(route.destination).toBe(context.gains[0])
        page.setPreferences({ enabled: false, volume: 20 })
        expect(gain()).toBe(0)
        page.setPreferences({ enabled: true, volume: 100 })
        expect(gain()).toBe(1)
    })
})

describe('autoplay', () => {
    it('makes and starts the context on wake', () => {
        const { page, context } = setup('suspended')
        page.wake()
        expect(context.resumes).toBe(1)
        expect(page.use()).toBe(true)
    })

    it('holds back sound until a gesture when the browser keeps the context suspended', () => {
        const { page, context, gestures } = setup('suspended')
        expect(page.use()).toBe(false)
        expect(context.resumes).toBe(0)
        expect([...gestures.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown'])
        gestures.fire('pointerdown')
        expect(context.resumes).toBe(1)
        expect(gestures.listeners.size).toBe(0)
        expect(page.use()).toBe(true)
    })

    it('needs no gesture when the context starts running', () => {
        const { page, gestures } = setup('running')
        expect(page.use()).toBe(true)
        expect(gestures.listeners.size).toBe(0)
    })
})

describe('idle suspension', () => {
    it('suspends once nothing has sounded for 30 s, and resumes on the next sound', async () => {
        vi.useFakeTimers()
        const { page, context } = setup()
        let sounding = true
        page.use(() => sounding)
        await vi.advanceTimersByTimeAsync(IDLE_SUSPEND_MS * 2)
        expect(context.suspends).toBe(0)
        sounding = false
        await vi.advanceTimersByTimeAsync(IDLE_SUSPEND_MS - 2_000)
        expect(context.suspends).toBe(0)
        await vi.advanceTimersByTimeAsync(2_000)
        expect(context.suspends).toBe(1)
        expect(context.state).toBe('suspended')
        expect(page.use(() => false)).toBe(true)
        expect(context.state).toBe('running')
    })

    it('counts the 30 s again from each use', async () => {
        vi.useFakeTimers()
        const { page, context } = setup()
        page.use()
        await vi.advanceTimersByTimeAsync(IDLE_SUSPEND_MS - 5_000)
        page.use()
        await vi.advanceTimersByTimeAsync(IDLE_SUSPEND_MS - 5_000)
        expect(context.suspends).toBe(0)
        await vi.advanceTimersByTimeAsync(5_000)
        expect(context.suspends).toBe(1)
    })
})
