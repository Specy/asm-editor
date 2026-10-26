/**
 * The execution dock's speaker button ([audio.md](../../../../../../docs/design/audio.md#autoplay-mute-and-volume)):
 * absent until a program makes a sound, lit while one plays, a toggle of the Sound Preference.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import type { AudioActivity } from '#lib/languages/peripherals/audio/Audio.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import ExecutionDock, { type DockSound } from './ExecutionDock.svelte'
import { DockSoundState } from './dockSound.svelte.ts'

const QUIET: AudioActivity = { soundsStarted: 0, loading: false, playingForMs: 0 }

let cleanup = () => {}
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    preferencesStore.setValue('sound', true)
})

function track(initial: AudioActivity) {
    let activity = $state(initial)
    let state!: DockSoundState
    const stop = $effect.root(() => {
        state = new DockSoundState(() => activity)
    })
    cleanup = stop
    flushSync()
    return {
        get value() {
            return state.value
        },
        set(next: AudioActivity) {
            activity = next
            flushSync()
        }
    }
}

describe('the speaker button state', () => {
    it('is absent until the program makes a sound or waits for the bank', () => {
        const sound = track(QUIET)
        expect(sound.value).toBeUndefined()
        sound.set({ ...QUIET, loading: true })
        expect(sound.value?.loading).toBe(true)
        sound.set({ soundsStarted: 1, loading: false, playingForMs: 0 })
        expect(sound.value).toMatchObject({ loading: false, playing: false, muted: false })
    })

    it('is lit while something is heard and goes out when it ends', () => {
        vi.useFakeTimers()
        const sound = track(QUIET)
        sound.set({ soundsStarted: 1, loading: false, playingForMs: 500 })
        expect(sound.value?.playing).toBe(true)
        vi.advanceTimersByTime(499)
        flushSync()
        expect(sound.value?.playing).toBe(true)
        vi.advanceTimersByTime(1)
        flushSync()
        expect(sound.value?.playing).toBe(false)
    })

    it('stays lit through a loop', () => {
        vi.useFakeTimers()
        const sound = track({ soundsStarted: 1, loading: false, playingForMs: Infinity })
        vi.advanceTimersByTime(60_000)
        flushSync()
        expect(sound.value?.playing).toBe(true)
    })

    it('toggles the Sound Preference', () => {
        const sound = track({ soundsStarted: 1, loading: false, playingForMs: 0 })
        sound.value!.onToggle()
        flushSync()
        expect(preferencesStore.values.sound.value).toBe(false)
        expect(sound.value?.muted).toBe(true)
    })
})

describe('the dock', () => {
    function dock(sound: DockSound | undefined) {
        const target = document.createElement('div')
        const app = mount(ExecutionDock, {
            target,
            props: {
                debugging: true,
                building: false,
                running: false,
                buildDisabled: false,
                executionDisabled: false,
                canUndo: false,
                sound,
                onBuild: () => {},
                onStop: () => {},
                onRun: () => {},
                onPause: () => {},
                onUndo: () => {},
                onStep: () => {}
            }
        })
        flushSync()
        cleanup = () => unmount(app)
        return target.querySelector<HTMLButtonElement>('button.sound')
    }
    /** The button's Tooltip, its description. */
    const description = (button: HTMLElement) =>
        document.getElementById(button.getAttribute('aria-describedby')!)?.textContent

    it('has no speaker button until the host passes one', () => {
        expect(dock(undefined)).toBeNull()
    })

    it('says what a press does, and shows the bank loading', () => {
        const onToggle = vi.fn()
        const on = dock({ muted: false, playing: true, loading: false, onToggle })!
        expect(description(on)).toBe('Turn sound off')
        //a toggle named Sound is pressed while sound is on
        expect(on.getAttribute('aria-pressed')).toBe('true')
        expect(on.classList.contains('playing')).toBe(true)
        on.click()
        expect(onToggle).toHaveBeenCalledOnce()
        cleanup()
        const off = dock({ muted: true, playing: true, loading: false, onToggle })!
        expect(description(off)).toBe('Turn sound on')
        expect(off.getAttribute('aria-pressed')).toBe('false')
        expect(off.classList.contains('playing')).toBe(false)
        cleanup()
        expect(description(dock({ muted: false, playing: false, loading: true, onToggle })!)).toBe(
            'Loading sounds…'
        )
    })
})
