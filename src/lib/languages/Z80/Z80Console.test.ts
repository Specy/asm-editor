import { describe, expect, it } from 'vitest'
import { Z80_PORTS } from '$lib/languages/Z80/Z80-model'
import {
    INVALID_HEX_NUMBER_ERROR,
    INVALID_NUMBER_ERROR,
    Z80_UNCONNECTED_PORT_VALUE,
    Z80Console
} from '$lib/languages/Z80/Z80Console'

/** A console plus the text it printed, since every write goes through the writer the adapter passes. */
function makeConsole() {
    let output = ''
    const console = new Z80Console((text) => {
        output += text
    })
    return {
        console,
        get output() {
            return output
        }
    }
}

/** The bus address an `out (c),r` drives: B on the high byte, the port number on the low one. */
function busAddress(port: number, high = 0): number {
    return (high << 8) | port
}

describe('Z80Console port decoding', () => {
    it('names the console ports and only looks at the low byte of the bus address', () => {
        expect(Z80Console.portNameOf(Z80_PORTS.CHAR)).toBe('CHAR')
        expect(Z80Console.portNameOf(busAddress(Z80_PORTS.WORD, 0x12))).toBe('WORD')
        expect(Z80Console.portNameOf(0x40)).toBeUndefined()
    })

    it('reads an empty bus and drops writes on ports with nothing attached', () => {
        const { console, output } = makeConsole()
        expect(console.readPort(0x40)).toBe(Z80_UNCONNECTED_PORT_VALUE)
        console.writePort(0x40, 0x41)
        expect(output).toBe('')
    })
})

describe('Z80Console output', () => {
    it('prints one Latin-1 character per byte', () => {
        const device = makeConsole()
        for (const byte of [0x48, 0x69, 0x0a]) device.console.writePort(Z80_PORTS.CHAR, byte)
        expect(device.output).toBe('Hi\n')
    })

    it('prints unsigned, signed and hexadecimal bytes', () => {
        const device = makeConsole()
        device.console.writePort(Z80_PORTS.NUMBER, 200)
        device.console.writePort(Z80_PORTS.SIGNED, 200)
        device.console.writePort(Z80_PORTS.HEX, 200)
        expect(device.output).toBe('200-56C8')
    })

    it('pads a hexadecimal byte to two digits', () => {
        const device = makeConsole()
        device.console.writePort(Z80_PORTS.HEX, 0x0a)
        expect(device.output).toBe('0A')
    })

    it('takes the high byte of a 16 bit value from the address bus', () => {
        const device = makeConsole()
        //`ld b,h` / `ld c,4` / `out (c),l` with HL = 1000
        device.console.writePort(busAddress(Z80_PORTS.WORD, 1000 >> 8), 1000 & 0xff)
        expect(device.output).toBe('1000')
    })

    it('keeps only the low byte of a written value, like the 8 bit bus does', () => {
        const device = makeConsole()
        device.console.writePort(Z80_PORTS.NUMBER, 0x1ff)
        expect(device.output).toBe('255')
    })
})

describe('Z80Console character input', () => {
    it('asks for a line and hands it out one byte at a time, ending with a newline', () => {
        const { console } = makeConsole()
        expect(console.readPort(Z80_PORTS.CHAR)).toBeUndefined()
        console.provideInput(Z80_PORTS.CHAR, 'ab')
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x61)
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x62)
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x0a)
        expect(console.readPort(Z80_PORTS.CHAR)).toBeUndefined()
    })

    it('replaces a character that does not fit in a byte with a question mark', () => {
        const { console } = makeConsole()
        console.provideInput(Z80_PORTS.CHAR, 'é☃')
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0xe9)
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x3f)
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x0a)
    })

    it('answers an empty line with just the newline', () => {
        const { console } = makeConsole()
        console.provideInput(Z80_PORTS.CHAR, '')
        expect(console.readPort(Z80_PORTS.CHAR)).toBe(0x0a)
    })
})

describe('Z80Console numeric input', () => {
    it('parses a decimal line for the number port and serves it to the re-executed read', () => {
        const { console } = makeConsole()
        expect(console.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
        console.provideInput(Z80_PORTS.NUMBER, ' 21 ')
        expect(console.readPort(Z80_PORTS.NUMBER)).toBe(21)
        //one line answers one `in`: the next read pauses again
        expect(console.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
    })

    it('accepts a negative line and returns its low byte', () => {
        const { console } = makeConsole()
        console.provideInput(Z80_PORTS.SIGNED, '-5')
        expect(console.readPort(Z80_PORTS.SIGNED)).toBe(0xfb)
    })

    it('truncates a value too large for the 8 bit bus instead of rejecting it', () => {
        const { console } = makeConsole()
        console.provideInput(Z80_PORTS.NUMBER, '300')
        expect(console.readPort(Z80_PORTS.NUMBER)).toBe(300 & 0xff)
    })

    it('parses the accepted hexadecimal spellings', () => {
        for (const line of ['ff', '0xFF', '$ff', '0FFh']) {
            const { console } = makeConsole()
            console.provideInput(Z80_PORTS.HEX, line)
            expect(console.readPort(Z80_PORTS.HEX)).toBe(0xff)
        }
    })

    it('stops the program with an error when a line does not parse', () => {
        const { console } = makeConsole()
        expect(() => console.provideInput(Z80_PORTS.NUMBER, 'twelve')).toThrow(INVALID_NUMBER_ERROR)
        expect(() => console.provideInput(Z80_PORTS.HEX, 'zz')).toThrow(INVALID_HEX_NUMBER_ERROR)
    })

    it('reads every numeric port from the same pending answer', () => {
        const { console } = makeConsole()
        console.provideInput(busAddress(Z80_PORTS.WORD, 0x12), '7')
        expect(console.readPort(Z80_PORTS.WORD)).toBe(7)
    })
})

describe('Z80Console prompts and reset', () => {
    it('asks the question that matches the port an `in` is waiting on', () => {
        const { console } = makeConsole()
        expect(console.inputQuestion(Z80_PORTS.CHAR)).toMatch(/line of text/i)
        expect(console.inputQuestion(Z80_PORTS.HEX)).toMatch(/hexadecimal/i)
        expect(console.inputQuestion(Z80_PORTS.NUMBER)).toMatch(/number/i)
    })

    it('drops buffered input when the machine is restarted', () => {
        const { console } = makeConsole()
        console.provideInput(Z80_PORTS.CHAR, 'ab')
        console.provideInput(Z80_PORTS.NUMBER, '7')
        console.reset()
        expect(console.readPort(Z80_PORTS.CHAR)).toBeUndefined()
        expect(console.readPort(Z80_PORTS.NUMBER)).toBeUndefined()
    })
})
