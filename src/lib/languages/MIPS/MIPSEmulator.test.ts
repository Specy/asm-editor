import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
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
 * The MARS bitmap display and keyboard-and-display registers against the real Core under node: what
 * a program stores in the mapped range reaches the Screen, what it reads from `0xffff0004` comes
 * from the Keyboard's typed queue, what it stores at `0xffff000c` reaches the Terminal, and program
 * time goes through the clock ([ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
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

type Emulator = ReturnType<typeof MIPSEmulator>

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
    const emulator = MIPSEmulator(code, {
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
    return `        la      $t0, display
        li      $t1, ${value}
        sw      $t1, ${index * 4}($t0)
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

const EXIT = '        li      $v0, 10\n        syscall\n'

describe('MIPS FileSystem', () => {
    const WRITE_FILE = `
        .data
path:   .asciiz "output.txt"
payload:.asciiz "hello"
        .text
main:
        li      $v0, 13
        la      $a0, path
        li      $a1, 1
        li      $a2, 0
        syscall
        move    $s0, $v0
        li      $v0, 15
        move    $a0, $s0
        la      $a1, payload
        li      $a2, 5
        syscall
        move    $a0, $s0
        li      $v0, 16
        syscall
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
path:   .asciiz "input.txt"
buffer: .space  5
        .text
main:
        li      $v0, 13
        la      $a0, path
        li      $a1, 0
        li      $a2, 0
        syscall
        move    $s0, $v0
        li      $v0, 14
        move    $a0, $s0
        la      $a1, buffer
        li      $a2, 5
        syscall
        lbu     $s1, 1($a1)
        move    $a0, $s0
        li      $v0, 16
        syscall
${EXIT}`,
            { fileSystem }
        )
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === '$s1')?.value).toBe(101n)
    })

    /**
     * MARS reports a failed file syscall through the return value so a program can branch on it.
     * Letting the FileSystem's error reach the Core instead ended the run at the syscall, where no
     * program could handle it and the error-handling branch every exercise asks for was unreachable.
     */
    it('answers a failed guest file operation with -1 instead of ending the run', async () => {
        const AFTER = '        li      $v0, 4\n        la      $a0, ok\n        syscall\n'
        const emulator = await run(
            `
        .data
path:   .asciiz "missing.txt"
ok:     .asciiz "AFTER"
        .text
main:
        li      $v0, 13
        la      $a0, path
        li      $a1, 0
        li      $a2, 0
        syscall
        move    $s0, $v0
${AFTER}${EXIT}`,
            { fileSystem: new FileSystem() }
        )
        expect(emulator.stdOut).toContain('AFTER')
        expect(emulator.registers.find((register) => register.name === '$s0')?.value).toBe(-1n)
    })

    it('ignores closing a descriptor the program never opened, as MARS does', async () => {
        const emulator = await run(
            `
        .data
ok:     .asciiz "AFTER"
        .text
main:
        li      $v0, 16
        li      $a0, 42
        syscall
        li      $v0, 4
        la      $a0, ok
        syscall
${EXIT}`,
            { fileSystem: new FileSystem() }
        )
        expect(emulator.stdOut).toContain('AFTER')
        expect(emulator.errors).toEqual([])
    })

    /**
     * One Undo rolls back one Core step's file operations, and no more. The Core's backstep stack is
     * capped by the history Setting, so anything keyed to its depth collapses many steps onto one
     * value once it saturates — a single Undo then reversed every write the program had made.
     */
    it('rolls back one write per Undo even when the Core history is small', async () => {
        const fileSystem = new FileSystem()
        const code = `
        .data
path:   .asciiz "log.txt"
byte:   .asciiz "x"
        .text
main:
        li      $v0, 13
        la      $a0, path
        li      $a1, 1
        li      $a2, 0
        syscall
        move    $s0, $v0
        li      $s1, 0
loop:
        li      $v0, 15
        move    $a0, $s0
        la      $a1, byte
        li      $a2, 1
        syscall
        addi    $s1, $s1, 1
        blt     $s1, 10, loop
${EXIT}`
        const emulator = MIPSEmulator(code, { peripherals: { fileSystem } })
        await emulator.check()
        //a history far shorter than the number of file operations the program performs
        await emulator.compile(8, code)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(fileSystem.readText('log.txt')).toBe('x'.repeat(10))

        const lengths = [10]
        for (let step = 0; step < 40 && emulator.canUndo; step++) {
            emulator.undo(1)
            lengths.push(fileSystem.readText('log.txt').length)
        }
        const drops = lengths.slice(1).map((length, i) => lengths[i] - length)
        //every Undo either rolls back a single write or none at all; never a batch of them
        expect(drops.every((drop) => drop === 0 || drop === 1)).toBe(true)
    })

    it('keeps Testcase file writes isolated and does not leave a resumable Core behind', async () => {
        const fileSystem = new FileSystem()
        const emulator = MIPSEmulator(WRITE_FILE, { peripherals: { fileSystem } })
        const results = await emulator.test(
            WRITE_FILE,
            [SCREEN_TESTCASE, SCREEN_TESTCASE],
            INSTRUCTION_LIMIT,
            200
        )
        expect(results).toHaveLength(2)
        expect(results.every((result) => result.passed)).toBe(true)
        expect(fileSystem.files['output.txt']).toBeUndefined()
        expect(fileSystem.locked).toBe(false)
        expect(emulator.canExecute).toBe(false)
        expect(await emulator.step()).toBe(false)
    })
})

describe('MIPS source set', () => {
    it('assembles included Files and retains their source identity', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "lib.s"\n' },
                'lib.s': {
                    encoding: 'plain' as const,
                    content: '.text\nmain:\nli $s0, 7\nli $v0, 10\nsyscall\n'
                }
            }
        }
        const emulator = MIPSEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === '$s0')?.value).toBe(7n)
        expect(emulator.currentFile).toBe('lib.s')
        expect(emulator.buildArtifacts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ file: 'lib.s', line: 2, opcode: '24100007' })
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
                    content: '# @screen width=128\n.text\nmain:\nli $v0, 10\nsyscall\n'
                },
                'unused.s': {
                    encoding: 'plain' as const,
                    content: '# @screen width=256\n'
                }
            }
        }
        const emulator = MIPSEmulator(sources, { display: SMALL })
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
                    content: 'addiu $s0, $s0, 1\n'
                }
            }
        }
        const emulator = MIPSEmulator(sources)
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

    it('reports a missing Entry as a file-aware compiler diagnostic', async () => {
        const sources = {
            entry: 'missing.s',
            files: { 'other.s': { encoding: 'plain' as const, content: EXIT } }
        }
        const emulator = MIPSEmulator(sources)
        const diagnostics = await emulator.check()
        expect(diagnostics).toMatchObject([
            { severity: 'error', file: 'missing.s', message: 'Entry file not found: missing.s' }
        ])
        await expect(emulator.compile(20, sources)).rejects.toThrow(
            'Entry file not found: missing.s'
        )
        expect(emulator.compilerErrors[0]?.file).toBe('missing.s')
    })
})

describe('MIPS bitmap display', () => {
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

describe('MIPS memory-mapped keyboard and display', () => {
    it('answers the receiver from the typed queue and clears Ready when it empties', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_RECEIVER_CONTROL | 0}
        lw      $t0, 0($s0)
        lw      $t1, 4($s0)
        lw      $t2, 0($s0)
        lw      $t3, 4($s0)
        lw      $t4, 0($s0)
` +
                EXIT,
            { typed: 'Hi' }
        )
        const registers = emulator.registers
        const valueOf = (name: string) => registers.find((r) => r.name === name)?.value
        expect(valueOf('$t0')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('$t1')).toBe(BigInt('H'.charCodeAt(0)))
        //still Ready, because the queue is not empty yet
        expect(valueOf('$t2')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('$t3')).toBe(BigInt('i'.charCodeAt(0)))
        expect(valueOf('$t4')).toBe(0n)
    })

    it('keeps the transmitter Ready and prints what is stored in its data register', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_TRANSMITTER_CONTROL | 0}
        lw      $t0, 0($s0)
        li      $t1, 0x4f
        sw      $t1, 4($s0)
        li      $t1, 0x4b
        sw      $t1, 4($s0)
        lw      $t2, 0($s0)
` +
                EXIT
        )
        expect(emulator.stdOut).toBe('OK')
        const valueOf = (name: string) => emulator.registers.find((r) => r.name === name)?.value
        expect(valueOf('$t0')).toBe(BigInt(MARS_READY_BIT))
        expect(valueOf('$t2')).toBe(BigInt(MARS_READY_BIT))
    })

    it('clears the transcript on a form feed', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_TRANSMITTER_DATA | 0}
        li      $t1, 0x41
        sw      $t1, 0($s0)
        li      $t1, 12
        sw      $t1, 0($s0)
        li      $t1, 0x42
        sw      $t1, 0($s0)
` +
                EXIT
        )
        expect(emulator.stdOut).toBe('B')
    })

    it('stops with an error naming the feature when a program enables interrupts', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_RECEIVER_CONTROL | 0}
        li      $t1, ${MARS_INTERRUPT_ENABLE_BIT}
        sw      $t1, 0($s0)
` +
                EXIT
        )
        expect(emulator.errors.join('\n')).toContain('Interrupt-driven I/O is not supported')
        expect(emulator.errors.join('\n')).toContain('receiver control register')
    })

    it('does not consume pending input when the memory viewer reads the data register', async () => {
        const emulator = await build(
            DATA +
                `        li      $s0, ${MARS_RECEIVER_CONTROL | 0}
        lw      $t1, 4($s0)
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
        expect(emulator.registers.find((r) => r.name === '$t1')?.value).toBe(
            BigInt('A'.charCodeAt(0))
        )
    })
})

describe('MIPS program time', () => {
    it('answers syscall 30 from the clock and sleeps through syscall 32', async () => {
        const emulator = await run(
            DATA +
                `        li      $v0, 30
        syscall
        move    $s1, $a0
        li      $v0, 32
        li      $a0, 40
        syscall
        li      $v0, 30
        syscall
        sub     $s2, $a0, $s1
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        const elapsed = emulator.registers.find((r) => r.name === '$s2')?.value ?? 0n
        expect(elapsed).toBeGreaterThanOrEqual(30n)
    })

    it('completes a sleep immediately on a testcase virtual clock', async () => {
        const code =
            DATA +
            `        li      $v0, 32
        li      $a0, 5000
        syscall
        li      $v0, 30
        syscall
        li      $v0, 1
        syscall
` +
            EXIT
        const emulator = MIPSEmulator(code, { display: SMALL })
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

describe('the MIPS @screen directive', () => {
    const PROGRAM = `# @screen width=128 height=64 unit=1 base=grid
        .data
pad:    .space  32
grid:   .space  8192
        .text
main:
        li      $v0, 10
        syscall
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
                '        li      $v0, 10',
                `        la      $t0, grid
        li      $t1, 0x00123456
        sw      $t1, 0($t0)
        li      $v0, 10`
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
            '        li      $v0, 10',
            `        la      $t0, grid
        li      $t1, 0x00445566
        sw      $t1, 0($t0)
        li      $v0, 10`
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

describe('the MIPS examples', () => {
    it('draws the bitmap tour', async () => {
        const code = readFileSync('examples/mips/bitmap-tour.asm', 'utf8')
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
        const code = readFileSync('examples/mips/bouncing-ball.asm', 'utf8')
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
        const code = readFileSync('examples/mips/keyboard-display.asm', 'utf8')
        const emulator = await run(code, { typed: 'abq' })
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut.endsWith('abq')).toBe(true)
        expect(pixelAt(emulator, 0, 0)).not.toBe(0)
        expect(pixelAt(emulator, 1, 0)).not.toBe(0)
    })
})

describe('MIPS pause', () => {
    it('is taken within a sleep or two of a program that sleeps in a loop', async () => {
        //the Core serves the sleep inside its `simulate*` call, so only the chunking of the slice
        //(`marsSlice.ts`) keeps a pause from waiting for the whole instruction budget's worth of
        //sleeps: four instructions a sleep and a compute slice's budget would be a minute
        const emulator = await build(`        .text
main:
loop:   li      $v0, 32
        li      $a0, 5
        syscall
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
 * The MIPS32 Release 2 instructions the Core gained on top of Release 1, and the FPU control
 * register moves. MARS has no unit tests of its own, so these run against the same Core the editor
 * uses.
 */
describe('MIPS32 Release 2 instructions', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    it('reverses bytes with wsbh and rotr together', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      $t0, 0xAABBCCDD
        wsbh    $s0, $t0
        rotr    $s1, $s0, 16
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //wsbh swaps the bytes inside each halfword, and rotating by 16 swaps the halves
        expect(valueOf(emulator, '$s0')).toBe(0xbbaaddcc | 0)
        expect(valueOf(emulator, '$s1')).toBe(0xddccbbaa | 0)
    })

    it('rotates instead of discarding the bits it shifts out', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      $t0, 0x80000001
        li      $t1, 1
        rotrv   $s0, $t0, $t1
        rotr    $s1, $t0, 4
        srl     $s2, $t0, 1
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(0xc0000000 | 0)
        expect(valueOf(emulator, '$s1')).toBe(0x18000000)
        //srl drops the low bit, which is the difference rotr exists to make
        expect(valueOf(emulator, '$s2')).toBe(0x40000000)
    })

    it('sign extends a byte and a halfword in one instruction', async () => {
        const emulator = await run(
            `        .text\nmain:\n        li      $t0, 0x000000FF
        seb     $s0, $t0
        li      $t1, 0x00008000
        seh     $s1, $t1
        li      $t2, 0x0000007F
        seb     $s2, $t2
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(-1)
        expect(valueOf(emulator, '$s1')).toBe(-32768)
        expect(valueOf(emulator, '$s2')).toBe(127)
    })

    it('reads the FP condition code through cfc1 and writes it back through ctc1', async () => {
        const emulator = await run(
            `        .data
one:    .float  1.0
two:    .float  2.0
        .text
main:
        l.s     $f0, one
        l.s     $f2, two
        c.lt.s  $f0, $f2
        cfc1    $s0, $f31
        cfc1    $s1, $f25
        c.lt.s  $f2, $f0
        cfc1    $s2, $f25
        li      $t9, 1
        ctc1    $t9, $f25
        cfc1    $s3, $f25
        bc1t    taken
        li      $s4, 0
        j       done
taken:
        li      $s4, 111
done:
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //FCSR keeps condition code 0 at bit 23, while FCCR reports it in bit 0
        expect(valueOf(emulator, '$s0')).toBe(0x00800000)
        expect(valueOf(emulator, '$s1')).toBe(1)
        expect(valueOf(emulator, '$s2')).toBe(0)
        expect(valueOf(emulator, '$s3')).toBe(1)
        //and the flag ctc1 wrote is the same one bc1t branches on
        expect(valueOf(emulator, '$s4')).toBe(111)
    })
})

/**
 * The full set of 16 c.cond.fmt comparisons, which the Core generates from one condition code
 * rather than spelling out. The interesting half of the table is what each one does with a NaN.
 */
describe('MIPS floating point comparisons', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    const FLOATS = `        .data
one:    .float  1.0
two:    .float  2.0
        .text
main:
        l.s     $f0, one
        l.s     $f2, two
        li      $t0, 0x7FC00000
        mtc1    $t0, $f4
`

    it('agrees with the ordering when neither operand is NaN', async () => {
        //the flagged form writes eight different condition codes, so one cfc1 reads them all
        const emulator = await run(
            FLOATS +
                `        c.un.s  0, $f0, $f2
        c.eq.s  1, $f0, $f2
        c.olt.s 2, $f0, $f2
        c.ole.s 3, $f0, $f2
        c.ult.s 4, $f0, $f2
        c.f.s   5, $f0, $f2
        c.ngt.s 6, $f0, $f2
        c.seq.s 7, $f0, $f2
        cfc1    $s0, $f25
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //flags 2, 3, 4 and 6 hold: 1.0 is ordered, less than and not greater than 2.0
        expect(valueOf(emulator, '$s0')).toBe(0b01011100)
    })

    it('separates the ordered and unordered conditions on a NaN', async () => {
        const emulator = await run(
            FLOATS +
                `        c.un.s  0, $f0, $f4
        c.eq.s  1, $f0, $f4
        c.ueq.s 2, $f0, $f4
        c.olt.s 3, $f0, $f4
        c.ult.s 4, $f0, $f4
        c.ngt.s 5, $f0, $f4
        c.lt.s  6, $f0, $f4
        c.ngl.s 7, $f0, $f4
        cfc1    $s0, $f25
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //every ordered condition fails against a NaN and every unordered one holds, which is
        //what makes c.un the only way to test for NaN at all
        expect(valueOf(emulator, '$s0')).toBe(0b10110101)
    })

    it('gives a signalling comparison the same answer as its quiet counterpart', async () => {
        const emulator = await run(
            FLOATS +
                `        c.lt.s  0, $f0, $f4
        c.olt.s 1, $f0, $f4
        c.le.s  2, $f0, $f2
        c.ole.s 3, $f0, $f2
        cfc1    $s0, $f25
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //FP exceptions are not tracked, so lt matches olt and le matches ole
        expect(valueOf(emulator, '$s0')).toBe(0b00001100)
    })

    it('compares doubles the same way', async () => {
        const emulator = await run(
            `        .data
done:   .double 1.0
dtwo:   .double 2.0
        .text
main:
        l.d     $f6, done
        l.d     $f8, dtwo
        li      $t1, 0x7FF80000
        mtc1    $zero, $f10
        mtc1    $t1, $f11
        c.un.d  0, $f6, $f8
        c.olt.d 1, $f6, $f8
        c.un.d  2, $f6, $f10
        c.olt.d 3, $f6, $f10
        c.ult.d 4, $f6, $f10
        c.eq.d  5, $f6, $f6
        c.ngt.d 6, $f6, $f10
        c.f.d   7, $f6, $f8
        cfc1    $s0, $f25
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(0b01110110)
    })

    it('still writes flag 0 from the form that does not name one', async () => {
        const emulator = await run(
            FLOATS +
                `        move    $t2, $zero
        ctc1    $t2, $f25
        c.lt.s  $f0, $f2
        cfc1    $s0, $f25
        ctc1    $t2, $f25
        c.lt.s  $f2, $f0
        cfc1    $s1, $f25
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(1)
        expect(valueOf(emulator, '$s1')).toBe(0)
    })

    it('accepts bal, sync, pref and wait', async () => {
        const emulator = await run(
            `        .data
buf:    .word   42
        .text
main:
        li      $s0, 0
        bal     subroutine
        li      $s1, 7
        la      $t0, buf
        sync
        sync    1
        pref    0, 0($t0)
        wait
        lw      $s2, 0($t0)
` +
                EXIT +
                `
subroutine:
        li      $s0, 99
        jr      $ra
`
        )
        expect(emulator.errors).toEqual([])
        //bal linked and returned
        expect(valueOf(emulator, '$s0')).toBe(99)
        expect(valueOf(emulator, '$s1')).toBe(7)
        //and none of the three no-ops disturbed memory
        expect(valueOf(emulator, '$s2')).toBe(42)
    })
})

/**
 * A pseudo-instruction assembles into more than one real instruction, so one source line owns
 * several machine words. Each word belongs to the line that wrote the pseudo-instruction and to no
 * other line: the Build hover reads `buildArtifacts` by line, so a line that borrowed the word its
 * neighbour emitted would report the wrong machine code for the instruction under the cursor.
 */
describe('MIPS Build artifacts', () => {
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
                '        addi    $t0, $zero, 1\n' +
                '        li      $t1, 0x12345678\n' +
                '        move    $t2, $t1\n' +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //`li` of a value wider than 16 bits is the two-word case, `move` and the `li` in EXIT the
        //one-word case; every address is emitted exactly once, in ascending order, with no repeat
        //across the line boundary.
        expect(wordsByLine(emulator)).toEqual({
            2: ['0x400000:20080001'],
            3: ['0x400004:3c011234', '0x400008:34295678'],
            4: ['0x40000c:00095021'],
            5: ['0x400010:2402000a'],
            6: ['0x400014:0000000c']
        })
    })

    it('keeps an expansion inside the File that wrote it', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "lib.s"\n' },
                'lib.s': {
                    encoding: 'plain' as const,
                    content: '.text\nmain:\nli $t1, 0x12345678\nli $v0, 10\nsyscall\n'
                }
            }
        }
        const emulator = MIPSEmulator(sources)
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
            2: ['0x400000:3c011234', '0x400004:34295678'],
            3: ['0x400008:2402000a'],
            4: ['0x40000c:0000000c']
        })
    })
})

/**
 * Assembling the output of a C compiler. gcc writes a good deal of MIPS that MARS had no use for,
 * and some it did: the relocation operators that reach a symbol in two halves, and the directives
 * that name sections and reserve uninitialized storage.
 */
describe('MIPS gcc output', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    it('reaches a symbol through %hi and %lo, loading and storing', async () => {
        const emulator = await run(
            `        .data
val:    .word   0x1234
        .text
        .globl  main
main:
        lui     $t0, %hi(val)
        lw      $s0, %lo(val)($t0)
        li      $t1, 99
        sw      $t1, %lo(val)($t0)
        lw      $s1, %lo(val)($t0)
        addiu   $s2, $t0, %lo(val)
        la      $s3, val
        subu    $s4, $s2, $s3
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(0x1234)
        expect(valueOf(emulator, '$s1')).toBe(99)
        //the address built from the two halves must be the one 'la' produces
        expect(valueOf(emulator, '$s4')).toBe(0)
    })

    it('places data in the sections a compiler names', async () => {
        const emulator = await run(
            `        .rdata
        .p2align 2
c:      .4byte  0x11223344
        .bss
        .align  2
a:      .zero   4
b:      .zero   4
        .text
        .globl  main
main:
        la      $s0, a
        la      $s1, b
        subu    $s2, $s1, $s0
        la      $s3, c
        lw      $s4, 0($s3)
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //.zero used to reserve nothing, so these two labels shared an address
        expect(valueOf(emulator, '$s2')).toBe(4)
        //and .4byte used to store nothing
        expect(valueOf(emulator, '$s4')).toBe(0x11223344)
    })

    it('allocates .comm and .lcomm without leaving the text segment', async () => {
        const emulator = await run(
            `        .text
        .comm   total,4,4
        .lcomm  scratch,8
        .globl  main
main:
        la      $s0, total
        la      $s1, scratch
        subu    $s2, $s1, $s0
        li      $t0, 7
        sw      $t0, 0($s0)
        lw      $s3, 0($s0)
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s2')).toBe(4)
        expect(valueOf(emulator, '$s3')).toBe(7)
    })

    it('assembles a compiler generated file without a single diagnostic', async () => {
        const source =
            `        .file   1 "sum.c"
        .section .mdebug.abi32
        .previous
        .nan    legacy
        .module fp=xx
        .module nooddspreg
        .abicalls
        .text
        .rdata
        .align  2
$LC0:
        .ascii  "sum=\\000"
        .data
        .align  2
        .type   values, @object
        .size   values, 16
values:
        .4byte  1
        .4byte  2
        .4byte  3
        .4byte  4
        .comm   total,4,4
        .text
        .align  2
        .globl  sum
        .set    nomips16
        .set    nomicromips
        .type   sum, @function
        .ent    sum
sum:
        .frame  $sp,0,$31
        .mask   0x00000000,0
        .fmask  0x00000000,0
        move    $2,$0
        move    $3,$0
        blez    $5,$L4
$L3:
        sll     $6,$3,2
        addu    $6,$4,$6
        lw      $6,0($6)
        addu    $2,$2,$6
        addiu   $3,$3,1
        bne     $3,$5,$L3
$L4:
        jr      $31
        .end    sum
        .size   sum, .-sum
        .align  2
        .globl  main
        .type   main, @function
        .ent    main
main:
        .frame  $sp,8,$31
        addiu   $sp,$sp,-8
        sw      $31,4($sp)
        lui     $4,%hi(values)
        addiu   $4,$4,%lo(values)
        li      $5,4
        jal     sum
        lui     $6,%hi(total)
        sw      $2,%lo(total)($6)
        lui     $6,%hi(total)
        lw      $s0,%lo(total)($6)
        lw      $31,4($sp)
        addiu   $sp,$sp,8
        .end    main
        .size   main, .-main
        .ident  "GCC: (Debian 12.2.0-14) 12.2.0"
` + EXIT
        const emulator = await run(source)
        expect(emulator.errors).toEqual([])
        //the linker and debugger metadata gcc emits must not each raise a squiggle
        expect(emulator.compilerDiagnostics).toEqual([])
        //1 + 2 + 3 + 4, stored through %lo and read back through it
        expect(valueOf(emulator, '$s0')).toBe(10)
    })

    it('does not execute the delay slot, which a compiler fills', async () => {
        const emulator = await run(
            `        .text
        .globl  main
main:
        li      $s0, 0
        beq     $zero, $zero, target
        li      $s0, 99
        li      $s0, 1
target:
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        //MARS runs straight past a taken branch, so the instruction gcc puts in the
        //delay slot never runs. Compile with -fno-delayed-branch to get a nop there.
        expect(valueOf(emulator, '$s0')).toBe(0)
    })
})
