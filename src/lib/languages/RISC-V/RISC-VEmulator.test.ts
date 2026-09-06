import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import {
    MARS_INTERRUPT_ENABLE_BIT,
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_TRANSMITTER_CONTROL,
    MARS_TRANSMITTER_DATA
} from '$lib/languages/mars/MarsDevices'
import type { ProjectDisplay } from '$lib/languages/mars/marsDisplay'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'

/**
 * RARS's bitmap display and keyboard-and-display registers against the real Core under node, the
 * RISC-V half of `MIPSEmulator.test.ts`: the two tools are the same tool, so the two suites check
 * the same behaviour through the two Cores. Program time goes through the clock
 * ([ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
 */

const INSTRUCTION_LIMIT = 5_000_000

/** A small grid, so a test's full re-read is 16 words rather than 128 KB. */
const SMALL: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 64,
    height: 64,
    baseAddress: 0x10010000
}

type Emulator = ReturnType<typeof RISCVEmulator>

type Options = {
    display?: ProjectDisplay
    keyboard?: Keyboard
    /** Typed after the build: `compile` clears the Keyboard, as every Build does. */
    typed?: string
    /** A virtual clock, so an animated example's frame waits do not make the test sleep. */
    virtualClock?: boolean
    limit?: number
}

async function build(code: string, options: Options = {}) {
    const keyboard = options.keyboard ?? new Keyboard()
    const emulator = RISCVEmulator(code, {
        display: options.display ?? SMALL,
        peripherals: {
            keyboard,
            clock: options.virtualClock ? new ProgramClock({ mode: 'virtual' }) : undefined
        }
    })
    //the constructor starts a semantic check, and `_checkCode` assembles a throwaway Core whose
    //`assemble()` reallocates the backstep buffer that MARS keeps as a singleton. Draining it before
    //the build is what keeps the Undo test from racing it.
    await emulator.check()
    await emulator.compile(200, code)
    if (options.typed) keyboard.typeText(options.typed)
    return emulator
}

async function run(code: string, options: Options = {}) {
    const emulator = await build(code, options)
    await emulator.run(options.limit ?? INSTRUCTION_LIMIT)
    return emulator
}

function pixelAt(emulator: Emulator, x: number, y: number): number {
    const screen = emulator.peripherals.screen
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (
        ((pixels[offset] ?? 0) << 16) | ((pixels[offset + 1] ?? 0) << 8) | (pixels[offset + 2] ?? 0)
    )
}

/** A program body that stores `value` into the framebuffer word at `index`. */
function storePixel(index: number, value: string): string {
    return `        la      t0, display
        li      t1, ${value}
        sw      t1, ${index * 4}(t0)
`
}

const DATA = '        .data\ndisplay:.space  16384\n        .text\nmain:\n'
const EXIT = '        li      a7, 10\n        ecall\n'

describe('RISC-V bitmap display', () => {
    it('maps one word to one logical pixel, low 24 bits as the color', async () => {
        const emulator = await run(
            DATA + storePixel(0, '0x11223344') + storePixel(9, '0x00ff8000') + EXIT
        )
        expect(emulator.errors).toEqual([])
        //the grid is 64/8 by 64/8, so the ninth word is the second pixel of the second row
        expect(emulator.peripherals.screen.width).toBe(8)
        expect(emulator.peripherals.screen.height).toBe(8)
        expect(pixelAt(emulator, 0, 0)).toBe(0x223344)
        expect(pixelAt(emulator, 1, 1)).toBe(0xff8000)
    })

    it('re-reads the grid when the display configuration changes', async () => {
        const emulator = await run(DATA + storePixel(4, '0x00336699') + EXIT)
        //at 8 by 8 units the fifth word is the fifth pixel of the first row
        expect(pixelAt(emulator, 4, 0)).toBe(0x336699)
        emulator.setDisplay?.({ ...SMALL, unitWidth: 16, unitHeight: 16 })
        expect(emulator.peripherals.screen.width).toBe(4)
        //at 16 by 16 the same word is the first pixel of the second row, without re-running anything
        expect(pixelAt(emulator, 0, 1)).toBe(0x336699)
    })

    it('walks the image back with the code on Undo', async () => {
        const emulator = await run(DATA + storePixel(0, '0x00ffffff') + EXIT)
        expect(pixelAt(emulator, 0, 0)).toBe(0xffffff)
        //undone one instruction at a time, exactly as the Undo button does it
        for (let step = 0; step < 8 && pixelAt(emulator, 0, 0) !== 0; step++) emulator.undo(1)
        expect(pixelAt(emulator, 0, 0)).toBe(0x000000)
    })

    it('comes back blank in the configured geometry after Build and after Stop', async () => {
        const emulator = await run(DATA + storePixel(0, '0x00ffffff') + EXIT)
        expect(pixelAt(emulator, 0, 0)).toBe(0xffffff)
        //Stop is this editor's Clear execution: the picture goes, the user's geometry stays
        emulator.clear()
        expect(emulator.peripherals.screen.width).toBe(8)
        expect(emulator.peripherals.screen.height).toBe(8)
        expect(pixelAt(emulator, 0, 0)).toBe(0x000000)
    })

    it('starts from what the data segment already holds', async () => {
        const emulator = await build(
            '        .data\ndisplay:.word  0x00abcdef\n        .space 16380\n        .text\nmain:\n' +
                EXIT
        )
        expect(pixelAt(emulator, 0, 0)).toBe(0xabcdef)
    })
})

describe('RISC-V memory-mapped keyboard and display', () => {
    it('answers the receiver from the typed queue and clears Ready when it empties', async () => {
        const emulator = await run(
            DATA +
                `        li      s0, ${MARS_RECEIVER_CONTROL | 0}
        lw      t0, 0(s0)
        lw      t1, 4(s0)
        lw      t2, 0(s0)
        lw      t3, 4(s0)
        lw      t4, 0(s0)
` +
                EXIT,
            { typed: 'Hi' }
        )
        const registers = emulator.registers
        const valueOf = (name: string) => registers.find((r) => r.name === name)?.value
        expect(valueOf('t0')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('t1')).toBe(BigInt('H'.charCodeAt(0)))
        //still Ready, because the queue is not empty yet
        expect(valueOf('t2')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('t3')).toBe(BigInt('i'.charCodeAt(0)))
        expect(valueOf('t4')).toBe(0n)
    })

    it('keeps the transmitter Ready and prints what is stored in its data register', async () => {
        const emulator = await run(
            DATA +
                `        li      s0, ${MARS_TRANSMITTER_CONTROL | 0}
        lw      t0, 0(s0)
        li      t1, 0x4f
        sw      t1, 4(s0)
        li      t1, 0x4b
        sw      t1, 4(s0)
        lw      t2, 0(s0)
` +
                EXIT
        )
        expect(emulator.stdOut).toBe('OK')
        const valueOf = (name: string) => emulator.registers.find((r) => r.name === name)?.value
        expect(valueOf('t0')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('t2')).toBe(BigInt(MARS_READY_BIT))
    })

    it('clears the transcript on a form feed', async () => {
        const emulator = await run(
            DATA +
                `        li      s0, ${MARS_TRANSMITTER_DATA | 0}
        li      t1, 0x41
        sw      t1, 0(s0)
        li      t1, 12
        sw      t1, 0(s0)
        li      t1, 0x42
        sw      t1, 0(s0)
` +
                EXIT
        )
        expect(emulator.stdOut).toBe('B')
    })

    it('stops with an error naming the feature when a program enables interrupts', async () => {
        const emulator = await run(
            DATA +
                `        li      s0, ${MARS_RECEIVER_CONTROL | 0}
        li      t1, ${MARS_INTERRUPT_ENABLE_BIT}
        sw      t1, 0(s0)
` +
                EXIT
        )
        expect(emulator.errors.join('\n')).toContain('Interrupt-driven I/O is not supported')
        expect(emulator.errors.join('\n')).toContain('receiver control register')
    })

    it('does not consume pending input when the memory viewer reads the data register', async () => {
        const emulator = await build(
            DATA +
                `        li      s0, ${MARS_RECEIVER_CONTROL | 0}
        lw      t1, 4(s0)
` +
                EXIT,
            { typed: 'A' }
        )
        //the memory panel inspecting the register is not the program reading it
        expect(emulator.readMemoryBytes(BigInt(MARS_RECEIVER_DATA >>> 0), 4)[0]).toBe(
            'A'.charCodeAt(0)
        )
        expect(emulator.readMemoryBytes(BigInt(MARS_RECEIVER_CONTROL >>> 0), 4)[0]).toBe(
            MARS_READY_BIT
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.registers.find((r) => r.name === 't1')?.value).toBe(
            BigInt('A'.charCodeAt(0))
        )
    })
})

describe('RISC-V program time', () => {
    it('answers ecall 30 from the clock and sleeps through ecall 32', async () => {
        const emulator = await run(
            DATA +
                `        li      a7, 30
        ecall
        mv    s1, a0
        li      a7, 32
        li      a0, 40
        ecall
        li      a7, 30
        ecall
        sub     s2, a0, s1
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        const elapsed = emulator.registers.find((r) => r.name === 's2')?.value ?? 0n
        expect(elapsed).toBeGreaterThanOrEqual(30n)
    })

    it('completes a sleep immediately on a testcase virtual clock', async () => {
        const code =
            DATA +
            `        li      a7, 32
        li      a0, 5000
        ecall
        li      a7, 30
        ecall
        li      a7, 1
        ecall
` +
            EXIT
        const emulator = RISCVEmulator(code, { display: SMALL })
        const started = performance.now()
        const results = await emulator.test(
            code,
            [
                {
                    input: [],
                    expectedOutput: '5000',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT
        )
        //a scripted run gets a virtual clock, so five seconds of sleeping cost nothing (ADR 0010)
        expect(performance.now() - started).toBeLessThan(2000)
        expect(results[0]?.errors ?? []).toEqual([])
    })
})

describe('the RISC-V @screen directive', () => {
    const PROGRAM = `# @screen width=128 height=64 unit=1 base=grid
        .data
pad:    .space  32
grid:   .space  8192
        .text
main:
        li      a7, 10
        ecall
`

    it('configures the Screen from the source at Build, resolving the base label', async () => {
        const emulator = await build(PROGRAM)
        const configured = emulator.getDisplay?.()
        expect(configured?.origin).toBe('directive')
        expect(configured?.baseLabel).toBe('grid')
        //`pad` is 32 bytes, so `grid` is not where `.data` starts: this is the assembler's answer
        expect(configured?.display).toEqual({
            unitWidth: 1,
            unitHeight: 1,
            width: 128,
            height: 64,
            baseAddress: 0x10010020
        })
        expect(emulator.peripherals.screen.width).toBe(128)
        expect(emulator.peripherals.screen.height).toBe(64)
        expect(emulator.compilerDiagnostics).toEqual([])
    })

    it('draws where the resolved label points', async () => {
        const emulator = await run(
            PROGRAM.replace(
                '        li      a7, 10',
                `        la      t0, grid
        li      t1, 0x00123456
        sw      t1, 0(t0)
        li      a7, 10`
            )
        )
        expect(emulator.errors).toEqual([])
        expect(pixelAt(emulator, 0, 0)).toBe(0x123456)
    })

    it('leaves a program without a directive on the configuration it was given', async () => {
        const emulator = await build(DATA + EXIT)
        expect(emulator.getDisplay?.()).toMatchObject({ origin: 'user', display: SMALL })
        expect(emulator.peripherals.screen.width).toBe(8)
    })

    it('snaps a size MARS does not offer and still builds', async () => {
        const emulator = await build('# @screen width=300\n' + DATA + EXIT)
        expect(emulator.getDisplay?.()?.display.width).toBe(256)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.compilerDiagnostics.map((d) => d.severity)).toEqual(['warning'])
        expect(emulator.compilerDiagnostics[0]?.lineIndex).toBe(0)
    })

    it('keeps the base address and warns when the label does not exist', async () => {
        const emulator = await build('# @screen base=nowhere\n' + DATA + EXIT)
        expect(emulator.getDisplay?.()?.display.baseAddress).toBe(SMALL.baseAddress)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.compilerDiagnostics[0]?.message).toContain('No label named "nowhere"')
    })

    it('warns from the semantic check too, so the squiggle survives the check after a Build', async () => {
        const emulator = await build('# @screen base=nowhere\n' + DATA + EXIT)
        const diagnostics = await emulator.check()
        expect(diagnostics[0]?.severity).toBe('warning')
        expect(diagnostics[0]?.message).toContain('No label named "nowhere"')
        expect(emulator.compilerDiagnostics[0]?.message).toContain('No label named "nowhere"')
    })

    it('takes a base address the directive spells out', async () => {
        const emulator = await build('# @screen base=0x10008000\n' + DATA + EXIT)
        expect(emulator.getDisplay?.()?.display.baseAddress).toBe(0x10008000)
    })

    it('lets a hand edit win until the next Build reads the directive again', async () => {
        const emulator = await build(PROGRAM)
        emulator.setDisplay?.({ ...SMALL, width: 512 })
        expect(emulator.getDisplay?.()).toMatchObject({ origin: 'user' })
        expect(emulator.peripherals.screen.width).toBe(64)
        await emulator.compile(200, PROGRAM)
        expect(emulator.getDisplay?.()).toMatchObject({ origin: 'directive' })
        expect(emulator.peripherals.screen.width).toBe(128)
    })
})

describe('the RISC-V examples', () => {
    it('draws the bitmap tour', async () => {
        const code = readFileSync('examples/risc-v/bitmap-tour.s', 'utf8')
        //no display is passed: the example's own `@screen` comment is what configures the Screen
        const emulator = await run(code)
        expect(emulator.errors).toEqual([])
        expect(emulator.peripherals.screen.width).toBe(256)
        expect(emulator.peripherals.screen.height).toBe(256)
        //the blue square, the ramp and the white border
        expect(pixelAt(emulator, 128, 128)).toBe(0x0000ff)
        expect(pixelAt(emulator, 200, 40)).toBe(0xc82800)
        expect(pixelAt(emulator, 10, 0)).toBe(0xffffff)
        expect(pixelAt(emulator, 10, 255)).toBe(0xffffff)
    })

    it('animates the bouncing ball and lets program time pass', async () => {
        const code = readFileSync('examples/risc-v/bouncing-ball.s', 'utf8')
        const emulator = await run(code, { virtualClock: true, limit: 400_000 })
        expect(emulator.peripherals.screen.width).toBe(128)
        //the ball is somewhere on the background it painted. The run is cut off at its instruction
        //limit, which can land in the middle of the six by six square, so only its presence is
        //asserted; the whole square is what a flush at a `sleep` leaves behind
        expect(pixelAt(emulator, 0, 0)).toBe(0x101820)
        let ball = 0
        const pixels = emulator.peripherals.screen.visiblePixels
        for (let offset = 0; offset < pixels.length; offset += 4) {
            if (pixels[offset] === 0xff && pixels[offset + 1] === 0xcc) ball++
        }
        expect(ball).toBeGreaterThan(0)
        expect(ball).toBeLessThanOrEqual(36)
        //program time advanced through the frame waits, on a clock that started at zero
        expect(emulator.stdOut).toContain('ms of program time: ')
    })

    it('echoes typed characters through the keyboard and display example', async () => {
        const code = readFileSync('examples/risc-v/keyboard-display.s', 'utf8')
        const emulator = await run(code, { typed: 'abq' })
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut.endsWith('abq')).toBe(true)
        expect(pixelAt(emulator, 0, 0)).not.toBe(0)
        expect(pixelAt(emulator, 1, 0)).not.toBe(0)
    })
})
