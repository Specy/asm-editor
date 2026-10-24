import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'
import bankUrl from './assets/soundbank-emg.sf2?url'
import { MAX_MIDI_SOUNDING, MAX_SOUNDING } from './Audio'

/**
 * The synthesizer every **Note** and MIDI File plays on: spessasynth_lib on the bank MARS plays on
 * ([ADR 0058](../../../../../../../docs/adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md)).
 * Only `browserAudioOutput.ts` reaches this module, through a dynamic `import()`, so the engine, its
 * worklet processor and the bank load when a program first plays a Note or a MIDI File and never
 * before. The processor and the bank are `?url` assets, which the build content-hashes into
 * `_app/immutable/` for the service worker to keep.
 *
 * - **Notes** share one synthesizer, a channel each from a pool of 64 made once at load, every one
 *   melodic ([the plan](../../../../../../../docs/design/audio-plan.md), decision 4): a program
 *   change, a note-on, and a note-off the worklet schedules for the end of the duration. A channel
 *   is free again once its Note's note-off has passed.
 * - **MIDI Sounds** each play on a synthesizer of their own through a `Sequencer` (decision 3): at
 *   most 4, made when none is free, kept for reuse, and disconnected while idle so they cost the
 *   audio thread nothing.
 */

/** A Note or MIDI Sound started on the engine. */
export type EngineVoice = {
    /** Whether it may still be heard: false once it ended or was stopped. */
    sounding(): boolean
    /** Ends it: at once when `cut`, else the way letting go of a key does. */
    stop(cut: boolean): void
}

export type SynthesizerEngine = {
    playNote(pitch: number, instrument: number, volume: number, durationMs: number): EngineVoice
    /** Readies a synthesizer for a MIDI Sound: the promise of it, or null when one is free already. */
    prepareMidi(): Promise<void> | null
    /** Plays a Standard MIDI File, looping or for `lengthMs`, the length its headers give. */
    playMidi(bytes: Uint8Array, loop: boolean, lengthMs: number): EngineVoice
}

const BANK_ID = 'emg'
/** A synthesizer starts with 16 channels. */
const FIRST_CHANNELS = 16
/**
 * The channels each MIDI Sound's synthesizer gets: four MIDI ports of 16. A File that spreads its
 * tracks over several ports plays them on channels 16 and up, which the sequencer would otherwise add
 * itself, with every controller at 0 and so silent, the way `addNewChannel` leaves them.
 */
const MIDI_PORT_CHANNELS = 64
/** All Sound Off: silences one channel at once, notes still releasing included. */
const ALL_SOUND_OFF = 120
/** How long an idle MIDI synthesizer stays connected, for the release of its last notes. */
const IDLE_DISCONNECT_MS = 2_000
/** How long past its length a one-shot MIDI Sound counts as playing if the sequencer never says it ended. */
const MIDI_END_GRACE_S = 2

const ENDED: EngineVoice = { sounding: () => false, stop: () => {} }

export async function loadSynthesizerEngine(
    context: AudioContext,
    destination: AudioNode
): Promise<SynthesizerEngine> {
    if (!context.audioWorklet) throw new Error('this browser has no AudioWorklet')
    const [bank] = await Promise.all([fetchBank(), context.audioWorklet.addModule(processorUrl)])
    const notes = new WorkletSynthesizer(context)
    await withBank(notes, bank)
    //`channelCount` counts every added channel twice, once at the call and once when the worklet
    //answers, so the pool is counted here and never read back from it
    for (let channel = FIRST_CHANNELS; channel < MAX_SOUNDING; channel++) notes.addNewChannel()
    //added channels start with every controller at 0, volume and expression included, so their
    //Notes are silent until a reset gives them the defaults the first 16 have
    notes.reset()
    //added channels start as drum channels, and the reset makes every sixteenth one a drum channel
    for (let channel = 0; channel < MAX_SOUNDING; channel++) {
        notes.midiChannels[channel].setDrums(false)
    }
    notes.connect(destination)
    return new Engine(context, destination, bank, notes)
}

async function fetchBank(): Promise<ArrayBuffer> {
    const response = await fetch(bankUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bank = await response.arrayBuffer()
    const riff = new Uint8Array(bank, 0, Math.min(4, bank.byteLength))
    if (String.fromCharCode(...riff) !== 'RIFF') throw new Error('the server sent something else')
    return bank
}

/**
 * Gives `synth` its own copy of the bank, since the worklet takes the buffer it is handed. The bank
 * is posted at once, so whatever is sent to the synthesizer after it plays on it; the promise
 * settles once it is in, or rejects when the worklet could not read it.
 */
function withBank(synth: WorkletSynthesizer, bank: ArrayBuffer): Promise<void> {
    const failed = new Promise<never>((_, reject) =>
        synth.eventHandler.addEvent('soundBankError', 'audio', (error) => reject(error))
    )
    const added = synth.soundBankManager.addSoundBank(bank.slice(0), BANK_ID)
    return Promise.race([Promise.all([added, synth.isReady]).then(() => {}), failed])
}

type Channel = {
    readonly index: number
    /** The Note last started on it. */
    note: NoteVoice | null
    /**
     * The worklet keeps every scheduled note-off until its time, even for a Note stopped early, so a
     * channel cannot take a Note at a pitch whose earlier note-off is still to come: by pitch, when
     * the last one scheduled fires.
     */
    readonly offs: Map<number, number>
}

class NoteVoice implements EngineVoice {
    stopped = false

    constructor(
        private readonly engine: Engine,
        readonly channel: Channel,
        readonly pitch: number,
        readonly startedAt: number,
        readonly offAt: number
    ) {}

    sounding(): boolean {
        return !this.stopped && this.engine.now < this.offAt
    }

    stop(cut: boolean): void {
        this.engine.stopNote(this, cut)
    }
}

type MidiPlayer = {
    readonly synth: WorkletSynthesizer
    readonly sequencer: Sequencer
    /** Settles once the synthesizer has its bank. */
    readonly ready: Promise<void>
    loaded: boolean
    /** The MIDI Sound playing on it, null once that ended. */
    voice: MidiVoice | null
    connected: boolean
    idleTimer: ReturnType<typeof setTimeout> | null
}

class MidiVoice implements EngineVoice {
    ended = false

    constructor(
        private readonly engine: Engine,
        readonly player: MidiPlayer,
        readonly loop: boolean,
        readonly startedAt: number,
        private readonly endsBy: number
    ) {}

    sounding(): boolean {
        return !this.ended && (this.loop || this.engine.now < this.endsBy)
    }

    stop(): void {
        this.engine.stopMidi(this)
    }
}

class Engine implements SynthesizerEngine {
    private readonly channels: Channel[]
    /** Where the search for a free channel starts, so the one silent longest is taken first. */
    private nextChannel = 0
    private readonly players: MidiPlayer[] = []

    constructor(
        private readonly context: AudioContext,
        private readonly destination: AudioNode,
        private readonly bank: ArrayBuffer,
        private readonly notes: WorkletSynthesizer
    ) {
        this.channels = Array.from({ length: MAX_SOUNDING }, (_, index) => ({
            index,
            note: null,
            offs: new Map()
        }))
    }

    get now(): number {
        return this.context.currentTime
    }

    // ------------------------------------------------------------------ Notes

    playNote(pitch: number, instrument: number, volume: number, durationMs: number): EngineVoice {
        const now = this.now
        const channel = this.takeChannel(pitch, now)
        const offAt = now + Math.max(0, durationMs) / 1000
        const voice = new NoteVoice(this, channel, pitch, now, offAt)
        channel.note = voice
        channel.offs.set(pitch, Math.max(offAt, channel.offs.get(pitch) ?? 0))
        this.notes.programChange(channel.index, instrument)
        this.notes.noteOn(channel.index, pitch, volume)
        this.notes.noteOff(channel.index, pitch, { time: offAt })
        return voice
    }

    /**
     * A channel with no Note sounding and no note-off to come at `pitch`. Every channel is busy only
     * when several Emulators sound at once; then the oldest Note is cut, on a channel with no note-off
     * to come at this pitch if there is one.
     */
    private takeChannel(pitch: number, now: number): Channel {
        let oldest: Channel | undefined
        let oldestClear: Channel | undefined
        const startedAt = (channel: Channel | undefined) => channel?.note?.startedAt ?? Infinity
        for (let i = 0; i < this.channels.length; i++) {
            const channel = this.channels[(this.nextChannel + i) % this.channels.length]
            const clear = (channel.offs.get(pitch) ?? -Infinity) <= now
            if (clear && !channel.note?.sounding()) {
                this.nextChannel = (channel.index + 1) % this.channels.length
                return channel
            }
            if (startedAt(channel) < startedAt(oldest)) oldest = channel
            if (clear && startedAt(channel) < startedAt(oldestClear)) oldestClear = channel
        }
        const channel = oldestClear ?? oldest ?? this.channels[0]
        if (channel.note) this.stopNote(channel.note, true)
        return channel
    }

    stopNote(voice: NoteVoice, cut: boolean): void {
        if (voice.stopped) return
        const sounding = voice.sounding()
        voice.stopped = true
        //a channel that has moved on to another Note is that Note's now
        if (voice.channel.note !== voice) return
        if (cut) this.notes.controllerChange(voice.channel.index, ALL_SOUND_OFF, 0)
        else if (sounding) this.notes.noteOff(voice.channel.index, voice.pitch)
    }

    // ------------------------------------------------------------------ MIDI Sounds

    prepareMidi(): Promise<void> | null {
        const free = this.players.find((player) => !player.voice?.sounding())
        if (free) return free.loaded ? null : free.ready
        if (this.players.length >= MAX_MIDI_SOUNDING) return null
        return this.createPlayer().ready
    }

    playMidi(bytes: Uint8Array, loop: boolean, lengthMs: number): EngineVoice {
        //a sequencer handed a File with no length keeps the File it had and plays that one again
        if (lengthMs <= 0) return ENDED
        const player = this.takePlayer()
        const now = this.now
        const voice = new MidiVoice(
            this,
            player,
            loop,
            now,
            now + lengthMs / 1000 + MIDI_END_GRACE_S
        )
        player.voice = voice
        if (player.idleTimer !== null) clearTimeout(player.idleTimer)
        player.idleTimer = null
        if (!player.connected) player.synth.connect(this.destination)
        player.connected = true
        //before the File, so that the sequencer's own rule for very short Files, never to loop them, wins
        player.sequencer.loopCount = loop ? Infinity : 0
        player.sequencer.loadNewSongList([{ binary: bytes.slice().buffer }])
        player.sequencer.play()
        return voice
    }

    /** A free synthesizer, a new one while there are fewer than 4, or the one playing longest. */
    private takePlayer(): MidiPlayer {
        let oldest: MidiVoice | undefined
        for (const player of this.players) {
            const voice = player.voice
            if (voice === null) return player
            if (!voice.sounding()) {
                this.stopMidi(voice)
                return player
            }
            if (oldest === undefined || voice.startedAt < oldest.startedAt) oldest = voice
        }
        if (oldest === undefined || this.players.length < MAX_MIDI_SOUNDING)
            return this.createPlayer()
        this.stopMidi(oldest)
        return oldest.player
    }

    private createPlayer(): MidiPlayer {
        const synth = new WorkletSynthesizer(this.context)
        const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false })
        //the ports' channels are added once the bank is in, and reset so they get the defaults the
        //first 16 have, before any song loads: a reset after a song had loaded could land after its
        //first program changes and turn every instrument back into a piano
        const ready = withBank(synth, this.bank).then(() => {
            for (let channel = FIRST_CHANNELS; channel < MIDI_PORT_CHANNELS; channel++) {
                synth.addNewChannel()
            }
            synth.reset()
        })
        const player: MidiPlayer = {
            synth,
            sequencer,
            ready,
            loaded: false,
            voice: null,
            connected: false,
            idleTimer: null
        }
        ready.then(
            () => (player.loaded = true),
            () => {}
        )
        const ended = () => {
            if (player.voice === null) return
            player.voice.ended = true
            this.release(player)
        }
        sequencer.eventHandler.addEvent('songEnded', 'audio', ended)
        sequencer.eventHandler.addEvent('midiError', 'audio', ended)
        this.players.push(player)
        return player
    }

    stopMidi(voice: MidiVoice): void {
        if (voice.ended) return
        voice.ended = true
        const player = voice.player
        if (player.voice !== voice) return
        player.sequencer.pause()
        player.synth.stopAll(true)
        this.release(player)
    }

    private release(player: MidiPlayer): void {
        player.voice = null
        if (player.idleTimer !== null) clearTimeout(player.idleTimer)
        player.idleTimer = setTimeout(() => {
            player.idleTimer = null
            if (player.voice !== null || !player.connected) return
            player.synth.disconnect()
            player.connected = false
        }, IDLE_DISCONNECT_MS)
    }
}
