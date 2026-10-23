import { describe, expect, it } from 'vite-plus/test'
import { Audio, MAX_MIDI_SOUNDING, MAX_SOUNDING, marsNote, type SoundFile } from './Audio'
import { RecordingAudioOutput, type AudioCommand } from './AudioOutput'
import { makeMidi, makeWav } from './soundFixtures'

function setup(options: { silent?: boolean } = {}) {
    let time = 0
    const output = new RecordingAudioOutput()
    const notes: string[] = []
    const audio = new Audio({ clock: { now: () => time }, output, silent: options.silent })
    audio.onNote = (text) => notes.push(text)
    let position: number | null = null
    audio.track(() => position, 100)
    return {
        audio,
        output,
        notes,
        at: (ms: number) => (time = ms),
        /** Runs `body` as the instruction at `at`, as an adapter names the one executing. */
        step<T>(at: number, body: () => T): T {
            position = at
            try {
                return body()
            } finally {
                position = null
            }
        }
    }
}

const wav = (path = 'beep.wav', lengthMs = 500): SoundFile => ({
    path,
    bytes: makeWav({ lengthMs })
})
const midi = (path = 'song.mid'): SoundFile => ({ path, bytes: makeMidi(4) })
const started = (commands: AudioCommand[]) =>
    commands.filter((c) => c.type === 'note' || c.type === 'sound').length
const stops = (commands: AudioCommand[]) => commands.filter((c) => c.type === 'stop').length

describe('Notes', () => {
    it('applies MARS ranges and defaults', () => {
        expect(marsNote(-1, -5, 128, 200)).toEqual({
            pitch: 60,
            duration: 1000,
            instrument: 0,
            volume: 100
        })
        expect(marsNote(0, 0, 127, 0)).toEqual({
            pitch: 0,
            duration: 0,
            instrument: 127,
            volume: 0
        })
    })

    it('sends a Note at the flush and plays it for its duration', () => {
        const { audio, output, at } = setup()
        audio.playNote({ pitch: 64, duration: 400, instrument: 40, volume: 90 })
        expect(output.batches).toEqual([])
        audio.flush()
        expect(output.commands).toEqual([
            {
                type: 'note',
                voice: expect.any(Number),
                pitch: 64,
                instrument: 40,
                volume: 90,
                durationMs: 400
            }
        ])
        at(100)
        expect(audio.activity.playingForMs).toBe(300)
        at(500)
        expect(audio.activity.playingForMs).toBe(0)
        expect(audio.activity.soundsStarted).toBe(1)
    })
})

describe('the standard player', () => {
    it('is busy until its Sound ends, in program time', () => {
        const { audio, at } = setup()
        const sound = audio.open(wav('beep.wav', 500))
        expect(audio.playFile('standard', sound)).toBe('Done')
        at(499)
        expect(audio.playFile('standard', sound)).toBe('Busy')
        at(500)
        expect(audio.playFile('standard', sound)).toBe('Done')
    })

    it('answers Missing for no File and keeps the slot a missing load names', () => {
        const { audio } = setup()
        expect(audio.playFile('standard', undefined)).toBe('Missing')
        expect(audio.playSlot('standard', 3)).toBe('Missing')
        audio.loadSlot('standard', 3, audio.open(wav()))
        expect(audio.loadSlot('standard', 3, undefined)).toBe('Missing')
        expect(audio.playSlot('standard', 3)).toBe('Done')
    })

    it('loads a File it cannot play and fails when the slot is played', () => {
        const { audio, notes } = setup()
        const broken = audio.open({ path: 'tape.wav', bytes: makeWav({ format: 0x11, bits: 4 }) })
        expect(audio.loadSlot('standard', 0, broken)).toBe('Done')
        expect(audio.playSlot('standard', 0)).toBe('Unplayable')
        expect(audio.playSlot('standard', 0)).toBe('Unplayable')
        expect(notes).toEqual([
            "Sound File 'tape.wav' is a WAV in the IMA ADPCM format, which cannot be played"
        ])
    })

    it('leaves MIDI Files to the DirectX player', () => {
        const { audio, notes } = setup()
        expect(audio.playFile('standard', audio.open(midi()))).toBe('Unplayable')
        expect(notes[0]).toContain('only the DirectX tasks play')
    })

    it('loops with control 1 until control 2 stops the current slot or control 3 stops it all', () => {
        const { audio, at } = setup()
        audio.loadSlot('standard', 1, audio.open(wav()))
        audio.loadSlot('standard', 2, audio.open(wav()))
        expect(audio.control('standard', 1, 1)).toBe('Done')
        at(60_000)
        expect(audio.playSlot('standard', 2)).toBe('Busy')
        //72 made slot 2 current even though it could not play, as EASy68K's playSoundMem does
        expect(audio.control('standard', 1, 2)).toBe('Missing')
        expect(audio.control('standard', 2, 2)).toBe('Done')
        expect(audio.playSlot('standard', 1)).toBe('Done')
        expect(audio.control('standard', 200, 3)).toBe('Done')
        expect(audio.playSlot('standard', 2)).toBe('Done')
    })
})

describe('reading Files', () => {
    it('reuses a Sound for the same array without comparing it, and keeps a copy of its own', () => {
        const { audio } = setup()
        const file = wav('beep.wav')
        const first = audio.open(file)!
        expect(first.bytes).not.toBe(file.bytes)
        expect(first.bytes).toEqual(file.bytes)
        //an array the FileSystem handed over again, which may have been changed since by an append
        //into its buffer, is still the same File
        expect(audio.open(file)).toBe(first)
    })

    it('reuses a Sound while its File holds the same bytes, so it decodes once', () => {
        const { audio } = setup()
        const first = audio.open(wav('beep.wav'))
        expect(audio.open(wav('beep.wav'))).toBe(first)
        const changed = audio.open(wav('beep.wav', 900))
        expect(changed).not.toBe(first)
        expect(changed?.data?.id).not.toBe(first?.data?.id)
        audio.reset()
        expect(audio.open(wav('beep.wav', 900))).not.toBe(changed)
    })
})

describe('the DirectX player', () => {
    it('mixes Sounds and MIDI Files', () => {
        const { audio, output } = setup()
        expect(audio.playFile('directx', audio.open(wav()))).toBe('Done')
        expect(audio.playFile('directx', audio.open(wav()))).toBe('Done')
        expect(audio.playFile('directx', audio.open(midi()))).toBe('Done')
        audio.flush()
        expect(started(output.commands)).toBe(3)
    })

    it('empties a slot when a load cannot play, and keeps it when the File is missing', () => {
        const { audio } = setup()
        audio.loadSlot('directx', 5, audio.open(wav()))
        expect(audio.loadSlot('directx', 5, undefined)).toBe('Missing')
        expect(audio.playSlot('directx', 5)).toBe('Done')
        const text = audio.open({ path: 'notes.txt', bytes: new TextEncoder().encode('hello') })
        expect(audio.loadSlot('directx', 5, text)).toBe('Unplayable')
        expect(audio.playSlot('directx', 5)).toBe('Missing')
    })

    it('stops one slot with control 2, and everything with control 3 even from an empty slot', () => {
        const { audio, output } = setup()
        audio.loadSlot('directx', 1, audio.open(wav()))
        audio.loadSlot('directx', 2, audio.open(wav()))
        audio.control('directx', 1, 1)
        audio.control('directx', 2, 1)
        audio.flush()
        expect(audio.control('directx', 1, 2)).toBe('Done')
        audio.flush()
        expect(stops(output.batches[1])).toBe(1)
        expect(audio.control('directx', 99, 3)).toBe('Missing')
        audio.flush()
        expect(stops(output.batches[2])).toBe(1)
        expect(audio.activity.playingForMs).toBe(0)
    })
})

describe('the cap', () => {
    it('keeps the newest 64, and never sends what it cut before a flush', () => {
        const { audio, output } = setup()
        for (let i = 0; i < MAX_SOUNDING + 6; i++) audio.playNote(marsNote(60, 1000, 0, 100))
        audio.flush()
        expect(started(output.commands)).toBe(MAX_SOUNDING)
        expect(stops(output.commands)).toBe(0)
    })

    it('cuts one-shots before loops', () => {
        const { audio, output } = setup()
        audio.loadSlot('directx', 0, audio.open(wav()))
        audio.control('directx', 0, 1)
        audio.flush()
        for (let i = 0; i < MAX_SOUNDING; i++) audio.playNote(marsNote(60, 1000, 0, 100))
        audio.flush()
        expect(stops(output.commands)).toBe(0)
        expect(audio.activity.playingForMs).toBe(Infinity)
    })

    it('plays at most 4 MIDI Files at once', () => {
        const { audio, output } = setup()
        for (let i = 0; i < MAX_MIDI_SOUNDING; i++) audio.playFile('directx', audio.open(midi()))
        audio.flush()
        audio.playFile('directx', audio.open(midi()))
        audio.flush()
        expect(stops(output.batches[1])).toBe(1)
    })

    it('never changes an answer: a standard Sound it cut is still busy', () => {
        const { audio } = setup()
        const sound = audio.open(wav('beep.wav', 5000))
        audio.playFile('standard', sound)
        for (let i = 0; i < MAX_SOUNDING; i++) audio.playNote(marsNote(60, 1000, 0, 100))
        expect(audio.playFile('standard', sound)).toBe('Busy')
    })
})

describe('silent, for a Testcase', () => {
    it('plays nothing, is never busy, and answers about Files and slots as ever', () => {
        const { audio, output } = setup({ silent: true })
        const sound = audio.open(wav('beep.wav', 5000))
        audio.playNote(marsNote(60, 1000, 0, 100))
        expect(audio.playFile('standard', sound)).toBe('Done')
        expect(audio.playFile('standard', sound)).toBe('Done')
        expect(audio.playFile('standard', undefined)).toBe('Missing')
        audio.loadSlot('standard', 0, sound)
        expect(audio.playSlot('standard', 0)).toBe('Done')
        expect(audio.prepare('note')).toBeNull()
        audio.flush()
        audio.reset()
        expect(output.batches).toEqual([])
        expect(audio.activity.soundsStarted).toBe(0)
    })
})

describe('Undo', () => {
    it('stops what an instruction started and puts its slots back', () => {
        const { audio, output, step } = setup()
        step(1, () => audio.playNote(marsNote(60, 5000, 0, 100)))
        step(2, () => audio.loadSlot('standard', 0, audio.open(wav())))
        audio.flush()
        audio.undoAfter(1)
        expect(audio.playSlot('standard', 0)).toBe('Missing')
        expect(stops(output.commands)).toBe(0)
        audio.undoAfter(0)
        expect(stops(output.commands)).toBe(1)
    })

    it('frees the standard player when the play is taken back', () => {
        const { audio, step } = setup()
        const sound = audio.open(wav('beep.wav', 5000))
        step(1, () => audio.playFile('standard', sound))
        expect(audio.playFile('standard', sound)).toBe('Busy')
        audio.undoAfter(0)
        expect(audio.playFile('standard', sound)).toBe('Done')
    })

    it('never starts a sound again when a stop is taken back', () => {
        const { audio, output, step } = setup()
        audio.loadSlot('directx', 0, audio.open(wav()))
        step(1, () => audio.control('directx', 0, 1))
        step(2, () => audio.control('directx', 0, 3))
        audio.flush()
        const before = started(output.commands)
        audio.undoAfter(1)
        expect(started(output.commands)).toBe(before)
    })

    it('runs what others recorded with an instruction', () => {
        const { audio, step } = setup()
        let register = 100
        step(1, () => {
            const previous = register
            audio.record(() => (register = previous))
            register = 7
        })
        audio.undoAfter(0)
        expect(register).toBe(100)
    })
})

describe('the end of a program and a reset', () => {
    it('stops loops at the end and lets one-shots play out', () => {
        const { audio, output } = setup()
        audio.loadSlot('directx', 0, audio.open(wav()))
        audio.control('directx', 0, 1)
        audio.playNote(marsNote(60, 3000, 0, 100))
        audio.flush()
        audio.stopLoops()
        expect(stops(output.batches[1])).toBe(1)
        expect(audio.activity.playingForMs).toBe(3000)
    })

    it('silences everything and empties every slot on reset', () => {
        const { audio, output } = setup()
        const sound = audio.open(wav('beep.wav', 5000))
        audio.loadSlot('standard', 0, sound)
        audio.playSlot('standard', 0)
        audio.reset()
        expect(output.batches.at(-1)).toEqual([{ type: 'stopAll' }])
        expect(audio.playSlot('standard', 0)).toBe('Missing')
        expect(audio.playFile('standard', sound)).toBe('Done')
    })
})

describe('loading', () => {
    it('holds the program while the output loads, then lets it go', async () => {
        const { audio, output } = setup()
        output.holdPrepare = true
        const wait = audio.prepare('note')
        expect(wait).not.toBeNull()
        expect(audio.activity.loading).toBe(true)
        output.settle()
        await wait
        expect(audio.activity.loading).toBe(false)
    })

    it('lets a held program go on a reset, as Stop and Build make, while the load goes on', async () => {
        const { audio, output } = setup()
        output.holdPrepare = true
        const wait = audio.prepare('note')!
        audio.reset()
        await wait
        expect(audio.activity.loading).toBe(false)
        //the load ending later changes nothing
        output.settle()
        await Promise.resolve()
        expect(audio.activity.loading).toBe(false)
    })

    it('goes on in silence after a failed load, noting it once', async () => {
        const { audio, output, notes } = setup()
        output.holdPrepare = true
        const wait = audio.prepare('note')
        output.settle(new Error('offline'))
        await wait
        expect(notes).toEqual(['Sounds could not be played: the sound bank did not load: offline'])
        expect(audio.prepare('note')).toBeNull()
    })

    it('asks nothing of the output for a File it cannot play', () => {
        const { audio, output } = setup()
        output.holdPrepare = true
        const text = audio.open({ path: 'a.txt', bytes: new Uint8Array([1, 2, 3]) })!
        expect(audio.prepare(text)).toBeNull()
        expect(output.prepared).toEqual([])
    })
})
