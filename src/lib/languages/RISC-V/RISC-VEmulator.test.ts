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
import type { Testcase } from '$lib/Project.svelte'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { ProgramClock } from '$lib/languages/peripherals/ProgramClock'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { FileSystem } from '$lib/languages/peripherals/FileSystem'

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
    fileSystem?: FileSystem
}

async function build(code: string, options: Options = {}) {
    const keyboard = options.keyboard ?? new Keyboard()
    const emulator = RISCVEmulator(code, {
        display: options.display ?? SMALL,
        peripherals: {
            keyboard,
            clock: options.virtualClock ? new ProgramClock({ mode: 'virtual' }) : undefined,
            fileSystem: options.fileSystem
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
/** A Testcase with nothing to check: the run itself is the point, and it must draw on the same grid. */
const SCREEN_TESTCASE: Testcase = {
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

const EXIT = '        li      a7, 10\n        ecall\n'

describe('RISC-V FileSystem', () => {
    const WRITE_FILE = `
        .data
path:   .asciz "output.txt"
payload:.asciz "hello"
        .text
main:
        li      a7, 1024
        la      a0, path
        li      a1, 1
        ecall
        mv      s0, a0
        li      a7, 64
        mv      a0, s0
        la      a1, payload
        li      a2, 5
        ecall
        mv      a0, s0
        li      a7, 57
        ecall
${EXIT}`

    it('persists guest bytes, keeps the host locked through exit, and undoes the write', async () => {
        const fileSystem = new FileSystem()
        const emulator = await run(WRITE_FILE, { fileSystem })
        expect(emulator.errors).toEqual([])
        expect(fileSystem.readText('output.txt')).toBe('hello')
        expect(fileSystem.locked).toBe(true)

        for (let count = 0; count < 12 && fileSystem.readText('output.txt') === 'hello'; count++) {
            emulator.undo(1)
        }
        expect(fileSystem.readText('output.txt')).toBe('')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(fileSystem.readText('output.txt')).toBe('hello')
        emulator.clear()
        expect(fileSystem.locked).toBe(false)
    })

    it('keeps generated Files when Stop ends the session', async () => {
        const fileSystem = new FileSystem()
        const emulator = await run(WRITE_FILE, { fileSystem })
        emulator.clear()
        expect(fileSystem.locked).toBe(false)
        expect(fileSystem.readText('output.txt')).toBe('hello')
    })

    it('lets a guest read exact bytes from a Project File', async () => {
        const fileSystem = new FileSystem({
            'input.txt': { encoding: 'plain', content: 'hello' }
        })
        const emulator = await run(
            `
        .data
path:   .asciz "input.txt"
buffer: .space  5
        .text
main:
        li      a7, 1024
        la      a0, path
        li      a1, 0
        ecall
        mv      s0, a0
        li      a7, 63
        mv      a0, s0
        la      a1, buffer
        li      a2, 5
        ecall
        lbu     s1, 1(a1)
        mv      a0, s0
        li      a7, 57
        ecall
${EXIT}`,
            { fileSystem }
        )
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === 's1')?.value).toBe(101n)
    })
})

describe('RISC-V source set', () => {
    it('assembles included Files and retains their source identity', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "lib.s"\n' },
                'lib.s': {
                    encoding: 'plain' as const,
                    content: '.text\nmain:\nli s0, 7\nli a7, 10\necall\n'
                }
            }
        }
        const emulator = RISCVEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === 's0')?.value).toBe(7n)
        expect(emulator.currentFile).toBe('lib.s')
        expect(emulator.buildArtifacts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ file: 'lib.s', line: 2, opcode: '00700413' })
            ])
        )
    })

    it('warns on an included @screen directive without applying it', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "lib.s"\n' },
                'lib.s': {
                    encoding: 'plain' as const,
                    content: '# @screen width=128\n.text\nmain:\nli a7, 10\necall\n'
                },
                'unused.s': {
                    encoding: 'plain' as const,
                    content: '# @screen width=256\n'
                }
            }
        }
        const emulator = RISCVEmulator(sources, { display: SMALL })
        await emulator.check()
        await emulator.compile(20, sources)
        expect(emulator.getDisplay?.()?.display.width).toBe(SMALL.width)
        expect(emulator.compilerDiagnostics).toMatchObject([
            { severity: 'warning', file: 'lib.s', lineIndex: 0 }
        ])
        expect(emulator.compilerDiagnostics[0]?.message).toContain('only the Entry file main.s')
        expect(
            emulator.compilerDiagnostics.some((diagnostic) => diagnostic.file === 'unused.s')
        ).toBe(false)
    })

    it('keeps every repeated-include instruction and address in its inline expansion', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': {
                    encoding: 'plain' as const,
                    content: '.text\nmain:\n.include "increment.s"\n.include "increment.s"\n' + EXIT
                },
                'increment.s': {
                    encoding: 'plain' as const,
                    content: 'addi s0, s0, 1\n'
                }
            }
        }
        const emulator = RISCVEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        const expansion = emulator.decorations.find(
            (decoration) => decoration.file === 'increment.s'
        )
        expect(expansion?.instructions).toHaveLength(2)
        expect(
            new Set(expansion?.instructions?.map((instruction) => instruction.address)).size
        ).toBe(2)
    })
})

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
    it('builds with a base address that points at unmapped memory', async () => {
        //the popover's five choices are a menu, not a whitelist, so any word address reaches the
        //devices; one the Core will not read has to leave the Build standing all the same
        const emulator = await build('# @screen base=0x00000000\n' + DATA + EXIT)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.errors).toEqual([])
    })

    it('blanks the Screen when a Build fails instead of keeping the last picture', async () => {
        const emulator = await run(DATA + storePixel(0, '0x00ffffff') + EXIT)
        expect(pixelAt(emulator, 0, 0)).toBe(0xffffff)
        //a base the directive spells out, so no label probe assembles first and clears memory on
        //the way: reading the display back must not repaint the Screen the failed Build blanked
        const broken = '# @screen base=0x10010000\n' + DATA + '        nosuchinstruction\n'
        await emulator.compile(200, broken).catch(() => {})
        expect(emulator.canExecute).toBe(false)
        expect(pixelAt(emulator, 0, 0)).toBe(0)
    })

    it('runs a Testcase on the display the directive asked for', async () => {
        const code = PROGRAM.replace(
            '        li      a7, 10',
            `        la      t0, grid
        li      t1, 0x00445566
        sw      t1, 0(t0)
        li      a7, 10`
        )
        const emulator = await build(code)
        const results = await emulator.test(code, [SCREEN_TESTCASE], 1_000_000, 200)
        expect(results.every((result) => result.passed)).toBe(true)
        //128 by 64 at one word per pixel, from the directive, not the 8 by 8 the test asked for
        expect(emulator.peripherals.screen.width).toBe(128)
        expect(emulator.peripherals.screen.height).toBe(64)
        expect(pixelAt(emulator, 0, 0)).toBe(0x445566)
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
    }, 15_000)

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

describe('RISC-V pause', () => {
    it('is taken within a sleep or two of a program that sleeps in a loop', async () => {
        //the Core serves the sleep inside its `simulate*` call, so only the chunking of the slice
        //(`marsSlice.ts`) keeps a pause from waiting for the whole instruction budget's worth of
        //sleeps: four instructions a sleep and a compute slice's budget would be a minute
        const emulator = await build(`        .text
main:
loop:   li      a7, 32
        li      a0, 5
        ecall
        j       loop
`)
        const run = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 30))
        const pressed = performance.now()
        emulator.pause()
        expect(await run).toBe(InterpreterStatus.Running)
        expect(emulator.paused).toBe(true)
        expect(emulator.errors).toEqual([])
        expect(performance.now() - pressed).toBeLessThan(1_000)
    })
})

/**
 * What the Core's undo entry for the `cycle` and `instret` counters is allowed to assume.
 *
 * The simulator advances both once per instruction and records one entry covering both, and that
 * entry carries no values: undoing it subtracts one from each. That is only sound while the
 * simulator loop is their sole writer and its step is exactly one, so these hold that invariant
 * rather than leaving it to a comment in the Core. A second writer, a different step, or an undo
 * that stops rewinding them all show up here.
 */
describe('RISC-V cycle and instret counters', () => {
    /** Reads a general register the program wrote, as a number. */
    function registerValue(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    it('advances both counters by exactly one instruction each', async () => {
        //each counter is read during an instruction, so it reports the instructions completed
        //before it: `csrr t0` is the first instruction and sees none, and `csrr t1` is the fifth
        const emulator = await run(
            `        .text
main:
        csrr    t0, cycle
        addi    t3, t3, 1
        addi    t3, t3, 1
        addi    t3, t3, 1
        csrr    t1, cycle
        csrr    t2, instret
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(registerValue(emulator, 't0')).toBe(0)
        expect(registerValue(emulator, 't1')).toBe(4)
        //instret is read one instruction after cycle and must agree with it there
        expect(registerValue(emulator, 't2')).toBe(5)
    })

    it.each([['cycle'], ['instret']])('refuses a program writing %s', async (counter) => {
        const emulator = await run(
            `        .text
main:
        addi    t3, x0, 999
        csrrw   t4, ${counter}, t3
` + EXIT
        )
        expect(emulator.errors.join('\n')).toContain('read-only CSR')
    })

    it('rewinds both counters with the instructions that set them', async () => {
        //an endless loop that rewrites t0 with the cycle count on every pass, stopped at a limit
        //rather than by exiting, so that stepping resumes where the run stopped
        const emulator = await build(`        .text
main:
loop:
        csrr    t0, cycle
        addi    t3, t3, 1
        j       loop
`)
        await emulator.run(30)
        expect(emulator.errors).toEqual([])
        const cycleAtStop = Number(
            emulator.registers.find((register) => register.name === 't0')?.value ?? -1
        )
        expect(cycleAtStop).toBeGreaterThan(0)

        //undo three instructions and execute the same three again: t0 can only come back to the
        //same count if undo subtracted exactly what those three instructions added
        for (let step = 0; step < 3; step++) emulator.undo(1)
        for (let step = 0; step < 3; step++) await emulator.step()
        expect(emulator.errors).toEqual([])
        expect(registerValue(emulator, 't0')).toBe(cycleAtStop)
    })

    it('leaves the undo history covering the instructions it is sized for', async () => {
        //`build` sizes the history at 200 entries. The counters contribute one entry per
        //instruction, so 90 instructions fit with room for the work they do; were they back to one
        //entry each, the same 90 would overrun the history and undo would run out early.
        const body = '        addi    t3, t3, 1\n'.repeat(90)
        const emulator = await run(`        .text\nmain:\n${body}` + EXIT)
        expect(emulator.errors).toEqual([])
        let undone = 0
        while (emulator.canUndo && undone < 200) {
            emulator.undo(1)
            undone++
        }
        expect(undone).toBeGreaterThanOrEqual(90)
    })
})

/**
 * The A and Zbb extensions, which the Core gained on top of RV32/64 IMFD. RARS has no unit tests of
 * its own, so the instruction level checks live here, against the same Core the editor runs.
 */
describe('RISC-V A and Zbb extensions', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    const COUNTER = '        .data\ncounter:.word   5\n        .text\nmain:\n'

    it('returns the value an atomic replaced, not the one it wrote', async () => {
        const emulator = await run(
            COUNTER +
                `        la      t0, counter
        li      t1, 7
        amoadd.w s0, t1, (t0)
        lw      s1, 0(t0)
        li      t1, 3
        amoswap.w s2, t1, (t0)
        lw      s3, 0(t0)
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(5)
        expect(valueOf(emulator, 's1')).toBe(12)
        expect(valueOf(emulator, 's2')).toBe(12)
        expect(valueOf(emulator, 's3')).toBe(3)
    })

    it('compares as unsigned in amomaxu and as signed in amomax', async () => {
        const emulator = await run(
            COUNTER +
                `        la      t0, counter
        li      t1, -1
        sw      t1, 0(t0)
        li      t2, 1
        amomaxu.w s0, t2, (t0)
        lw      s1, 0(t0)
        sw      t1, 0(t0)
        amomax.w s2, t2, (t0)
        lw      s3, 0(t0)
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //unsigned, 0xFFFFFFFF is the larger of the two and stays
        expect(valueOf(emulator, 's1')).toBe(-1)
        //signed, -1 loses to 1
        expect(valueOf(emulator, 's3')).toBe(1)
    })

    it('fails a store conditional that no load reserved paired with', async () => {
        const emulator = await run(
            COUNTER +
                `        la      t0, counter
        lr.w    s0, (t0)
        addi    s0, s0, 10
        sc.w    s1, s0, (t0)
        lw      s2, 0(t0)
        li      s3, 99
        sc.w    s4, s3, (t0)
        lw      s5, 0(t0)
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's1')).toBe(0)
        expect(valueOf(emulator, 's2')).toBe(15)
        //the reservation was consumed by the first sc.w, so the second one reports failure
        expect(valueOf(emulator, 's4')).toBe(1)
        expect(valueOf(emulator, 's5')).toBe(15)
    })

    it('invalidates a reservation an atomic wrote through', async () => {
        const emulator = await run(
            COUNTER +
                `        la      t0, counter
        lr.w    s0, (t0)
        li      t1, 1
        amoadd.w t2, t1, (t0)
        sc.w    s1, s0, (t0)
        lw      s2, 0(t0)
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's1')).toBe(1)
        //the sc.w did not write, so the amoadd result is what stands
        expect(valueOf(emulator, 's2')).toBe(6)
    })

    it('counts bits across the whole 32 bit register', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0x00F00F00
        clz     s0, t0
        ctz     s1, t0
        cpop    s2, t0
        li      t1, 0
        clz     s3, t1
        ctz     s4, t1
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(8)
        expect(valueOf(emulator, 's1')).toBe(8)
        expect(valueOf(emulator, 's2')).toBe(8)
        //zero has no set bit, so both counts are the full register width
        expect(valueOf(emulator, 's3')).toBe(32)
        expect(valueOf(emulator, 's4')).toBe(32)
    })

    it('rotates rather than shifting, and reverses bytes', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0x80000001
        li      t1, 1
        rol     s0, t0, t1
        ror     s1, t0, t1
        rori    s2, t0, 4
        li      t2, 0x12345678
        rev8    s3, t2
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(3)
        expect(valueOf(emulator, 's1')).toBe(0xc0000000 | 0)
        expect(valueOf(emulator, 's2')).toBe(0x18000000)
        expect(valueOf(emulator, 's3')).toBe(0x78563412)
    })

    it('picks min and max without a branch, signed and unsigned', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, -5
        li      t1, 3
        min     s0, t0, t1
        max     s1, t0, t1
        minu    s2, t0, t1
        maxu    s3, t0, t1
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(-5)
        expect(valueOf(emulator, 's1')).toBe(3)
        //unsigned, -5 is 0xFFFFFFFB and so the larger
        expect(valueOf(emulator, 's2')).toBe(3)
        expect(valueOf(emulator, 's3')).toBe(-5)
    })

    it('assembles sext.b, sext.h and zext.h as single instructions', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0xFF
        sext.b  s0, t0
        li      t1, 0x8000
        sext.h  s1, t1
        li      t2, -1
        zext.h  s2, t2
        li      t3, 0x00FF0100
        orc.b   s3, t3
        li      t4, 0x0F0F
        li      t5, 0x00FF
        andn    s4, t4, t5
        xnor    s5, t4, t5
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(-1)
        expect(valueOf(emulator, 's1')).toBe(-32768)
        expect(valueOf(emulator, 's2')).toBe(0xffff)
        expect(valueOf(emulator, 's3')).toBe(0x00ffff00)
        expect(valueOf(emulator, 's4')).toBe(0x0f00)
        expect(valueOf(emulator, 's5')).toBe(~0x0ff0)
    })

    it('makes sext.b one instruction rather than the shift pair it used to expand to', async () => {
        //`li t0, 0xFF` fits a single addi, so after two steps a real sext.b has already finished
        //while the old pseudo-op would still be halfway through its slli/srai pair
        const emulator = await build(
            `        .text\nmain:\n        li      t0, 0xFF
        sext.b  s0, t0
` + EXIT
        )
        await emulator.step()
        await emulator.step()
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(-1)
    })
})

/** Zba address generation and Zbs single bit manipulation, the rest of the B extension. */
describe('RISC-V Zba and Zbs extensions', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    it('scales an index and adds a base in one instruction', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0x10
        li      t1, 3
        sh1add  s0, t1, t0
        sh2add  s1, t1, t0
        sh3add  s2, t1, t0
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //base plus the index scaled by the element size
        expect(valueOf(emulator, 's0')).toBe(0x10 + 3 * 2)
        expect(valueOf(emulator, 's1')).toBe(0x10 + 3 * 4)
        expect(valueOf(emulator, 's2')).toBe(0x10 + 3 * 8)
    })

    it('sets, clears, inverts and reads one bit at a time', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0xFF
        li      t1, 3
        bclr    s0, t0, t1
        bext    s1, t0, t1
        binv    s2, t0, t1
        bset    s3, t0, t1
        li      t2, 0
        bset    s4, t2, t1
        bext    s5, t2, t1
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(0xf7)
        expect(valueOf(emulator, 's1')).toBe(1)
        //inverting a set bit clears it, and setting an already set bit changes nothing
        expect(valueOf(emulator, 's2')).toBe(0xf7)
        expect(valueOf(emulator, 's3')).toBe(0xff)
        expect(valueOf(emulator, 's4')).toBe(0x08)
        expect(valueOf(emulator, 's5')).toBe(0)
    })

    it('takes the bit number from an immediate too', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0xFF
        bclri   s0, t0, 0
        bexti   s1, t0, 7
        li      t1, 0
        bseti   s2, t1, 31
        binvi   s3, t1, 4
        bexti   s4, t1, 0
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's0')).toBe(0xfe)
        expect(valueOf(emulator, 's1')).toBe(1)
        expect(valueOf(emulator, 's2')).toBe(0x80000000 | 0)
        expect(valueOf(emulator, 's3')).toBe(0x10)
        expect(valueOf(emulator, 's4')).toBe(0)
    })

    it('wraps a bit number past the register width', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      t0, 0
        li      t1, 32
        bset    s0, t0, t1
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //only the low 5 bits of the amount count on RV32, so bit 32 is bit 0
        expect(valueOf(emulator, 's0')).toBe(1)
    })
})

/**
 * A pseudo-instruction assembles into more than one real instruction, so one source line owns
 * several machine words. Each word belongs to the line that wrote the pseudo-instruction and to no
 * other line: the Build hover reads `buildArtifacts` by line, so a line that borrowed the word its
 * neighbour emitted would report the wrong machine code for the instruction under the cursor.
 */
describe('RISC-V Build artifacts', () => {
    function wordsByLine(emulator: Emulator): Record<number, string[]> {
        const grouped: Record<number, string[]> = {}
        for (const artifact of emulator.buildArtifacts) {
            const words = (grouped[artifact.line] ??= [])
            words.push(`0x${artifact.address.toString(16)}:${artifact.opcode}`)
        }
        return grouped
    }

    it('gives each expanded pseudo-instruction its own words and never a neighbouring line', async () => {
        const emulator = await build(
            '        .text\nmain:\n' +
                '        addi    t0, zero, 1\n' +
                '        li      t1, 0x12345678\n' +
                '        mv      t2, t1\n' +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //`li` of a value wider than 12 bits is the two-word case, `mv` and the `li` in EXIT the
        //one-word case; every address is emitted exactly once, in ascending order, with no repeat
        //across the line boundary.
        expect(wordsByLine(emulator)).toEqual({
            2: ['0x400000:00100293'],
            3: ['0x400004:12345337', '0x400008:67830313'],
            4: ['0x40000c:006003b3'],
            5: ['0x400010:00a00893'],
            6: ['0x400014:00000073']
        })
    })

    it('keeps an expansion inside the File that wrote it', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "lib.s"\n' },
                'lib.s': {
                    encoding: 'plain' as const,
                    content: '.text\nmain:\nli t1, 0x12345678\nli a7, 10\necall\n'
                }
            }
        }
        const emulator = RISCVEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        expect(emulator.errors).toEqual([])
        //the entry File contributes no instruction of its own, so it must claim none of these
        expect(emulator.buildArtifacts.map((artifact) => artifact.file)).toEqual([
            'lib.s',
            'lib.s',
            'lib.s',
            'lib.s'
        ])
        expect(wordsByLine(emulator)).toEqual({
            2: ['0x400000:12345337', '0x400004:67830313'],
            3: ['0x400008:00a00893'],
            4: ['0x40000c:00000073']
        })
    })
})

/**
 * Assembling the output of a C compiler. gcc writes a good deal that RARS has no use for, and a
 * few things it does: the directives that reserve uninitialized storage, and the %lo form that
 * reaches a global through a register. These check that the ignorable parts stay quiet and the
 * meaningful parts actually place data.
 */
describe('RISC-V gcc output', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    it('reserves storage for .bss and .zero rather than stacking labels', async () => {
        const emulator = await run(
            `        .bss
        .align  2
a:      .zero   4
b:      .zero   4
        .text
        .globl  main
main:
        la      s0, a
        la      s1, b
        sub     s2, s1, s0
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //when .zero reserved nothing these two labels landed on the same address
        expect(valueOf(emulator, 's2')).toBe(4)
    })

    it('allocates .comm and .lcomm and keeps the current section', async () => {
        const emulator = await run(
            `        .text
        .comm   total,4,4
        .lcomm  scratch,8
        .globl  main
main:
        la      s0, total
        la      s1, scratch
        sub     s2, s1, s0
        li      s3, 7
        sw      s3, 0(s0)
        lw      s4, 0(s0)
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, 's2')).toBe(4)
        //and the bytes are real: .comm used to define no symbol at all
        expect(valueOf(emulator, 's4')).toBe(7)
        //a .comm between instructions must not have moved assembly into the data segment
        expect(valueOf(emulator, 's3')).toBe(7)
    })

    it('stores data for the .Nbyte spellings of the size directives', async () => {
        const emulator = await run(
            `        .data
a:      .4byte  0x11223344
b:      .2byte  0x5566
        .align  2
c:      .word   0x778899AA
        .text
        .globl  main
main:
        la      s0, a
        lw      s1, 0(s0)
        la      s2, c
        sub     s3, s2, s0
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //.4byte used to store nothing, so this read whatever followed it
        expect(valueOf(emulator, 's1')).toBe(0x11223344)
        //four bytes for the .4byte, two for the .2byte, then two of padding
        expect(valueOf(emulator, 's3')).toBe(8)
    })

    it('reaches a global through %hi and %lo, loading and storing', async () => {
        const emulator = await run(
            `        .data
val:    .word   0x1234
        .text
        .globl  main
main:
        lui     a5, %hi(val)
        lw      s0, %lo(val)(a5)
        li      s1, 99
        sw      s1, %lo(val)(a5)
        lw      s2, %lo(val)(a5)
        lb      s3, %lo(val)(a5)
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //the load form used to expand to a reference to a symbol named "RnG7"
        expect(valueOf(emulator, 's0')).toBe(0x1234)
        //and the store form did not exist at all
        expect(valueOf(emulator, 's2')).toBe(99)
        expect(valueOf(emulator, 's3')).toBe(99)
    })

    it('assembles a compiler generated file without a single diagnostic', async () => {
        const source =
            `        .file   "prog.c"
        .option nopic
        .attribute arch, "rv32i2p1_m2p0_a2p1"
        .attribute stack_align, 16
        .text
        .section        .rodata
        .align  2
.LC0:
        .string "sum="
        .data
        .p2align 2
        .type   values, @object
        .size   values, 16
values:
        .4byte  1
        .4byte  2
        .4byte  3
        .4byte  4
        .comm   total,4,4
        .text
        .align  1
        .globl  sum
        .type   sum, @function
sum:
        .cfi_startproc
        li      a5,0
        li      a4,0
        ble     a1,zero,.L4
.L3:
        slli    a3,a4,2
        add     a3,a0,a3
        lw      a3,0(a3)
        add     a5,a5,a3
        addi    a4,a4,1
        blt     a4,a1,.L3
.L4:
        mv      a0,a5
        ret
        .cfi_endproc
        .size   sum, .-sum
        .align  1
        .globl  main
        .type   main, @function
main:
        .cfi_startproc
        addi    sp,sp,-16
        .cfi_def_cfa_offset 16
        sw      ra,12(sp)
        .cfi_offset 1, -4
        la      a0,values
        li      a1,4
        call    sum
        lui     a5,%hi(total)
        sw      a0,%lo(total)(a5)
        lui     a5,%hi(.LC0)
        addi    a0,a5,%lo(.LC0)
        li      a7,4
        ecall
        lui     a5,%hi(total)
        lw      s0,%lo(total)(a5)
        lw      ra,12(sp)
        addi    sp,sp,16
        .cfi_endproc
        .size   main, .-main
        .ident  "GCC: (Debian 12.2.0-14) 12.2.0"
        .section        .note.GNU-stack,"",@progbits
` + EXIT
        const emulator = await run(source)
        expect(emulator.errors).toEqual([])
        //the linker and debugger metadata gcc emits must not each raise a squiggle
        expect(emulator.compilerDiagnostics).toEqual([])
        //1 + 2 + 3 + 4, read back through %lo after being stored through it
        expect(valueOf(emulator, 's0')).toBe(10)
    })
})
