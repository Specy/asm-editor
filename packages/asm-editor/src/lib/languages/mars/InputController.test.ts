import { describe, expect, it } from 'vite-plus/test'
import { InputController } from '#lib/languages/mars/InputController.ts'
import {
    INPUT_BASE,
    INPUT_CONTROL,
    INPUT_EVENT,
    INPUT_ID,
    INPUT_ID_VALUE,
    INPUT_KEY_TABLE,
    INPUT_KEYS,
    INPUT_KIND_BUTTON_DOWN,
    INPUT_KIND_DROPPED,
    INPUT_KIND_KEY_DOWN,
    INPUT_KIND_KEY_REPEAT,
    INPUT_KIND_KEY_UP,
    INPUT_KIND_WHEEL,
    INPUT_POINTER,
    INPUT_QUEUE_DEPTH,
    INPUT_STATUS,
    INPUT_USAGE_BY_CODE,
    inputKeyName
} from '#lib/languages/inputControllerRegisters.ts'

/**
 * The Input controller against a fake bus: what a program would read from each register after each
 * host event, read and Undo ([the design record](../../../../../../docs/design/input-controller.md)).
 * The same rules end to end against the real Cores are in `MIPSEmulator.test.ts` and
 * `RISC-VEmulator.test.ts`.
 */

function makeController(options: { open?: boolean } = {}) {
    const memory = new Map<number, number>()
    let open = options.open ?? true
    let serial: bigint | null = 1n
    const controller = new InputController({ accepts: () => open })
    controller.connect({
        push: (address, value) => memory.set(address >>> 0, value | 0),
        readByte: (address) => {
            const word = memory.get(((address >>> 0) & ~3) >>> 0) ?? 0
            return (word >>> (((address >>> 0) & 3) * 8)) & 0xff
        }
    })
    controller.track(() => serial, 1000)
    const word = (offset: number) => memory.get((INPUT_BASE + offset) >>> 0) ?? 0
    return {
        controller,
        memory,
        word,
        setOpen: (value: boolean) => (open = value),
        /** The instruction running, by its serial; null between instructions. */
        at: (value: bigint | null) => (serial = value),
        /** The program reading the Event register: what it got, then the read is observed. */
        read: () => {
            const value = word(INPUT_EVENT)
            controller.eventRead()
            return value
        },
        /** A program store of `value` into the word at `offset`, observed after it landed. */
        store: (offset: number, value: number, fromProgram = true) => {
            memory.set((INPUT_BASE + offset) >>> 0, value)
            controller.stored(fromProgram)
        }
    }
}

const usage = (code: string) => INPUT_USAGE_BY_CODE[code]
const kind = (record: number) => (record >>> 8) & 7
const code = (record: number) => record & 0xff
const xOf = (record: number) => (record >>> 11) & 0x3ff
const yOf = (record: number) => (record >>> 21) & 0x3ff
const event = (k: number, c: number, x = 0, y = 0) => (y << 21) | (x << 11) | (k << 8) | c

describe('the Input controller registers', () => {
    it('states its ID, an empty queue, nothing held and the pointer at 0,0', () => {
        const { word } = makeController()
        expect(word(INPUT_ID) >>> 0).toBe(INPUT_ID_VALUE)
        expect(word(INPUT_CONTROL)).toBe(0)
        expect(word(INPUT_STATUS)).toBe(0)
        expect(word(INPUT_EVENT)).toBe(0)
        expect(word(INPUT_POINTER)).toBe(0)
        for (let offset = INPUT_KEYS; offset < 0x40; offset += 4) expect(word(offset)).toBe(0)
    })

    it('keeps bit 31 of every event and of the pointer at 0', () => {
        const { controller, word } = makeController()
        controller.pointerMoved(1023, 1023)
        controller.buttonDown('middle', 1023, 1023)
        controller.wheel(-8, 1023, 1023)
        expect(word(INPUT_POINTER)).toBeGreaterThan(0)
        for (const record of controller.pending) expect(record).toBeGreaterThan(0)
        expect(yOf(word(INPUT_POINTER))).toBe(1023)
        expect(xOf(word(INPUT_POINTER))).toBe(1023)
        expect(word(INPUT_POINTER) & 7).toBe(4)
    })
})

describe('the event queue', () => {
    it('gives events in order, the oldest in the Event register, each read taking one', () => {
        const { controller, word, read } = makeController()
        controller.keyDown('ArrowLeft')
        controller.keyUp('ArrowLeft')
        controller.buttonDown('left', 10, 20)
        expect(word(INPUT_STATUS)).toBe(3)
        expect(read()).toBe(event(INPUT_KIND_KEY_DOWN, 0x50))
        expect(word(INPUT_STATUS)).toBe(2)
        expect(read()).toBe(event(INPUT_KIND_KEY_UP, 0x50))
        expect(read()).toBe(event(INPUT_KIND_BUTTON_DOWN, 1, 10, 20))
        expect(word(INPUT_STATUS)).toBe(0)
        //an empty queue reads 0, and reading it takes nothing
        expect(read()).toBe(0)
        expect(read()).toBe(0)
    })

    it('stamps every event with the pointer, key events included', () => {
        const { controller, read } = makeController()
        controller.pointerMoved(7, 9)
        controller.keyDown('Space')
        const record = read()
        expect([kind(record), code(record), xOf(record), yOf(record)]).toEqual([
            INPUT_KIND_KEY_DOWN,
            0x2c,
            7,
            9
        ])
    })

    it('holds 64 events, then throws events away and says so before the next one that fits', () => {
        const { controller, word, read } = makeController()
        for (let i = 0; i < INPUT_QUEUE_DEPTH; i++) controller.wheel(i % 2 ? 1 : -1, 0, 0)
        expect(word(INPUT_STATUS)).toBe(64)
        expect(controller.eventsLost).toBe(false)
        //full: these two are lost, and nothing is queued for them yet
        controller.keyDown('KeyA')
        controller.keyUp('KeyA')
        expect(controller.eventsLost).toBe(true)
        expect(word(INPUT_STATUS)).toBe(64)
        //a read frees a slot, and queues nothing itself
        read()
        expect(word(INPUT_STATUS)).toBe(63)
        expect(controller.eventsLost).toBe(true)
        //the next event: the dropped record takes the free slot, and the event itself is lost too
        controller.keyDown('KeyB')
        expect(word(INPUT_STATUS)).toBe(64)
        expect(kind(controller.pending.at(-1)!)).toBe(INPUT_KIND_DROPPED)
        expect(controller.eventsLost).toBe(true)
        //two slots: the dropped record, then the event
        read()
        read()
        controller.keyUp('KeyB')
        expect(controller.pending.slice(-2).map(kind)).toEqual([
            INPUT_KIND_DROPPED,
            INPUT_KIND_KEY_UP
        ])
        expect(controller.eventsLost).toBe(false)
    })

    it('queues the dropped record when the next event arrives, not at the read that frees a slot', () => {
        const { controller, read } = makeController()
        for (let i = 0; i < INPUT_QUEUE_DEPTH + 1; i++) controller.keyDown(i % 2 ? 'KeyA' : 'KeyB')
        for (let i = 0; i < 10; i++) read()
        expect(controller.pending).toHaveLength(54)
        expect(controller.pending.map(kind)).not.toContain(INPUT_KIND_DROPPED)
        controller.keyDown('KeyC')
        expect(controller.pending.slice(-2).map(kind)).toEqual([
            INPUT_KIND_DROPPED,
            INPUT_KIND_KEY_DOWN
        ])
    })
})

describe('the wheel', () => {
    it('merges a turn into an unread wheel record of the same sign, at the latest position', () => {
        const { controller, read } = makeController()
        controller.wheel(1, 1, 1)
        controller.wheel(2, 5, 6)
        controller.wheel(3, 8, 9)
        expect(controller.pending).toEqual([event(INPUT_KIND_WHEEL, 6, 8, 9)])
        //the other way is another record, and so is a turn after a different event
        controller.wheel(-2, 8, 9)
        controller.keyDown('KeyA')
        controller.wheel(-1, 8, 9)
        expect(controller.pending.map(code)).toEqual([6, 0xfe, 0x04, 0xff])
        expect(read()).toBe(event(INPUT_KIND_WHEEL, 6, 8, 9))
    })

    it('starts a new record rather than pass ±127', () => {
        const { controller } = makeController()
        for (let i = 0; i < 16; i++) controller.wheel(8, 0, 0)
        controller.wheel(-8, 0, 0)
        for (let i = 0; i < 16; i++) controller.wheel(-8, 0, 0)
        //15 turns of 8 is 120; the 16th would be 128
        expect(controller.pending.map((record) => (code(record) << 24) >> 24)).toEqual([
            120, 8, -120, -16
        ])
    })

    it('states the Event register again when it merges into the oldest event', () => {
        const { controller, word } = makeController()
        controller.wheel(1, 0, 0)
        controller.wheel(1, 3, 4)
        expect(word(INPUT_EVENT)).toBe(event(INPUT_KIND_WHEEL, 2, 3, 4))
    })

    it('never merges into an event that Undo put back', () => {
        const { controller, read, at } = makeController()
        controller.wheel(1, 0, 0)
        at(5n)
        read()
        at(null)
        controller.undoAfter(4n)
        controller.wheel(1, 0, 0)
        expect(controller.pending.map(code)).toEqual([1, 1])
    })
})

describe('Undo', () => {
    it('puts back the events a read took, at the front and in their order', () => {
        const { controller, word, read, at } = makeController()
        controller.keyDown('KeyA')
        controller.keyDown('KeyB')
        controller.keyDown('KeyC')
        at(10n)
        const first = read()
        at(11n)
        const second = read()
        at(null)
        controller.keyDown('KeyD')
        //undo instruction 11, then 10
        controller.undoAfter(10n)
        expect(word(INPUT_EVENT)).toBe(second)
        controller.undoAfter(9n)
        expect(word(INPUT_EVENT)).toBe(first)
        expect(controller.pending.map(code)).toEqual([0x04, 0x05, 0x06, 0x07])
        expect(word(INPUT_STATUS)).toBe(4)
    })

    it('puts back more than 64, and the Status count follows them to 127', () => {
        const { controller, word, read, at } = makeController()
        let serial = 1n
        for (let i = 0; i < 200; i++) {
            controller.wheel(i % 2 ? 1 : -1, 0, 0)
            at(serial++)
            read()
            at(null)
        }
        controller.keyDown('KeyA')
        controller.undoAfter(0n)
        expect(controller.pending).toHaveLength(201)
        expect(word(INPUT_STATUS)).toBe(127)
        //the live event is behind the replayed ones, never thrown away for them
        expect(code(controller.pending.at(-1)!)).toBe(0x04)
    })

    it('leaves the key state and the pointer as they are now', () => {
        const { controller, word, read, at } = makeController()
        controller.keyDown('KeyA')
        at(3n)
        read()
        at(null)
        controller.keyUp('KeyA')
        controller.pointerMoved(30, 40)
        controller.undoAfter(2n)
        //the down event is back while the key is up: the two views disagree, as on x86
        expect(kind(word(INPUT_EVENT))).toBe(INPUT_KIND_KEY_DOWN)
        expect(controller.isKeyHeld(usage('KeyA'))).toBe(false)
        expect(word(INPUT_KEYS)).toBe(0)
        expect(xOf(word(INPUT_POINTER))).toBe(30)
    })

    it('states the whole block again after it, over anything a rewound store left', () => {
        const { controller, memory, word } = makeController()
        controller.keyDown('ArrowUp')
        for (let offset = 0; offset < 0x40; offset += 4)
            memory.set((INPUT_BASE + offset) >>> 0, 0x12345678)
        controller.undoAfter(0n)
        expect(word(INPUT_ID) >>> 0).toBe(INPUT_ID_VALUE)
        expect(word(INPUT_CONTROL)).toBe(0)
        expect(word(INPUT_STATUS)).toBe(1)
        expect(kind(word(INPUT_EVENT))).toBe(INPUT_KIND_KEY_DOWN)
        expect(word(INPUT_POINTER)).toBe(0)
        expect(word(0x14)).toBe(0)
        expect(word(INPUT_KEYS + 8)).toBe(1 << (0x52 - 64))
    })
})

describe('stores into the block', () => {
    it('are ignored, and the device states its values again', () => {
        const { controller, word, store } = makeController()
        controller.keyDown('KeyA')
        store(INPUT_STATUS, 99)
        store(INPUT_EVENT, 0)
        store(INPUT_KEYS, 0)
        store(INPUT_ID, 0)
        expect(word(INPUT_STATUS)).toBe(1)
        expect(kind(word(INPUT_EVENT))).toBe(INPUT_KIND_KEY_DOWN)
        expect(word(INPUT_KEYS)).toBe(1 << 4)
        expect(word(INPUT_ID) >>> 0).toBe(INPUT_ID_VALUE)
    })

    it('stop the program when one sets Control bit 1, and state Control 0 again', () => {
        const { word, store } = makeController()
        expect(() => store(INPUT_CONTROL, 0x2)).toThrow(
            /The Input controller does not raise interrupts/
        )
        expect(word(INPUT_CONTROL)).toBe(0)
        //other bits are ignored
        expect(() => store(INPUT_CONTROL, 0xfffffffd)).not.toThrow()
        expect(word(INPUT_CONTROL)).toBe(0)
    })

    it('never stop the program when a Poke sets Control bit 1', () => {
        const { word, store } = makeController()
        expect(() => store(INPUT_CONTROL, 0x2, false)).not.toThrow()
        expect(word(INPUT_CONTROL)).toBe(0)
    })
})

describe('coverage by the bitmap display', () => {
    it('writes nothing and takes nothing while covered, then states its block when uncovered', () => {
        const { controller, memory, word, read } = makeController()
        controller.keyDown('KeyA')
        controller.setCovered(true)
        //the display's pixels, which the device must not write
        for (let offset = 0; offset < 0x40; offset += 4)
            memory.set((INPUT_BASE + offset) >>> 0, 0x00ff00)
        controller.keyDown('KeyB')
        controller.pointerMoved(5, 5)
        expect(read()).toBe(0x00ff00)
        expect(word(INPUT_STATUS)).toBe(0x00ff00)
        expect(controller.pending).toHaveLength(2)
        controller.setCovered(false)
        expect(word(INPUT_ID) >>> 0).toBe(INPUT_ID_VALUE)
        expect(word(INPUT_STATUS)).toBe(2)
        expect(xOf(word(INPUT_POINTER))).toBe(5)
        expect(read()).toBe(event(INPUT_KIND_KEY_DOWN, 0x04))
    })
})

describe('the run gate', () => {
    it('hears nothing while the program does not take input', () => {
        const { controller, word, setOpen } = makeController({ open: false })
        controller.buttonDown('left', 3, 4)
        controller.keyDown('KeyA')
        controller.wheel(1, 3, 4)
        controller.pointerMoved(9, 9)
        expect(controller.pending).toEqual([])
        expect(word(INPUT_POINTER)).toBe(0)
        //a key held from before shows at its next repeat, as a key down
        setOpen(true)
        controller.keyDown('KeyA')
        expect(controller.pending.map(kind)).toEqual([INPUT_KIND_KEY_DOWN])
        //and the button held from before never comes up for the program
        controller.buttonUp('left', 3, 4)
        expect(controller.pending.map(kind)).toEqual([INPUT_KIND_KEY_DOWN])
    })

    it('starts empty after a reset, nothing held, the pointer at 0,0', () => {
        const { controller, word } = makeController()
        controller.keyDown('KeyA')
        controller.buttonDown('right', 8, 8)
        controller.reset()
        expect(controller.pending).toEqual([])
        expect(word(INPUT_STATUS)).toBe(0)
        expect(word(INPUT_POINTER)).toBe(0)
        expect(word(INPUT_KEYS)).toBe(0)
        expect(controller.eventsLost).toBe(false)
    })
})

describe('the key state and its edge rules', () => {
    it('maps physical keys to HID usages, left and right modifiers apart', () => {
        expect(usage('KeyA')).toBe(0x04)
        expect(usage('KeyZ')).toBe(0x1d)
        expect(usage('Digit1')).toBe(0x1e)
        expect(usage('Digit0')).toBe(0x27)
        expect(usage('Enter')).toBe(0x28)
        expect(usage('Escape')).toBe(0x29)
        expect(usage('Space')).toBe(0x2c)
        expect(usage('ArrowRight')).toBe(0x4f)
        expect(usage('ArrowUp')).toBe(0x52)
        expect(usage('Numpad1')).toBe(0x59)
        expect(usage('Numpad0')).toBe(0x62)
        expect(usage('F1')).toBe(0x3a)
        expect(usage('F24')).toBe(0x73)
        expect(usage('Backslash')).toBe(0x31)
        expect(usage('IntlBackslash')).toBe(0x64)
        expect([
            usage('ControlLeft'),
            usage('ShiftLeft'),
            usage('AltLeft'),
            usage('MetaLeft')
        ]).toEqual([0xe0, 0xe1, 0xe2, 0xe3])
        expect([
            usage('ControlRight'),
            usage('ShiftRight'),
            usage('AltRight'),
            usage('MetaRight')
        ]).toEqual([0xe4, 0xe5, 0xe6, 0xe7])
        expect([usage('OSLeft'), usage('OSRight')]).toEqual([0xe3, 0xe7])
        //the ISO key at 0x32 has no name of its own, and media keys and Fn have no usage here
        expect(Object.values(INPUT_USAGE_BY_CODE)).not.toContain(0x32)
        for (const name of ['AudioVolumeUp', 'MediaPlayPause', 'Fn', 'Unidentified', 'Power'])
            expect(usage(name)).toBeUndefined()
    })

    it('names each key once, and every usage fits a byte', () => {
        const names = INPUT_KEY_TABLE.filter((key) => !key.alias).map((key) =>
            inputKeyName(key.code)
        )
        expect(new Set(names).size).toBe(names.length)
        expect(names).toContain('A')
        expect(names).toContain('ARROW_LEFT')
        expect(names).toContain('SHIFT_LEFT')
        expect(names).toContain('DIGIT_1')
        expect(names).toContain('NUMPAD_1')
        expect(names).toContain('F12')
        expect(names).toContain('NUMPAD_PAREN_LEFT')
        for (const key of INPUT_KEY_TABLE) expect(key.usage).toBeLessThan(0x100)
        const usages = INPUT_KEY_TABLE.filter((key) => !key.alias).map((key) => key.usage)
        expect(new Set(usages).size).toBe(usages.length)
    })

    it('sets a key’s bit in the map, by byte and by word', () => {
        const { controller, word } = makeController()
        controller.keyDown('ShiftRight')
        //0xe5: bit 5 of byte 0x1c, bit 5 of word 7
        expect(word(INPUT_KEYS + 0x1c)).toBe(1 << 5)
        controller.keyDown('ArrowLeft')
        expect(word(INPUT_KEYS + 8)).toBe(1 << (0x50 & 31))
        controller.keyUp('ShiftRight')
        expect(word(INPUT_KEYS + 0x1c)).toBe(0)
    })

    it('ignores a key-up for a key that is not down', () => {
        const { controller } = makeController()
        controller.keyUp('PrintScreen')
        expect(controller.pending).toEqual([])
    })

    it('reports a key going down again while down as a repeat', () => {
        const { controller } = makeController()
        controller.keyDown('KeyW')
        controller.keyDown('KeyW')
        controller.keyDown('KeyW')
        controller.keyUp('KeyW')
        expect(controller.pending.map(kind)).toEqual([
            INPUT_KIND_KEY_DOWN,
            INPUT_KIND_KEY_REPEAT,
            INPUT_KIND_KEY_REPEAT,
            INPUT_KIND_KEY_UP
        ])
    })

    it('sends nothing for a key with no page-0x07 usage', () => {
        const { controller } = makeController()
        controller.keyDown('MediaPlayPause')
        controller.keyDown('Fn')
        controller.keyUp('Fn')
        expect(controller.pending).toEqual([])
    })
})
