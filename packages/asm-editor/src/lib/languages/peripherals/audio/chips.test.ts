import { describe, expect, it } from 'vite-plus/test'
import {
    SYNTH_CONTROL,
    SYNTH_FREQUENCY,
    SYNTH_UPLOAD_DESTINATION,
    SYNTH_UPLOAD_LENGTH,
    SYNTH_UPLOAD_SOURCE,
    SYNTH_UPLOAD_START,
    SYNTH_VOLUME,
    SYNTH_WAVETABLES
} from '../../synthRegisters'
import { Audio } from './Audio'
import { RecordingAudioOutput, type AudioCommand } from './AudioOutput'
import { compactSoundChipWrites } from './SoundChip'
import { compactSynthWrites, type SynthBus } from './Synth'

function setup(options: { silent?: boolean } = {}) {
    const output = new RecordingAudioOutput()
    const audio = new Audio({ output, silent: options.silent })
    let position: number | null = null
    audio.track(() => position, 100)
    return {
        audio,
        output,
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

/** A Target's memory: the Synth's block at 0x1000 and anything else a program stores. */
function memory(littleEndian: boolean) {
    const bytes = new Uint8Array(0x10000)
    const bus: SynthBus = {
        littleEndian,
        read: (address, length) => bytes.slice(address, address + length)
    }
    return { bytes, bus }
}

const synthWrites = (commands: AudioCommand[]) =>
    commands.flatMap((command) => (command.type === 'synth' ? command.writes : []))
const uploads = (commands: AudioCommand[]) =>
    commands.flatMap((command) => (command.type === 'synthUpload' ? [command] : []))

describe('Synth', () => {
    it('turns a store into register writes in the Target’s byte order', () => {
        for (const littleEndian of [true, false]) {
            const { audio, output } = setup()
            const { bus } = memory(littleEndian)
            //a word at channel 1's frequency, covering it and the pulse width
            audio.synth.store(0x20 + SYNTH_FREQUENCY, 4, 0x0800_01b8, bus)
            audio.flush()
            expect(synthWrites(output.commands)).toEqual(
                littleEndian ? [0x20, 0x01b8, 0x22, 0x0800] : [0x20, 0x0800, 0x22, 0x01b8]
            )
        }
    })

    it('decodes a byte stored into half of a register with the other half it already has', () => {
        const { audio, output } = setup()
        const { bus } = memory(false)
        audio.synth.store(SYNTH_FREQUENCY, 2, 0x01b8, bus)
        audio.synth.store(SYNTH_FREQUENCY + 1, 1, 0x00, bus)
        audio.flush()
        expect(synthWrites(output.commands)).toEqual([0, 0x01b8, 0, 0x0100])
    })

    it('ignores reserved bytes and the part of a store outside the block', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        audio.synth.store(0x14, 4, 0xffff_ffff, bus)
        audio.synth.store(-2, 4, 0x0000_ffff, bus)
        audio.synth.store(0x1fe, 4, 0xffff_ffff, bus)
        audio.flush()
        expect(synthWrites(output.commands)).toEqual([0, 0])
    })

    it('keeps a gate pulsed off and on within one flush, as one message', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.synth.store(SYNTH_CONTROL, 1, 0, bus)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.flush()
        expect(output.batches).toEqual([[{ type: 'synth', writes: [0x10, 1, 0x10, 0, 0x10, 1] }]])
    })

    it('counts a channel starting to sound, gate on and volume above 0, and plays while one does', () => {
        const { audio } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_VOLUME, 1, 100, bus)
        audio.synth.store(0x20 + SYNTH_VOLUME, 1, 100, bus)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.synth.store(0x20 + SYNTH_CONTROL, 1, 3, bus)
        expect(audio.activity.soundsStarted).toBe(2)
        expect(audio.activity.playingForMs).toBe(Infinity)
        audio.synth.store(SYNTH_CONTROL, 1, 0, bus)
        audio.synth.store(0x20 + SYNTH_CONTROL, 1, 0, bus)
        expect(audio.activity.playingForMs).toBe(0)
    })

    it('counts a gated channel at volume 0 only once its volume rises, as a game that keeps its gates on does', () => {
        const { audio } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        expect(audio.activity.soundsStarted).toBe(0)
        expect(audio.activity.playingForMs).toBe(0)
        audio.synth.store(SYNTH_VOLUME, 1, 64, bus)
        audio.synth.store(SYNTH_VOLUME, 1, 32, bus)
        expect(audio.activity.soundsStarted).toBe(1)
        expect(audio.activity.playingForMs).toBe(Infinity)
        audio.synth.store(SYNTH_VOLUME, 1, 0, bus)
        expect(audio.activity.playingForMs).toBe(0)
    })

    it('copies an upload the moment its start register is written', () => {
        const { audio, output } = setup()
        const { bytes, bus } = memory(true)
        bytes.set([1, 2, 3, 4], 0x4000)
        audio.synth.store(SYNTH_UPLOAD_SOURCE, 4, 0x4000, bus)
        audio.synth.store(SYNTH_UPLOAD_LENGTH, 2, 4, bus)
        audio.synth.store(SYNTH_UPLOAD_DESTINATION, 2, 0xfffe, bus)
        audio.synth.store(SYNTH_UPLOAD_START, 1, 0, bus)
        //the program reuses its buffer straight away
        bytes.set([9, 9, 9, 9], 0x4000)
        audio.flush()
        expect(uploads(output.commands)).toEqual([
            { type: 'synthUpload', offset: 0xfffe, bytes: Uint8Array.from([1, 2, 3, 4]) }
        ])
        //the upload registers are not the chip's
        expect(synthWrites(output.commands)).toEqual([])
    })

    it('takes an upload back on Undo, with the bytes it overwrote', () => {
        const { audio, output, step } = setup()
        const { bytes, bus } = memory(false)
        bytes.set([1, 2], 0x4000)
        bytes.set([7, 8], 0x5000)
        audio.synth.store(SYNTH_UPLOAD_SOURCE, 4, 0x4000, bus)
        audio.synth.store(SYNTH_UPLOAD_LENGTH, 2, 2, bus)
        step(1, () => audio.synth.store(SYNTH_UPLOAD_START, 1, 1, bus))
        audio.synth.store(SYNTH_UPLOAD_SOURCE, 4, 0x5000, bus)
        step(2, () => audio.synth.store(SYNTH_UPLOAD_START, 1, 1, bus))
        audio.flush()
        output.batches.length = 0

        audio.undoAfter(1)
        expect(uploads(output.commands)).toEqual([
            { type: 'synthUpload', offset: 0, bytes: Uint8Array.from([1, 2]) }
        ])
        audio.undoAfter(0)
        expect(uploads(output.commands).at(-1)).toEqual({
            type: 'synthUpload',
            offset: 0,
            bytes: Uint8Array.from([0, 0])
        })
    })

    it('plays its rewound registers after an Undo, a gate turned back on included', () => {
        const { audio, output, step } = setup()
        const { bus } = memory(true)
        const block = new Uint8Array(0x200)
        audio.synth.store(SYNTH_VOLUME, 1, 100, bus)
        step(1, () => audio.synth.store(SYNTH_CONTROL, 1, 1, bus))
        step(2, () => audio.synth.store(SYNTH_CONTROL, 1, 0, bus))
        audio.flush()
        output.batches.length = 0
        //what the Core's memory holds once it has rewound instruction 2
        block[SYNTH_VOLUME] = 100
        block[SYNTH_CONTROL] = 1
        audio.undoAfter(1, () => block)
        //only what the Undo changed: the gate, back on
        expect(synthWrites(output.commands)).toEqual([SYNTH_CONTROL, 1])
        expect(audio.activity.playingForMs).toBe(Infinity)
    })

    it('sends nothing on an Undo that left its registers alone', () => {
        const { audio, output, step } = setup()
        const { bus } = memory(true)
        const block = new Uint8Array(0x200)
        step(1, () => audio.synth.store(SYNTH_VOLUME, 1, 100, bus))
        block[SYNTH_VOLUME] = 100
        audio.flush()
        output.batches.length = 0
        audio.undoAfter(1, () => block)
        expect(output.commands).toEqual([])
    })

    it('sends every register on an Undo after the program’s end released the chip', () => {
        const { audio, output, step } = setup()
        const { bus } = memory(true)
        const block = new Uint8Array(0x200)
        step(1, () => audio.synth.store(SYNTH_VOLUME, 1, 100, bus))
        step(2, () => audio.synth.store(SYNTH_CONTROL, 1, 1, bus))
        block[SYNTH_VOLUME] = 100
        block[SYNTH_CONTROL] = 1
        audio.stopLoops()
        output.batches.length = 0
        audio.undoAfter(2, () => block)
        const writes = synthWrites(output.commands)
        expect(writes).toContain(SYNTH_WAVETABLES + 0x7f)
        expect(writes[writes.indexOf(SYNTH_CONTROL) + 1]).toBe(1)
    })

    it('plays a Poke into its registers, and starts no upload from one', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_UPLOAD_LENGTH, 2, 4, bus)
        audio.synth.poking = true
        audio.synth.store(SYNTH_FREQUENCY, 2, 440, bus)
        audio.synth.store(SYNTH_UPLOAD_START, 1, 1, bus)
        audio.synth.poking = false
        audio.flush()
        expect(uploads(output.commands)).toEqual([])
        expect(synthWrites(output.commands)).toEqual([SYNTH_FREQUENCY, 440])
    })

    it('releases a gate at volume 0 at the program’s end too, which is not heard but runs', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.stopLoops()
        expect(output.commands.at(-1)).toEqual({ type: 'releaseChips' })
    })

    it('folds a batch of a tight loop of stores to what its last ones left', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        for (let i = 0; i < 100_000; i++) {
            audio.synth.store(SYNTH_FREQUENCY, 2, i & 0xffff, bus)
            audio.synth.store(SYNTH_CONTROL, 1, i & 1, bus)
        }
        audio.flush()
        const writes = synthWrites(output.commands)
        expect(writes.length).toBeLessThanOrEqual(16_384 + 4)
        //the last frequency, and the gate's last edge
        const frequencies = writes.filter((value, i) => i % 2 === 1 && writes[i - 1] === 0)
        expect(frequencies.at(-1)).toBe(99_999 & 0xffff)
        const gates = writes.filter((value, i) => i % 2 === 1 && writes[i - 1] === SYNTH_CONTROL)
        expect(gates.at(-1)).toBe(1)
    })

    it('reads nothing back on Undo when the program never used it', () => {
        const { audio, output } = setup()
        let read = false
        audio.undoAfter(0, () => {
            read = true
            return new Uint8Array(0x200)
        })
        expect(read).toBe(false)
        expect(output.commands).toEqual([])
    })

    it('releases its gates at the program’s end in the output only, and Undo plays on', () => {
        const { audio, output, step } = setup()
        const { bus } = memory(true)
        step(1, () => audio.synth.store(SYNTH_VOLUME, 1, 100, bus))
        step(2, () => audio.synth.store(SYNTH_CONTROL, 1, 1, bus))
        audio.stopLoops()
        expect(output.commands.at(-1)).toEqual({ type: 'releaseChips' })
        expect(audio.activity.playingForMs).toBe(0)

        const block = new Uint8Array(0x200)
        block[SYNTH_VOLUME] = 100
        block[SYNTH_CONTROL] = 1
        audio.undoAfter(2, () => block)
        expect(audio.activity.playingForMs).toBe(Infinity)
    })

    it('sends nothing in a Testcase', () => {
        const { audio, output } = setup({ silent: true })
        const { bus } = memory(true)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.synth.store(SYNTH_UPLOAD_START, 1, 1, bus)
        audio.stopLoops()
        audio.flush()
        expect(output.commands).toEqual([])
        expect(audio.activity.soundsStarted).toBe(0)
    })

    it('starts from zero after a reset', () => {
        const { audio, output } = setup()
        const { bus } = memory(true)
        audio.synth.store(SYNTH_CONTROL, 1, 1, bus)
        audio.reset()
        expect(audio.activity.playingForMs).toBe(0)
        expect(audio.synth.inUse).toBe(false)
        expect(output.commands.at(-1)).toEqual({ type: 'stopAll' })
    })
})

describe('compactSynthWrites', () => {
    it('keeps the last value of every register and the gate’s first and last writes', () => {
        //in the order of their last writes, which one instant does not tell apart
        expect(compactSynthWrites([0, 100, 0x12, 50, 0, 200, 0x10, 1, 0x10, 1])).toEqual([
            0x12, 50, 0, 200, 0x10, 1
        ])
    })

    it('keeps one strike for a gate that went off and on after its first write', () => {
        //on, off, on, off, on: the note is struck again and stays on
        expect(compactSynthWrites([0x10, 1, 0x10, 0, 0x10, 1, 0x10, 0, 0x10, 1])).toEqual([
            0x10, 1, 0x10, 0, 0x10, 1
        ])
        //on, off, on, off: struck again, then released
        expect(compactSynthWrites([0x10, 1, 0x10, 0, 0x10, 1, 0x10, 0])).toEqual([
            0x10, 1, 0x10, 0, 0x10, 1, 0x10, 0
        ])
        //the loop bit kept with the gate
        expect(compactSynthWrites([0x30, 3, 0x30, 2, 0x30, 3])).toEqual([0x30, 3, 0x30, 2, 0x30, 3])
    })
})

describe('compactSoundChipWrites', () => {
    it('keeps the last value of every register, and the envelope shape last, once', () => {
        expect(compactSoundChipWrites([13, 0, 0, 10, 8, 15, 0, 20, 13, 4, 8, 12])).toEqual([
            0, 20, 8, 12, 13, 4
        ])
    })
})

describe('SoundChip', () => {
    const write = (audio: Audio, register: number, value: number) => {
        audio.soundChip.select(register)
        audio.soundChip.write(value)
    }

    it('reads back what was written, keeping each register’s own bits', () => {
        const { audio } = setup()
        write(audio, 1, 0xff)
        write(audio, 8, 0xff)
        write(audio, 7, 0xb8)
        audio.soundChip.select(1)
        expect(audio.soundChip.read()).toBe(0x0f)
        audio.soundChip.select(8)
        expect(audio.soundChip.read()).toBe(0x1f)
        audio.soundChip.select(7)
        expect(audio.soundChip.read()).toBe(0xb8)
    })

    it('reads 0xFF from the I/O ports and past register 15, and ignores writes there', () => {
        const { audio, output } = setup()
        for (const register of [14, 15, 16, 0xff]) {
            write(audio, register, 0x12)
            expect(audio.soundChip.read()).toBe(0xff)
        }
        audio.flush()
        expect(output.commands).toEqual([])
    })

    it('sends every write in order, the same envelope shape again included', () => {
        const { audio, output } = setup()
        write(audio, 0, 254)
        write(audio, 13, 0)
        write(audio, 13, 0)
        audio.flush()
        expect(output.batches).toEqual([[{ type: 'soundChip', writes: [0, 254, 13, 0, 13, 0] }]])
    })

    it('tells the chip nothing on an Undo that put no register back', () => {
        const { audio, output, step } = setup()
        step(1, () => write(audio, 8, 15))
        step(2, () => audio.soundChip.select(2))
        audio.flush()
        output.batches.length = 0
        audio.undoAfter(1)
        expect(output.commands).toEqual([])
    })

    it('puts registers and the selection back on Undo, and the chip plays from them', () => {
        const { audio, output, step } = setup()
        step(1, () => write(audio, 8, 15))
        step(2, () => write(audio, 8, 3))
        step(3, () => audio.soundChip.select(2))
        audio.flush()
        output.batches.length = 0
        audio.undoAfter(1)
        expect(audio.soundChip.read()).toBe(15)
        expect(output.commands).toEqual([
            {
                type: 'soundChipLoad',
                registers: [0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0, 0, 0]
            }
        ])
    })

    it('keeps its registers in a Testcase, sending nothing', () => {
        const { audio, output } = setup({ silent: true })
        write(audio, 3, 0x0a)
        expect(audio.soundChip.read()).toBe(0x0a)
        audio.flush()
        expect(output.commands).toEqual([])
    })

    it('silences its volumes at the program’s end, and plays while one is set', () => {
        const { audio, output } = setup()
        write(audio, 9, 12)
        expect(audio.activity.soundsStarted).toBe(1)
        expect(audio.activity.playingForMs).toBe(Infinity)
        audio.stopLoops()
        expect(output.commands.at(-1)).toEqual({ type: 'releaseChips' })
        audio.soundChip.select(9)
        expect(audio.soundChip.read()).toBe(12)
        expect(audio.activity.playingForMs).toBe(0)
    })
})
