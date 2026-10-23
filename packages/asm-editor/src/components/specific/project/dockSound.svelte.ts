import type { AudioActivity } from '#lib/languages/peripherals/audio/Audio.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import type { DockSound } from './ExecutionDock.svelte'

/**
 * The execution dock's speaker button for one host's Emulator
 * ([audio.md](../../../../../../docs/design/audio.md#autoplay-mute-and-volume)): absent until the
 * program first makes a sound or waits for the sound bank, and kept from then on for as long as the
 * page is open, since `soundsStarted` is never reset; lit while something is heard. Muting is the
 * Sound Preference, so it follows the person to every Project and never changes what a program
 * observes.
 *
 * Made during a component's initialisation: the timer that puts the light out is an effect.
 */
export class DockSoundState {
    private playing = $state(false)
    private readonly activity: () => AudioActivity | undefined

    constructor(activity: () => AudioActivity | undefined) {
        this.activity = activity
        $effect(() => {
            const current = this.activity()
            if (!current || current.playingForMs <= 0) {
                this.playing = false
                return
            }
            this.playing = true
            //a loop plays until the program stops it, which a later activity says
            if (!Number.isFinite(current.playingForMs)) return
            const timer = setTimeout(() => (this.playing = false), current.playingForMs)
            return () => clearTimeout(timer)
        })
    }

    get value(): DockSound | undefined {
        const current = this.activity()
        if (!current || (current.soundsStarted === 0 && !current.loading)) return undefined
        const enabled = preferencesStore.values.sound.value
        return {
            muted: !enabled,
            playing: this.playing,
            loading: current.loading,
            onToggle: () => preferencesStore.setValue('sound', !enabled)
        }
    }
}
