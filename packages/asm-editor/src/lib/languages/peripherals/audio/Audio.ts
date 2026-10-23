import { TerminalHistory, type TerminalPosition } from '../TerminalHistory'
import {
    SilentAudioOutput,
    type AudioCommand,
    type AudioNeed,
    type AudioOutput,
    type SoundData
} from './AudioOutput'
import { inspectSoundFile, type SoundFileInfo } from './soundFiles'

/**
 * The **Audio** Peripheral: what a program can observe of its **Notes** and **Sounds**
 * ([the design record](../../../../../../../docs/design/audio.md)). It answers every question a
 * program can ask, whether EASy68K's standard player is busy, what a slot holds, what a task did,
 * on **Program time** and without asking its output, so a muted run, a run whose bank never loaded
 * and a Testcase answer alike. The output only makes the noise, from the batches `flush()` sends it.
 *
 * - **Notes** are MARS's and RARS's MIDI services and the Z80's `NOTE_*` ports: a pitch on a General
 *   MIDI instrument for a duration, playing until the duration has passed.
 * - **Sounds** are EASy68K's tasks 70 to 77 on Files, on two players with 256 slots each: the
 *   standard player plays one WAV at a time and is busy until it ends (Windows' `PlaySound` with
 *   `SND_NOSTOP`); the DirectX player mixes WAVs and MIDI Files.
 * - At most 64 play at once, of which at most 4 are MIDI Files; one more cuts the oldest one-shot
 *   first and loops last. The cap changes what is heard, never an answer.
 * - **Silent**, for a Testcase: nothing ever plays, so every Sound has ended as it starts and the
 *   standard player is never busy, while the answers about Files and slots stay the same.
 * - Undo takes back what an instruction started and the slots it changed, and never starts anything
 *   ([ADR 0059](../../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)).
 *
 * Plain TypeScript with no Svelte runes, like the other peripherals, so it runs under node.
 */

export type SoundOutcome = 'Done' | 'Busy' | 'Missing' | 'Unplayable'

export type SoundPlayer = 'standard' | 'directx'

export type Note = {
    readonly pitch: number
    readonly duration: number
    readonly instrument: number
    readonly volume: number
}

/** A File a program named, as the FileSystem holds it. */
export type SoundFile = { readonly path: string; readonly bytes: Uint8Array }

/** A File read for playing: what its headers say, and its bytes when it can be played. */
export type OpenedSound = {
    readonly path: string
    readonly info: SoundFileInfo
    readonly data: SoundData | null
    /** What the File held when it was read, playable or not. */
    readonly bytes: Uint8Array
}

export type AudioActivity = {
    /** How many Notes and Sounds have started since this Audio was made; never reset. */
    readonly soundsStarted: number
    /** Whether a program is held while the synthesizer, its bank or a Sound loads. */
    readonly loading: boolean
    /** How much longer something is heard, in milliseconds; Infinity while a loop plays. */
    readonly playingForMs: number
}

export type AudioOptions = {
    /** Program time; only `now()` is read, at the point of use. */
    clock?: { now(): number }
    output?: AudioOutput
    /** A Testcase's Audio, where nothing ever plays. */
    silent?: boolean
}

/** What an Audio that has played nothing reports. */
export const QUIET_AUDIO: AudioActivity = { soundsStarted: 0, loading: false, playingForMs: 0 }

export const MAX_SOUNDING = 64
export const MAX_MIDI_SOUNDING = 4
export const SLOT_COUNT = 256

/** MARS's defaults for a Note argument outside its range (`ToneGenerator`). */
export const MARS_NOTE_DEFAULTS: Note = { pitch: 60, duration: 1000, instrument: 0, volume: 100 }

/**
 * MARS's ranges and defaults, as its MIDI services apply them: a pitch, instrument or volume
 * outside 0 to 127 becomes the default, and so does a negative duration. MARS and RARS apply them in
 * the Core; the Z80's ports, which have no Core of their own to do it, apply them here.
 */
export function marsNote(
    pitch: number,
    duration: number,
    instrument: number,
    volume: number
): Note {
    const inRange = (value: number) => Number.isInteger(value) && value >= 0 && value <= 127
    return {
        pitch: inRange(pitch) ? pitch : MARS_NOTE_DEFAULTS.pitch,
        duration: duration >= 0 ? duration : MARS_NOTE_DEFAULTS.duration,
        instrument: inRange(instrument) ? instrument : MARS_NOTE_DEFAULTS.instrument,
        volume: inRange(volume) ? volume : MARS_NOTE_DEFAULTS.volume
    }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

function lengthOf(sound: OpenedSound): number {
    return sound.info.kind === 'unplayable' ? 0 : sound.info.lengthMs
}

type Voice = {
    readonly id: number
    readonly midi: boolean
    readonly loop: boolean
    /** Program time the voice ends at; Infinity for a loop. */
    readonly endsAt: number
    readonly player: SoundPlayer | null
    readonly slot: number | null
}

type AudioRecord = {
    readonly position: TerminalPosition
    readonly started: number[]
    readonly restores: (() => void)[]
}

export class Audio {
    private readonly clock: { now(): number }
    private output: AudioOutput
    readonly silent: boolean
    private readonly voices = new Map<number, Voice>()
    private readonly slots: Record<SoundPlayer, (OpenedSound | undefined)[]> = {
        standard: [],
        directx: []
    }
    /** When the standard player's Sound ends, whatever the cap did to the voice; Infinity looping. */
    private standardEndsAt = -Infinity
    private standardVoice: number | null = null
    /** EASy68K's `currentWave`: the slot task 72 or 76 last played, which control 2 stops. */
    private currentSlot = -1
    private batch: AudioCommand[] = []
    private readonly history = new TerminalHistory<AudioRecord>()
    private readonly noted = new Set<string>()
    /**
     * The last Sound read from each path, reused while the File holds the same bytes, with the
     * array the FileSystem handed over for it, which stays the same until the File is written.
     */
    private readonly opened = new Map<string, { source: Uint8Array; sound: OpenedSound }>()
    private nextId = 1
    private started = 0
    /** What lets each program held by `prepare` go: the load ending, or a reset. */
    private readonly holds = new Set<() => void>()
    private failed = false
    private readonly listeners = new Set<(activity: AudioActivity) => void>()
    /** Where the notes for the Log go: a missing or unplayable File, a bank that did not load. */
    onNote: ((text: string) => void) | null = null

    constructor(options: AudioOptions = {}) {
        this.clock = options.clock ?? { now: () => 0 }
        this.output = options.output ?? new SilentAudioOutput()
        this.silent = options.silent ?? false
    }

    /** Hands the sound to a new output, the browser's once it has loaded. */
    setOutput(output: AudioOutput): void {
        this.output = output
    }

    // ------------------------------------------------------------------ journal

    /** Journals the Build about to run, as the Terminal does: `position` names the instruction running. */
    track(position: () => TerminalPosition | null, capacity: number): void {
        this.history.track(position, capacity)
    }

    /**
     * Records `restore` with the instruction running, to be run when Undo takes it back; for state
     * that lives outside Audio, such as the Z80's note registers.
     */
    record(restore: () => void): void {
        this.history.current(this.capture)?.restores.push(restore)
    }

    /**
     * Takes back every instruction after `position`: stops what each started, if it is still
     * playing, and restores the slots it changed. Nothing is started again.
     */
    undoAfter(position: TerminalPosition): void {
        this.history.undoAfter(position, (record) => {
            for (const id of record.started) {
                if (this.voices.delete(id)) this.batch.push({ type: 'stop', voice: id })
                if (this.standardVoice === id) this.standardVoice = null
            }
            for (let i = record.restores.length - 1; i >= 0; i--) record.restores[i]()
        })
        this.flush()
    }

    private readonly capture = (position: TerminalPosition): AudioRecord => ({
        position,
        started: [],
        restores: []
    })

    /** Changes a piece of state and journals how to put it back. */
    private change<T>(read: () => T, write: (value: T) => void, value: T): void {
        const previous = read()
        if (previous === value) return
        this.record(() => write(previous))
        write(value)
    }

    // ------------------------------------------------------------------ loading

    /**
     * Reads a File for playing; undefined when there is none, which the tasks answer as Missing. A
     * File read again with the same bytes is the same Sound, so its decoded sound is reused and a
     * program that retries a busy player, as EASy68K's own example does, waits on no decoding.
     */
    open(file: SoundFile | undefined): OpenedSound | undefined {
        if (file === undefined) return undefined
        const previous = this.opened.get(file.path)
        //the FileSystem hands over a File's own bytes and gives the File new ones on a write, so the
        //same array is the same content, and anything else is compared byte by byte
        if (
            previous &&
            (previous.source === file.bytes || sameBytes(previous.sound.bytes, file.bytes))
        ) {
            previous.source = file.bytes
            return previous.sound
        }
        //a copy of its own, since the FileSystem may reuse the buffer of bytes it handed over
        const bytes = file.bytes.slice()
        const info = inspectSoundFile(bytes)
        const data: SoundData | null =
            info.kind === 'unplayable' ? null : { id: this.nextId++, kind: info.kind, bytes }
        const sound: OpenedSound = { path: file.path, info, data, bytes }
        this.opened.set(file.path, { source: file.bytes, sound })
        return sound
    }

    /**
     * What the program has to wait for before `target` can sound, a Note or a Sound: the promise of
     * it, or null when there is nothing to wait for. The promise never rejects: an output that
     * cannot load leaves the program running in silence, with one note in the Log. A reset, which
     * Stop, Build and dispose make, settles it at once, as the clock lets a sleeping program go, so
     * a download nobody waits for any more never holds the Core.
     */
    prepare(target: OpenedSound | 'note'): Promise<void> | null {
        if (this.silent || this.failed) return null
        let need: AudioNeed
        if (target === 'note') need = { kind: 'synthesizer' }
        else if (target.data) need = { kind: 'sound', sound: target.data }
        else return null
        const loading = this.output.prepare(need)
        if (loading === null) return null
        return new Promise<void>((resolve) => {
            let held = true
            const release = () => {
                if (!held) return
                held = false
                this.holds.delete(release)
                this.notify()
                resolve()
            }
            this.holds.add(release)
            this.notify()
            loading.then(release, (error: unknown) => {
                this.noteFailure(error)
                release()
            })
        })
    }

    private noteFailure(error: unknown): void {
        if (this.failed) return
        this.failed = true
        const reason = error instanceof Error && error.message ? `: ${error.message}` : ''
        this.onNote?.(`Sounds could not be played: the sound bank did not load${reason}`)
    }

    // ------------------------------------------------------------------ Notes

    /** MARS's 31 and the Z80's `NOTE_PLAY`: the Note plays for its duration from now. */
    playNote(note: Note): void {
        if (this.silent) return
        const voice = this.start({
            midi: false,
            loop: false,
            durationMs: note.duration,
            player: null,
            slot: null
        })
        this.batch.push({
            type: 'note',
            voice: voice.id,
            pitch: note.pitch,
            instrument: note.instrument,
            volume: note.volume,
            durationMs: note.duration
        })
    }

    // ------------------------------------------------------------------ Sounds

    /** Tasks 70 (standard) and 73 (DirectX): plays a File straight away. */
    playFile(player: SoundPlayer, sound: OpenedSound | undefined): SoundOutcome {
        if (sound === undefined) return 'Missing'
        return player === 'standard'
            ? this.playStandard(sound, false)
            : this.playDirectX(sound, false, null)
    }

    /**
     * Tasks 71 (standard) and 74 (DirectX): loads a File into a slot. The standard player keeps
     * whatever it is given, a File it cannot play included, and fails when the slot is played; the
     * DirectX player empties the slot when the File cannot be played, as a failed DirectMusic load
     * does. A missing File leaves the slot as it was.
     */
    loadSlot(player: SoundPlayer, index: number, sound: OpenedSound | undefined): SoundOutcome {
        if (sound === undefined) return 'Missing'
        if (player === 'directx' && sound.data === null) {
            this.setSlot(player, index, undefined)
            return this.unplayable(sound)
        }
        this.setSlot(player, index, sound)
        return 'Done'
    }

    /** Tasks 72 (standard) and 75 (DirectX): plays the Sound a slot holds. */
    playSlot(player: SoundPlayer, index: number): SoundOutcome {
        const sound = this.slots[player][index]
        if (sound === undefined) return 'Missing'
        if (player === 'directx') return this.playDirectX(sound, false, index)
        this.change(
            () => this.currentSlot,
            (slot) => (this.currentSlot = slot),
            index
        )
        return this.playStandard(sound, false)
    }

    /**
     * Tasks 76 (standard) and 77 (DirectX) with D2.L's control: 0 plays the slot once, 1 loops it,
     * 2 stops it and 3 stops every Sound of the player. Stop-all works whatever the slot holds; on
     * the DirectX player EASy68K stopped nothing when the slot it was given was empty, which is not
     * kept, though the answer is.
     */
    control(player: SoundPlayer, index: number, code: number): SoundOutcome {
        const sound = this.slots[player][index]
        if (code === 3) {
            this.stopPlayer(player)
            return player === 'directx' && sound === undefined ? 'Missing' : 'Done'
        }
        if (sound === undefined) return 'Missing'
        if (player === 'standard') {
            if (code === 0 || code === 1) {
                this.change(
                    () => this.currentSlot,
                    (slot) => (this.currentSlot = slot),
                    index
                )
                return this.playStandard(sound, code === 1)
            }
            if (code === 2) {
                if (index !== this.currentSlot) return 'Missing'
                this.stopPlayer('standard')
                return 'Done'
            }
            return 'Missing'
        }
        if (code === 0 || code === 1) return this.playDirectX(sound, code === 1, index)
        if (code === 2) {
            for (const voice of [...this.voices.values()]) {
                if (voice.player === 'directx' && voice.slot === index) this.stopVoice(voice.id)
            }
            return 'Done'
        }
        return 'Missing'
    }

    private playStandard(sound: OpenedSound, loop: boolean): SoundOutcome {
        if (sound.data === null) return this.unplayable(sound)
        if (sound.info.kind === 'midi') {
            return this.unplayable(sound, 'a MIDI File, which only the DirectX tasks play')
        }
        if (this.standardBusy()) return 'Busy'
        const lengthMs = this.silent ? 0 : loop ? Infinity : lengthOf(sound)
        this.change(
            () => this.standardEndsAt,
            (endsAt) => (this.standardEndsAt = endsAt),
            this.clock.now() + lengthMs
        )
        if (this.silent) return 'Done'
        const voice = this.start({
            midi: false,
            loop,
            durationMs: lengthOf(sound),
            player: 'standard',
            slot: null
        })
        this.change(
            () => this.standardVoice,
            (id) => (this.standardVoice = id),
            voice.id
        )
        this.batch.push({ type: 'sound', voice: voice.id, sound: sound.data, loop })
        return 'Done'
    }

    private playDirectX(sound: OpenedSound, loop: boolean, slot: number | null): SoundOutcome {
        if (sound.data === null) return this.unplayable(sound)
        if (this.silent) return 'Done'
        const voice = this.start({
            midi: sound.info.kind === 'midi',
            loop,
            durationMs: lengthOf(sound),
            player: 'directx',
            slot
        })
        this.batch.push({ type: 'sound', voice: voice.id, sound: sound.data, loop })
        return 'Done'
    }

    private standardBusy(): boolean {
        return this.clock.now() < this.standardEndsAt
    }

    private stopPlayer(player: SoundPlayer): void {
        if (player === 'standard') {
            if (this.standardBusy()) {
                this.change(
                    () => this.standardEndsAt,
                    (endsAt) => (this.standardEndsAt = endsAt),
                    this.clock.now()
                )
            }
            if (this.standardVoice !== null) this.stopVoice(this.standardVoice)
            return
        }
        for (const voice of [...this.voices.values()]) {
            if (voice.player === 'directx') this.stopVoice(voice.id)
        }
    }

    private setSlot(player: SoundPlayer, index: number, sound: OpenedSound | undefined): void {
        const slots = this.slots[player]
        this.change(
            () => slots[index],
            (value) => (slots[index] = value),
            sound
        )
    }

    private unplayable(sound: OpenedSound, what?: string): SoundOutcome {
        const format = what ?? (sound.info.kind === 'unplayable' ? sound.info.format : 'unplayable')
        this.note(`Sound File '${sound.path}' is ${format}, which cannot be played`)
        return 'Unplayable'
    }

    /** Notes a missing File for the Log; the adapter calls it, since only it knows the path asked for. */
    noteMissing(path: string): void {
        this.note(`Sound File '${path}' not found`)
    }

    private note(text: string): void {
        if (this.noted.has(text)) return
        this.noted.add(text)
        this.onNote?.(text)
    }

    // ------------------------------------------------------------------ voices

    private start(voice: {
        midi: boolean
        loop: boolean
        durationMs: number
        player: SoundPlayer | null
        slot: number | null
    }): Voice {
        const now = this.clock.now()
        this.prune(now)
        if (voice.midi) {
            while (this.count((v) => v.midi) >= MAX_MIDI_SOUNDING) this.cutOldest((v) => v.midi)
        }
        while (this.voices.size >= MAX_SOUNDING) this.cutOldest(() => true)
        const started: Voice = {
            id: this.nextId++,
            midi: voice.midi,
            loop: voice.loop,
            endsAt: voice.loop ? Infinity : now + voice.durationMs,
            player: voice.player,
            slot: voice.slot
        }
        this.voices.set(started.id, started)
        this.history.current(this.capture)?.started.push(started.id)
        this.started++
        return started
    }

    private count(test: (voice: Voice) => boolean): number {
        let count = 0
        for (const voice of this.voices.values()) if (test(voice)) count++
        return count
    }

    /** Cuts the oldest one-shot that passes `test`, or the oldest loop when every one is a loop. */
    private cutOldest(test: (voice: Voice) => boolean): void {
        let oldestLoop: Voice | undefined
        for (const voice of this.voices.values()) {
            if (!test(voice)) continue
            if (!voice.loop) return this.stopVoice(voice.id)
            oldestLoop ??= voice
        }
        if (oldestLoop) this.stopVoice(oldestLoop.id)
    }

    private stopVoice(id: number): void {
        if (!this.voices.delete(id)) return
        if (this.standardVoice === id) this.standardVoice = null
        this.batch.push({ type: 'stop', voice: id })
    }

    /** Forgets voices whose time is up: the output ends them on its own. */
    private prune(now: number): void {
        for (const [id, voice] of this.voices) {
            if (voice.endsAt <= now) {
                this.voices.delete(id)
                if (this.standardVoice === id) this.standardVoice = null
            }
        }
    }

    // ------------------------------------------------------------------ lifecycle

    /** The program ended on its own: loops stop, the rest plays out. */
    stopLoops(): void {
        for (const voice of [...this.voices.values()]) {
            if (voice.loop) this.stopVoice(voice.id)
        }
        if (this.standardEndsAt === Infinity) this.standardEndsAt = this.clock.now()
        this.flush()
    }

    /**
     * Build, Stop, dispose and the start of each Testcase: silence at once, every slot emptied and
     * the journal dropped, as EASy68K's `ResetSounds` does when a program is loaded.
     */
    reset(): void {
        this.voices.clear()
        this.slots.standard = []
        this.slots.directx = []
        this.standardEndsAt = -Infinity
        this.standardVoice = null
        this.currentSlot = -1
        this.batch = []
        this.history.clear()
        this.noted.clear()
        this.opened.clear()
        for (const release of [...this.holds]) release()
        if (!this.silent) this.output.send([{ type: 'stopAll' }])
        this.notify()
    }

    /**
     * Sends what changed since the last flush. A voice started and stopped within it is never sent,
     * which is what keeps a runaway loop of Notes to one message per surviving Note.
     */
    flush(): void {
        if (this.batch.length === 0) return
        const batch = this.batch
        this.batch = []
        const startedHere = new Set<number>()
        const stoppedHere = new Set<number>()
        for (const command of batch) {
            if (command.type === 'note' || command.type === 'sound') startedHere.add(command.voice)
            else if (command.type === 'stop' && startedHere.has(command.voice))
                stoppedHere.add(command.voice)
        }
        const kept = batch.filter(
            (command) => command.type === 'stopAll' || !stoppedHere.has(command.voice)
        )
        if (kept.length > 0 && !this.silent) this.output.send(kept)
        this.notify()
    }

    get activity(): AudioActivity {
        const now = this.clock.now()
        let until = now
        for (const voice of this.voices.values()) until = Math.max(until, voice.endsAt)
        return {
            soundsStarted: this.started,
            loading: this.holds.size > 0,
            playingForMs: until - now
        }
    }

    /** Calls `listener` with the activity whenever a flush, a load or a reset changes it. */
    subscribe(listener: (activity: AudioActivity) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private notify(): void {
        if (this.listeners.size === 0) return
        const activity = this.activity
        for (const listener of this.listeners) listener(activity)
    }
}
