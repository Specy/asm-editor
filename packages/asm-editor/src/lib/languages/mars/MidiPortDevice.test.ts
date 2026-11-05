import { describe, expect, it } from 'vite-plus/test'
import {
    MIDI_BYTE_MS,
    MIDI_PORT_BASE,
    MIDI_PORT_BUFFER_BYTES,
    MIDI_PORT_COMMAND,
    MIDI_PORT_DATA,
    MIDI_PORT_STATUS
} from '#lib/languages/midiPortRegisters.ts'
import { MidiPortDevice } from './MidiPortDevice'
import { soundRig } from './soundDeviceFakes'

const DATA = MIDI_PORT_BASE + MIDI_PORT_DATA
const STATUS = MIDI_PORT_BASE + MIDI_PORT_STATUS
const COMMAND = MIDI_PORT_BASE + MIDI_PORT_COMMAND

function setup(options: { virtual?: boolean; silent?: boolean; history?: number } = {}) {
    const rig = soundRig(options)
    const port = new MidiPortDevice(rig.host)
    port.connect(rig.bus)
    port.track(rig.position, options.history ?? 1000)
    const store = (address: number, value: number, length = 1) =>
        rig.store(address, value, length, (a, l, v) => port.stored(a, l, v, true))
    /** A memory-view Poke of one byte: the Core makes it as a store, but no program made it. */
    const poke = (address: number, value: number) =>
        rig.store(address, value, 1, (a, l, v) => port.stored(a, l, v, false))
    /** One instruction writing one byte to Data, as `sb` does. */
    const send = (...bytes: number[]) => {
        for (const byte of bytes) {
            rig.instruction()
            store(DATA, byte)
        }
    }
    /** The program reading Status, as `lw` does: the value memory held, then the observer. */
    const readStatus = () => {
        const value = rig.word(STATUS)
        port.statusRead()
        return value
    }
    return { ...rig, port, store, poke, send, readStatus }
}

/** When the `n`th byte queued on an idle line, counting from 1, has left. */
const left = (n: number) => n * MIDI_BYTE_MS

describe('the MIDI port line', () => {
    it('reads ready with bit 7 set, the port having no MIDI in', () => {
        const { word } = setup()
        expect(word(STATUS)).toBe(0x80)
        expect(word(DATA)).toBe(0)
    })

    it('hands each complete message on with the time its last byte leaves, at 31,250 baud', () => {
        const { send, midi } = setup()
        send(0xc0, 19, 0x90, 60, 100)
        expect(midi()).toEqual([
            { at: left(2), message: [0xc0, 19] },
            { at: left(5), message: [0x90, 60, 100] }
        ])
        expect(MIDI_BYTE_MS).toBeCloseTo(0.32, 12)
    })

    it('takes a byte from the low byte of a word store too, and Data reads 0 again', () => {
        const { store, midi, word, instruction } = setup()
        instruction()
        store(DATA, 0x00403c90, 4)
        expect(word(DATA)).toBe(0)
        instruction()
        store(DATA, 60, 4)
        instruction()
        store(DATA, 100, 4)
        expect(midi()).toEqual([{ at: left(3), message: [0x90, 60, 100] }])
    })

    it('starts the line again from the moment a byte is written to an idle port', () => {
        const { send, midi, at } = setup()
        at(100)
        send(0xc0, 5)
        expect(midi()).toEqual([{ at: 100 + left(2), message: [0xc0, 5] }])
    })

    it('expands running status into whole messages', () => {
        const { send, midi } = setup()
        send(0x90, 60, 100, 64, 100, 67, 0)
        expect(midi().map((m) => m.message)).toEqual([
            [0x90, 60, 100],
            [0x90, 64, 100],
            [0x90, 67, 0]
        ])
        expect(midi()[2].at).toBeCloseTo(left(7), 9)
    })

    it('sends a SysEx whole, from F0 to F7', () => {
        const { send, midi } = setup()
        send(0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7)
        expect(midi()).toEqual([{ at: left(6), message: [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7] }])
    })

    it('drops a SysEx longer than the encoder’s 256 bytes, and goes on', () => {
        const { send, midi } = setup()
        send(0xf0, ...new Array(300).fill(0x11), 0xf7)
        send(0x80, 60, 0)
        expect(midi().map((m) => m.message)).toEqual([[0x80, 60, 0]])
    })

    it('lets real-time bytes pass in the middle of a message, taking their time but sent to no one', () => {
        const { send, midi } = setup()
        send(0x90, 60, 0xf8, 100, 0xfe)
        expect(midi()).toEqual([{ at: left(4), message: [0x90, 60, 100] }])
    })

    it('ignores data bytes with no status before them, and system common messages', () => {
        const { send, midi } = setup()
        send(60, 100, 0xf6, 0xf3, 1)
        expect(midi()).toEqual([])
    })
})

describe('the busy bit', () => {
    it('is set once the 4 KiB buffer is full, and a byte written then is dropped and noted', () => {
        const { send, readStatus, port, notes, midi } = setup()
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) send(0xfe)
        expect(port.busy).toBe(true)
        expect(readStatus()).toBe(0xc0)
        send(0xc0, 1)
        expect(port.queued).toBe(MIDI_PORT_BUFFER_BYTES)
        expect(midi()).toEqual([])
        expect(notes).toEqual([expect.stringContaining('A MIDI byte was dropped')])
    })

    it('clears as the bytes leave in Program time, which the next read sees', () => {
        const { send, readStatus, at, port } = setup()
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) send(0xfe)
        at(left(1) - 0.01)
        readStatus()
        expect(readStatus()).toBe(0xc0)
        at(left(1))
        //the observer runs after the read: this read still sees busy, the next one does not
        expect(readStatus()).toBe(0xc0)
        expect(readStatus()).toBe(0x80)
        expect(port.queued).toBe(MIDI_PORT_BUFFER_BYTES - 1)
    })

    it('is brought up to date by a refresh, before a run call and after a wait', () => {
        const { send, port, word, at } = setup()
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) send(0xfe)
        expect(word(STATUS)).toBe(0xc0)
        at(5)
        port.refresh()
        expect(word(STATUS)).toBe(0x80)
    })

    it('is stated again over whatever a program stores at Status', () => {
        const { store, word, instruction } = setup()
        instruction()
        store(STATUS, 0x12345678, 4)
        expect(word(STATUS)).toBe(0x80)
    })
})

describe('the Command register', () => {
    it('resets on 0xFF: the buffer empties, what it held is cut, and the notes heard end', () => {
        const { send, store, at, port, midi, cuts, instruction } = setup()
        send(0x91, 60, 100)
        at(10)
        send(0x92, 64, 100)
        instruction()
        store(COMMAND, 0xff)
        expect(port.queued).toBe(0)
        expect(cuts()).toEqual([{ type: 'cut', after: 10, device: 'midi' }])
        //only the channel whose note had been heard: the other's was cut before it left
        expect(midi().slice(2)).toEqual([{ at: 10, message: [0xb1, 123, 0] }])
    })

    it('forgets running status at a reset', () => {
        const { send, store, midi, instruction, at } = setup()
        send(0x90, 60, 100)
        at(10)
        instruction()
        store(COMMAND, 0xff)
        send(62, 100)
        expect(midi().map((m) => m.message)).toEqual([
            [0x90, 60, 100],
            [0xb0, 123, 0]
        ])
    })

    it('accepts 0x3F, UART mode, and does nothing, as it does with any other command', () => {
        const { send, store, port, word, cuts, instruction } = setup()
        send(0x90, 60)
        for (const value of [0x3f, 0x01, 0xfe]) {
            instruction()
            store(COMMAND, value)
        }
        expect(port.queued).toBe(2)
        expect(word(STATUS)).toBe(0x80)
        expect(cuts()).toEqual([])
    })
})

describe('in a Testcase', () => {
    it('sends nothing, but keeps its timing on the virtual clock', () => {
        const { send, port, midi, at } = setup({ virtual: true, silent: true })
        send(0x90, 60, 100)
        expect(port.queued).toBe(3)
        at(left(2))
        port.refresh()
        expect(port.queued).toBe(1)
        expect(midi()).toEqual([])
    })

    it('moves the virtual clock to the next byte’s leaving when a full port is read, so polling never spins', () => {
        const { send, readStatus, clock, port } = setup({ virtual: true, silent: true })
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) send(0xfe)
        expect(clock.now()).toBe(0)
        expect(readStatus()).toBe(0xc0)
        expect(clock.now()).toBeCloseTo(left(1), 9)
        expect(readStatus()).toBe(0x80)
        //a program writing a thousand more bytes, waiting on busy before each, reads twice a byte
        let reads = 0
        for (let i = 0; i < 1000; i++) {
            while (readStatus() & 0x40) reads++
            send(0xfe)
        }
        expect(reads).toBe(999)
        expect(port.queued).toBe(MIDI_PORT_BUFFER_BYTES)
        expect(clock.now()).toBeCloseTo(left(1000), 6)
    })

    it('moves no clock when the port has room, nor interactively', () => {
        const busyInteractive = setup()
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) busyInteractive.send(0xfe)
        busyInteractive.readStatus()
        expect(busyInteractive.clock.now()).toBe(0)
        const roomy = setup({ virtual: true })
        roomy.send(0x90)
        roomy.readStatus()
        expect(roomy.clock.now()).toBe(0)
    })
})

describe('Undo', () => {
    it('takes back a byte that has not left, cutting what it would have played', () => {
        const { send, port, midi, cuts } = setup()
        send(0x90, 60, 100)
        expect(midi()).toHaveLength(1)
        port.undoAfter(2n)
        expect(port.queued).toBe(2)
        expect(cuts()).toEqual([{ type: 'cut', after: left(2), device: 'midi' }])
        //nothing to restore: none of it had reached the synthesizer
        expect(midi()).toHaveLength(1)
        //and the parser is back where it was: the next byte completes the note again
        send(90)
        expect(midi().at(-1)?.message).toEqual([0x90, 60, 90])
    })

    it('stops a note it started that is already heard, and never starts one it ended', () => {
        const { send, port, midi, at } = setup()
        send(0x90, 60, 100)
        at(50)
        send(0x90, 60, 0)
        at(100)
        //undoing the note-off: the note does not sound again
        port.undoAfter(5n)
        expect(midi()).toHaveLength(2)
        //undoing the note-on's velocity: the note it started ends at once
        port.undoAfter(2n)
        expect(midi().at(-1)).toEqual({ at: 100, message: [0x80, 60, 0] })
    })

    it('puts back a program, controllers and pitch bend once their messages were heard', () => {
        const { send, port, midi, at } = setup()
        send(0xc3, 40, 0xb3, 7, 30, 0xe3, 0, 0x50)
        at(20)
        port.undoAfter(0n)
        //newest first, each write's own: the bend, the volume, then the program
        expect(
            midi()
                .slice(3)
                .map((m) => m.message)
        ).toEqual([
            [0xe3, 0, 0x40],
            [0xb3, 7, 100],
            [0xc3, 0]
        ])
        expect(
            midi()
                .slice(3)
                .every((m) => m.at === 20)
        ).toBe(true)
    })

    it('puts back the bend range set through RPN 0, and master volume', () => {
        const { send, port, midi, at } = setup()
        send(0xb0, 101, 0, 100, 0, 6, 12)
        send(0xf0, 0x7f, 0x7f, 0x04, 0x01, 0, 0x20, 0xf7)
        at(30)
        port.undoAfter(0n)
        const restored = midi()
            .slice(4)
            .map((m) => m.message)
        //master volume first, the newest write's, then the bend range of two semitones, sent through
        //RPN 0 with the parameter the program had selected, and last the selection as it was
        expect(restored[0]).toEqual([0xf0, 0x7f, 0x7f, 0x04, 0x01, 0x7f, 0x7f, 0xf7])
        expect(restored.slice(1, 9)).toEqual([
            [0xb0, 101, 0],
            [0xb0, 100, 0],
            [0xb0, 6, 2],
            [0xb0, 38, 0],
            [0xb0, 99, 127],
            [0xb0, 98, 127],
            [0xb0, 101, 0],
            [0xb0, 100, 0]
        ])
        expect(restored.slice(-4)).toEqual([
            [0xb0, 99, 127],
            [0xb0, 98, 127],
            [0xb0, 101, 127],
            [0xb0, 100, 127]
        ])
    })

    it('takes a GM System On back to what the channels held before it', () => {
        const { send, port, midi, at } = setup()
        send(0xc0, 33)
        at(10)
        send(0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7)
        at(20)
        port.undoAfter(2n)
        expect(midi().at(-1)).toEqual({ at: 20, message: [0xc0, 33] })
    })

    it('restores nothing for a byte that was dropped, and leaves the port as it was', () => {
        const { send, port, cuts } = setup()
        for (let i = 0; i < MIDI_PORT_BUFFER_BYTES; i++) send(0xfe)
        send(0x90)
        port.undoAfter(BigInt(MIDI_PORT_BUFFER_BYTES))
        expect(port.queued).toBe(MIDI_PORT_BUFFER_BYTES)
        expect(cuts()).toEqual([])
    })

    it('journals nothing in a Build that keeps no history', () => {
        const { send, port, cuts } = setup({ history: 0 })
        send(0x90, 60, 100)
        port.undoAfter(0n)
        expect(port.queued).toBe(3)
        expect(cuts()).toEqual([])
    })
})

describe('covered by a bitmap display, and Pokes', () => {
    it('writes no word and hears no store while a display covers it, and states its block once uncovered', () => {
        const { port, store, word, midi } = setup()
        port.setCovered(true)
        store(STATUS, 0x00ff00, 4)
        store(DATA, 0x90, 1)
        port.statusRead()
        expect(word(STATUS)).toBe(0x00ff00)
        expect(port.queued).toBe(0)
        expect(midi()).toEqual([])
        port.setCovered(false)
        expect(word(STATUS)).toBe(0x80)
    })

    it('ignores a Poke, stating its words again over it', () => {
        const { port, poke, word } = setup()
        poke(DATA, 0x90)
        poke(COMMAND, 0xff)
        expect(port.queued).toBe(0)
        expect(word(STATUS)).toBe(0x80)
        expect(word(DATA)).toBe(0)
    })
})
