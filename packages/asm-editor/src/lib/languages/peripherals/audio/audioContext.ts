/**
 * The page's one `AudioContext`, which every Emulator's sound plays through, and the master gain the
 * Preferences set ([the design record](../../../../../../../docs/design/audio.md#autoplay-mute-and-volume)).
 *
 * - A browser lets a context start only from a click or a key press, and Safari only inside the
 *   handler's own call stack, so `wakeAudio()` is the first thing the Build, Run and Step handlers do,
 *   before any `await`. A context made without one waits for the next click or key press anywhere on
 *   the page, and the Notes and Sounds started meanwhile are dropped rather than heard late, all at
 *   once. The program notices nothing either way.
 * - Mute and volume are the master gain: muted is a gain of 0, so a muted run plays exactly as an
 *   unmuted one does, in silence.
 * - After 30 s with nothing sounding the context is suspended, which lets the browser close the audio
 *   device and take the speaker off the tab, as the TRS-80 emulator upstream does; the next sound
 *   resumes it.
 *
 * Nothing here touches `window` or `document` before it is first used, so it imports under node and
 * during server rendering, where `wakeAudio()` does nothing.
 */

export type AudioPreferences = {
    enabled: boolean
    /** 0 to 100. */
    volume: number
}

/** Where sound goes: the context and the master gain everything connects to. */
export type AudioRoute = {
    readonly context: AudioContext
    readonly destination: AudioNode
}

type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

export type PageAudioOptions = {
    /** Makes the context; null where there is no Web Audio. Injected by the tests. */
    createContext?: () => AudioContext | null
    /** Where a click or key press resumes a context the browser held back; the document by default. */
    gestures?: GestureTarget | null
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = { enabled: true, volume: 50 }

/** How long nothing has to sound before the context is suspended. */
export const IDLE_SUSPEND_MS = 30_000
const IDLE_CHECK_MS = 1_000
/** How quickly the gain follows a change of Preferences, so muting a loud loop does not click. */
const GAIN_TIME_CONSTANT_S = 0.01
const GESTURES = ['pointerdown', 'keydown'] as const
const GESTURE_LISTENER = { capture: true, passive: true }

/**
 * The master gain for `preferences`: the square of the volume, which sounds closer to even steps than
 * a straight line does, so the default of 50 plays at a quarter of full scale, 12 dB down.
 */
export function preferenceGain(preferences: AudioPreferences): number {
    if (!preferences.enabled) return 0
    const volume = Math.min(100, Math.max(0, preferences.volume)) / 100
    return volume * volume
}

function createPageContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null
    return new AudioContext({ latencyHint: 'interactive' })
}

export class PageAudio {
    private route: AudioRoute | null = null
    private gain: GainNode | null = null
    private preferences = DEFAULT_AUDIO_PREFERENCES
    /** Whether the browser lets the context run: it has run, or a gesture resumed it. */
    private unlocked = false
    /** The outputs that played something, each until it reports silence. */
    private readonly sources = new Set<() => boolean>()
    private quietMs = 0
    private idleTimer: ReturnType<typeof setInterval> | null = null
    /** Set from the idle suspension until the next resume, since `state` lags a pending suspend. */
    private idle = false
    private waitingForGesture = false

    constructor(private readonly options: PageAudioOptions = {}) {}

    /** The context and the master gain, made on first use; null where there is no Web Audio. */
    open(): AudioRoute | null {
        if (this.route) return this.route
        const context = (this.options.createContext ?? createPageContext)()
        if (context === null) return null
        const gain = context.createGain()
        gain.gain.value = preferenceGain(this.preferences)
        gain.connect(context.destination)
        this.route = { context, destination: gain }
        this.gain = gain
        if (context.state === 'running') this.unlocked = true
        return this.route
    }

    /** Called inside a click or key press: makes the context if needed and starts it. */
    wake(): void {
        const route = this.open()
        if (route === null) return
        this.unlocked = true
        this.resume(route.context)
    }

    /**
     * Readies the context for sound: resumes it when it was suspended for being idle, and keeps it
     * awake while `sounding` answers true. Answers false while the browser holds the context back
     * until a gesture, when nothing should be started.
     */
    use(sounding?: () => boolean): boolean {
        const route = this.open()
        if (route === null) return false
        if (!this.unlocked) {
            if (route.context.state !== 'running') {
                this.waitForGesture()
                return false
            }
            this.unlocked = true
        }
        if (sounding) this.sources.add(sounding)
        this.resume(route.context)
        return true
    }

    setPreferences(preferences: AudioPreferences): void {
        this.preferences = { ...preferences }
        if (this.route === null || this.gain === null) return
        const now = this.route.context.currentTime
        this.gain.gain.cancelScheduledValues(now)
        this.gain.gain.setTargetAtTime(preferenceGain(preferences), now, GAIN_TIME_CONSTANT_S)
    }

    private resume(context: AudioContext): void {
        this.quietMs = 0
        this.idleTimer ??= setInterval(() => this.checkIdle(), IDLE_CHECK_MS)
        if (context.state === 'running' && !this.idle) return
        this.idle = false
        context.resume().catch(() => {})
    }

    private checkIdle(): void {
        for (const sounding of this.sources) {
            if (!sounding()) this.sources.delete(sounding)
        }
        if (this.sources.size > 0) {
            this.quietMs = 0
            return
        }
        this.quietMs += IDLE_CHECK_MS
        if (this.quietMs < IDLE_SUSPEND_MS) return
        if (this.idleTimer !== null) clearInterval(this.idleTimer)
        this.idleTimer = null
        const context = this.route?.context
        if (context?.state !== 'running') return
        this.idle = true
        context.suspend().catch(() => {})
    }

    private waitForGesture(): void {
        const target =
            this.options.gestures === undefined ? globalThis.document : this.options.gestures
        if (!target || this.waitingForGesture) return
        this.waitingForGesture = true
        const onGesture = () => {
            for (const type of GESTURES) {
                target.removeEventListener(type, onGesture, GESTURE_LISTENER)
            }
            this.waitingForGesture = false
            if (this.route === null) return
            this.unlocked = true
            this.resume(this.route.context)
        }
        for (const type of GESTURES) target.addEventListener(type, onGesture, GESTURE_LISTENER)
    }
}

const page = new PageAudio()

/** The page's audio, which every browser output plays through. */
export function pageAudio(): PageAudio {
    return page
}

/**
 * Starts the page's audio from a click or key press: call it synchronously at the top of the Build,
 * Run and Step handlers, before anything is awaited.
 */
export function wakeAudio(): void {
    page.wake()
}

/** Mute and volume, from the person's Preferences. */
export function setAudioPreferences(preferences: AudioPreferences): void {
    page.setPreferences(preferences)
}
