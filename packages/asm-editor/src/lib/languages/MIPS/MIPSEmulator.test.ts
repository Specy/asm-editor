import { readExample } from '#lib/examples.server.ts'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { synthEntries } from '#lib/documentation/synth.ts'
import { inputControllerEntries } from '#lib/documentation/inputController.ts'
import { soundDeviceExamples } from '#lib/documentation/soundDevices.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import { MIPS } from '@specy/mips'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { Prompt, PromptType } from '#stores/promptStore.svelte.ts'
import {
    MARS_INTERRUPT_ENABLE_BIT,
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_TRANSMITTER_CONTROL,
    MARS_TRANSMITTER_DATA
} from '#lib/languages/mars/MarsDevices.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'
import type { MarsCore } from '#lib/languages/mars/MarsDevices.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import {
    EXCEPTION_EXAMPLE,
    KEYBOARD_EXAMPLE,
    TIMER_EXAMPLE
} from '#lib/documentation/mars/interrupts.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import { InterpreterStatus, RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { CPU_REGISTER_FILE_ID } from '#lib/languages/GenericEmulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'

/**
 * The MARS bitmap display and keyboard-and-display registers against the real Core under node: what
 * a program stores in the mapped range reaches the Screen, what it reads from `0xffff0004` comes
 * from the Keyboard's typed queue, what it stores at `0xffff000c` reaches the Terminal, and program
 * time goes through the clock ([ADR 0010](../../../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
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
    audio?: Audio
}

async function build(code: string, options: Options = {}) {
    const keyboard = options.keyboard ?? new Keyboard()
    const emulator = MIPSEmulator(code, {
        display: options.display ?? SMALL,
        peripherals: {
            keyboard,
            clock: options.virtualClock ? new ProgramClock({ mode: 'virtual' }) : undefined,
            fileSystem: options.fileSystem,
            audio: options.audio
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

    it('names a .globl callee in the call stack, wherever the label was declared', async () => {
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': {
                    encoding: 'plain' as const,
                    content:
                        '.include "fibonacci.s"\n.text\n.globl main\nmain:\njal fibonacci\n' + EXIT
                },
                'fibonacci.s': {
                    encoding: 'plain' as const,
                    content: '.text\n.globl fibonacci\nfibonacci:\njr $ra\n'
                }
            }
        }
        const emulator = MIPSEmulator(sources)
        await emulator.check()
        await emulator.compile(20, sources)
        //.globl moves the label out of the local symbol table, and a Core that only looked there
        //used to throw on every step for as long as the frame stayed on the stack
        for (let step = 0; step < 10 && emulator.callStack.length === 0; step++) {
            await emulator.step()
        }
        expect(emulator.errors).toEqual([])
        expect(emulator.callStack).toMatchObject([{ name: 'fibonacci', file: 'fibonacci.s' }])
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

    it('reads back only the block an Undo restored, not the whole grid', async () => {
        //a 64 by 16 grid is four of the Core's 1 KB blocks; the program draws in the first two
        const display = { ...SMALL, unitWidth: 1, unitHeight: 1, width: 64, height: 16 }
        const emulator = await run(
            DATA + storePixel(0, '0x00ff0000') + storePixel(511, '0x0000ff00') + EXIT,
            { display }
        )
        expect(pixelAt(emulator, 63, 7)).toBe(0x00ff00)
        const core = (emulator as unknown as { core: Pick<MarsCore, 'readMemoryWords'> }).core
        const read = core.readMemoryWords.bind(core)
        const counts: number[] = []
        core.readMemoryWords = (address, count) => {
            counts.push(count)
            return read(address, count)
        }
        for (let step = 0; step < 8 && pixelAt(emulator, 63, 7) !== 0; step++) emulator.undo(1)
        expect(pixelAt(emulator, 63, 7)).toBe(0x000000)
        expect(pixelAt(emulator, 0, 0)).toBe(0xff0000)
        //the second block's 256 words, which the undone store had written, and nothing else
        expect(counts).toEqual([256])
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

    it('shows only whole frames of a program that sleeps after drawing each one', async () => {
        //forty frames that each fill the 8 by 8 grid in one color, red then blue, and sleep. The
        //Screen catches up before every sleep and at the end of every slice, so a slice that ran on
        //past a sleep into the next frame would show part of the grid in each color
        const emulator = await build(
            DATA +
                `        li      $s0, 0
frame:  andi    $t2, $s0, 1
        li      $t1, 0x00ff0000
        beqz    $t2, paint
        li      $t1, 0x000000ff
paint:  la      $t0, display
        li      $t3, 64
fill:   sw      $t1, 0($t0)
        addi    $t0, $t0, 4
        addi    $t3, $t3, -1
        bnez    $t3, fill
        li      $v0, 32
        li      $a0, 1
        syscall
        addi    $s0, $s0, 1
        blt     $s0, 40, frame
` +
                EXIT,
            { virtualClock: true }
        )
        const screen = emulator.peripherals.screen
        const shown: string[] = []
        const sync = screen.syncFramebuffer.bind(screen)
        screen.syncFramebuffer = (...args: Parameters<typeof sync>) => {
            sync(...args)
            const colors = new Set<number>()
            for (let index = 0; index < 64; index++) {
                colors.add(pixelAt(emulator, index % 8, Math.floor(index / 8)))
            }
            shown.push([...colors].map((color) => color.toString(16)).join('+'))
        }
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(shown.length).toBeGreaterThanOrEqual(40)
        expect(shown.filter((frame) => frame !== 'ff0000' && frame !== 'ff')).toEqual([])
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

    it('leaves the transcript to its own Undo when a store to the data register is undone', async () => {
        //Undo puts the register's old byte back through a store the device observes, but the
        //transcript rewinds through its own history: the form feed that store restores must not
        //clear what was printed since
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_TRANSMITTER_DATA | 0}
        li      $t1, 12
        sw      $t1, 0($s0)
        li      $a0, 0x58
        li      $v0, 11
        syscall
        li      $t1, 0x59
        sw      $t1, 0($s0)
` +
                EXIT
        )
        expect(emulator.stdOut).toBe('XY')
        //the exit's two instructions, then the store of the Y
        expect(emulator.undo(3)).toBe(3)
        expect(emulator.stdOut).toBe('X')
    })

    it('prints nothing when a Poke of the data register is undone', async () => {
        const emulator = await build(DATA + EXIT)
        const register = BigInt(MARS_TRANSMITTER_DATA >>> 0)
        expect(emulator.pokeMemory(register, new Uint8Array([0x5a, 0, 0, 0]))).toBe(true)
        expect(emulator.stdOut).toBe('Z')
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.stdOut).toBe('Z')
    })

    it('keeps the receiver Ready for a keystroke typed after a Poke it undoes', async () => {
        //the word Undo puts back was stated before the key was typed: the device states Ready
        //again from what is waiting now, or a program polling the register would spin
        const keyboard = new Keyboard()
        const emulator = await build(DATA + EXIT, { keyboard })
        const control = BigInt(MARS_RECEIVER_CONTROL >>> 0)
        expect(emulator.pokeMemory(control, new Uint8Array([0x04, 0, 0, 0]))).toBe(true)
        expect(emulator.readMemoryBytes(control, 4)[0]).toBe(0)
        keyboard.typeText('A')
        expect(emulator.readMemoryBytes(control, 4)[0]).toBe(MARS_READY_BIT)
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.readMemoryBytes(control, 4)[0]).toBe(MARS_READY_BIT)
    })

    it('keeps the interrupt-enable bit a program stores, beside the Ready bit the device states', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_RECEIVER_CONTROL | 0}
        li      $t1, ${MARS_INTERRUPT_ENABLE_BIT | MARS_READY_BIT}
        sw      $t1, 0($s0)
        lw      $s1, 0($s0)
` +
                EXIT
        )
        expect(emulator.errors).toEqual([])
        //no key waits, so Ready is the device's 0 and the enable bit the program's 1; no handler
        //is needed while nothing asks
        const s1 = emulator.registers.find((register) => register.name === '$s1')!
        expect(Number(s1.value)).toBe(MARS_INTERRUPT_ENABLE_BIT)
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

/**
 * Reads typed in the Terminal through its Line discipline, and MARS's dialogs, which stay modal
 * ([ADR 0036](../../../../../../docs/adr/0036-programs-read-input-typed-in-the-terminal.md)). A console on
 * the page is what input is typed into; the tests attach one and type through the Terminal.
 */
describe('MIPS input typed in the Terminal', () => {
    beforeEach(() => Prompt.cancel())

    async function built(code: string) {
        const emulator = await build(code)
        emulator.peripherals.terminal.attachConsole()
        return emulator
    }

    function valueOf(emulator: Emulator, name: string): bigint | undefined {
        return emulator.registers.find((register) => register.name === name)?.value
    }

    /** Lets a run that is waiting on a dialog or a read get there. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

    it('reads a character on one keystroke, Enter giving 10', async () => {
        const emulator = await built(
            `        .text
main:
        li      $v0, 12
        syscall
        move    $s0, $v0
        li      $v0, 12
        syscall
        move    $s1, $v0
` + EXIT
        )
        const terminal = emulator.peripherals.terminal
        terminal.insertText('x')
        terminal.pressEnter()
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(BigInt('x'.charCodeAt(0)))
        expect(valueOf(emulator, '$s1')).toBe(10n)
        expect(emulator.stdOut).toBe('x\n')
    })

    it('shows what the program drew while it waits for input', async () => {
        const emulator = await built(
            DATA +
                storePixel(0, '0x00ff0000') +
                `        li      $v0, 12
        syscall
` +
                EXIT
        )
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        //the read suspends the slice, so only the read itself can have brought the Screen up to date
        expect(emulator.peripherals.terminal.pendingRead).toBeDefined()
        expect(pixelAt(emulator, 0, 0)).toBe(0xff0000)
        emulator.peripherals.terminal.insertText('x')
        await running
        expect(emulator.errors).toEqual([])
    })

    it('refreshes the waiting instruction and registers at each input request', async () => {
        const emulator = await built(
            `.text
main:
    li $v0, 5
    syscall
    move $s0, $v0
    li $v0, 5
    syscall
    move $s1, $v0
` + EXIT
        )
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(terminal.pendingRead?.kind).toBe('line')
        expect(emulator.line).toBe(3)
        expect(emulator.currentFile).toBe(emulator.buildSources?.entry)
        expect(valueOf(emulator, '$v0')).toBe(5n)

        terminal.insertText('42')
        terminal.pressEnter()
        await settle()
        expect(terminal.pendingRead?.kind).toBe('line')
        expect(emulator.line).toBe(6)
        expect(valueOf(emulator, '$s0')).toBe(42n)

        terminal.insertText('7')
        terminal.pressEnter()
        await running
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s1')).toBe(7n)
    })

    it('reads an integer from a line edited until Enter, ignoring Ctrl+D', async () => {
        const emulator = await built(
            `        .text
main:
        li      $v0, 5
        syscall
        move    $s0, $v0
` + EXIT
        )
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(terminal.pendingRead?.kind).toBe('line')
        terminal.sendEndOfInput()
        terminal.insertText('43')
        terminal.pressBackspace()
        terminal.insertText('2')
        terminal.pressEnter()
        await running
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(42n)
        expect(emulator.stdOut).toBe('42\n')
    })

    it('reads End of input from standard input as no bytes', async () => {
        const emulator = await built(
            `        .data
buffer: .space  16
        .text
main:
        li      $v0, 14
        li      $a0, 0
        la      $a1, buffer
        li      $a2, 16
        syscall
        move    $s0, $v0
` + EXIT
        )
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(terminal.pendingRead?.endOfInput).toBe(true)
        terminal.sendEndOfInput()
        await running
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(0n)
    })

    it('decodes standard output as UTF-8, a character split across two writes included', async () => {
        const emulator = await run(
            `        .data
bytes:  .byte   0xc3, 0xa9
        .text
main:
        li      $v0, 15
        li      $a0, 1
        la      $a1, bytes
        li      $a2, 1
        syscall
        li      $v0, 15
        li      $a0, 1
        la      $a1, bytes
        addiu   $a1, $a1, 1
        li      $a2, 1
        syscall
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('é')
    })

    it('answers the confirm dialog with Cancel, which MARS gives as 2', async () => {
        const emulator = await built(
            `        .data
question: .asciiz "Sure?"
        .text
main:
        li      $v0, 50
        la      $a0, question
        syscall
        move    $s0, $a0
` + EXIT
        )
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(Prompt.type).toBe(PromptType.Confirm)
        expect(Prompt.offersCancel).toBe(true)
        Prompt.cancel()
        await running
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(2n)
    })

    it('waits on a message dialog until it is dismissed', async () => {
        const emulator = await built(
            `        .data
message: .asciiz "Done"
        .text
main:
        li      $v0, 55
        la      $a0, message
        li      $a1, 1
        syscall
        li      $v0, 1
        li      $a0, 7
        syscall
` + EXIT
        )
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(Prompt.type).toBe(PromptType.Alert)
        expect(Prompt.question).toBe('Done')
        //the print after the dialog has not run yet
        expect(emulator.stdOut).toBe('')
        Prompt.answerAlert()
        await running
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('7')
    })

    it('answers an input dialog without echoing it and returns Cancel to the program', async () => {
        const program =
            `        .data
message: .asciiz "Name?"
buffer: .space  16
        .text
main:
        li      $v0, 54
        la      $a0, message
        la      $a1, buffer
        li      $a2, 16
        syscall
        move    $s0, $a1
        la      $t0, buffer
        lbu     $s1, 0($t0)
` + EXIT
        const emulator = await built(program)
        const running = emulator.run(INSTRUCTION_LIMIT)
        await settle()
        expect(Prompt.question).toBe('Name?')
        Prompt.answerText('Ada')
        await running
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$s0')).toBe(0n)
        expect(valueOf(emulator, '$s1')).toBe(BigInt('A'.charCodeAt(0)))
        expect(emulator.stdOut).toBe('')
        const cancelled = await built(program)
        const stopped = cancelled.run(INSTRUCTION_LIMIT)
        await settle()
        Prompt.cancel()
        await stopped
        expect(cancelled.errors).toEqual([])
        expect(valueOf(cancelled, '$s0')).toBe(-2n)
        expect(valueOf(cancelled, '$s1')).toBe(0n)
        expect(cancelled.stdOut).toBe('')
    })

    it('answers the receiver register from a Testcase’s scripted input', async () => {
        const emulator = await build(
            `        .text
main:
        li      $s0, ${MARS_RECEIVER_CONTROL | 0}
        li      $s2, 3
loop:   lw      $t0, 0($s0)
        andi    $t0, $t0, 1
        beqz    $t0, loop
        lw      $a0, 4($s0)
        li      $v0, 11
        syscall
        addiu   $s2, $s2, -1
        bnez    $s2, loop
` + EXIT
        )
        await emulator.runTestcase({ ...SCREEN_TESTCASE, input: ['ab'] }, INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('ab\n')
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
                    expectedOutput: String((946684800000 + 5000) | 0),
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

    it('takes a size MARS does not offer without a word, and clamps one past the range', async () => {
        const custom = await build('# @screen width=300 height=100 unit=1\n' + DATA + EXIT)
        expect(custom.getDisplay?.()?.display).toMatchObject({ width: 300, height: 100 })
        expect(custom.peripherals.screen.width).toBe(300)
        expect(custom.peripherals.screen.height).toBe(100)
        expect(custom.compilerDiagnostics).toEqual([])
        const past = await build('# @screen width=3000\n' + DATA + EXIT)
        expect(past.getDisplay?.()?.display.width).toBe(1024)
        expect(past.canExecute).toBe(true)
        expect(past.compilerDiagnostics.map((d) => d.severity)).toEqual(['warning'])
        expect(past.compilerDiagnostics[0]?.lineIndex).toBe(0)
    })

    it('reads a labelled base from the Build itself, assembling the program once', async () => {
        const emulator = await build(PROGRAM)
        const cores = vi.spyOn(MIPS, 'makeMipsFromFiles')
        try {
            await emulator.compile(200, PROGRAM)
            expect(cores).toHaveBeenCalledTimes(1)
        } finally {
            cores.mockRestore()
        }
        expect(emulator.getDisplay?.()?.display.baseAddress).toBe(0x10010020)
    })

    it('resolves a base named by .eqv through a probe, and still builds the program it runs', async () => {
        //an .eqv name is text the assembler substitutes, so no symbol table holds it
        const code = PROGRAM.replace('base=grid', 'base=GRID_AT').replace(
            '        li      $v0, 10',
            `        .eqv    GRID_AT, 0x10010020
        la      $t0, grid
        li      $t1, 0x00abcdef
        sw      $t1, 0($t0)
        li      $v0, 10`
        )
        const emulator = await build(code)
        expect(emulator.getDisplay?.()).toMatchObject({
            origin: 'directive',
            baseLabel: 'GRID_AT',
            display: { baseAddress: 0x10010020 }
        })
        expect(emulator.compilerDiagnostics).toEqual([])
        //the program assembled after the probe is the one that runs, with its undo history
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(pixelAt(emulator, 0, 0)).toBe(0xabcdef)
        for (let step = 0; step < 8 && pixelAt(emulator, 0, 0) !== 0; step++) emulator.undo(1)
        expect(pixelAt(emulator, 0, 0)).toBe(0)
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
        const code = readExample('mips/bitmap-tour.asm')
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
        const code = readExample('mips/bouncing-ball.asm')
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
        const code = readExample('mips/keyboard-display.asm')
        const emulator = await run(code, { typed: 'abq' })
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut.endsWith('abq')).toBe(true)
        expect(pixelAt(emulator, 0, 0)).not.toBe(0)
        expect(pixelAt(emulator, 1, 0)).not.toBe(0)
    })
})

describe('MIPS pause', () => {
    it('is taken within a sleep or two of a program that sleeps in a loop', async () => {
        //the Core serves the sleep inside its `simulate*` call, so it is the sleep ending the slice
        //(`marsSlice.ts`) that keeps a pause from waiting for the whole instruction budget's worth
        //of sleeps: four instructions a sleep and a compute slice's budget would be a minute
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
 * Where a program ends. The exit syscall is an instruction like any other, so the current line
 * marker stays on it, as it stays on the last instruction of a program that runs off its end. And it
 * ends the program wherever it sits: most programs keep their functions below `main`, so the program
 * counter an exit leaves is usually on a statement.
 */
describe('MIPS exit', () => {
    function valueOf(emulator: Emulator, name: string): number {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return Number(register.value)
    }

    const CALLS_BELOW = `        .text
main:
        li      $a0, 1
        jal     double
        li      $v0, 10
        syscall
double:
        add     $a0, $a0, $a0
        jr      $ra
`
    /** The 0-based line of the `syscall` in `CALLS_BELOW`. */
    const CALLS_BELOW_EXIT = 5

    it('stays on the exit syscall at the bottom of a program, not on the line above it', async () => {
        const emulator = await run(
            `        .text
main:
        li      $v0, 1
        li      $a0, 42
        syscall
` + EXIT
        )
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        //the `syscall` of EXIT, below its `li $v0, 10`
        expect(emulator.line).toBe(6)
    })

    it('ends a run at an exit with a function below it', async () => {
        const emulator = await build(CALLS_BELOW)
        expect(await emulator.run(INSTRUCTION_LIMIT)).toBe(InterpreterStatus.Terminated)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
        //neither a Run nor a Step carries on into `double`
        await emulator.run(INSTRUCTION_LIMIT)
        await emulator.step()
        expect(valueOf(emulator, '$a0')).toBe(2)
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
    })

    it('ends stepping at the exit', async () => {
        const emulator = await build(CALLS_BELOW)
        let steps = 0
        while (!emulator.terminated && steps < 20) {
            await emulator.step()
            steps++
        }
        //li, jal, add, jr, li, syscall
        expect(steps).toBe(6)
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
    })

    it('undoes the exit on its own and runs it again', async () => {
        const emulator = await run(CALLS_BELOW)
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.terminated).toBe(false)
        //the syscall is next again, and the `li` before it is still done
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
        expect(valueOf(emulator, '$v0')).toBe(10)
        await emulator.step()
        expect(emulator.terminated).toBe(true)
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
    })

    it('ends a Testcase at the exit', async () => {
        const emulator = await build(CALLS_BELOW)
        const [result] = await emulator.test(
            CALLS_BELOW,
            [{ ...SCREEN_TESTCASE, expectedRegisters: { $a0: 2n } }],
            INSTRUCTION_LIMIT,
            200
        )
        expect(result?.passed).toBe(true)
        expect(emulator.line).toBe(CALLS_BELOW_EXIT)
    })

    /** The last instruction is a syscall, but not an exit: the program runs past it. */
    const RUNS_PAST_THE_END = `        .text
main:
        li      $v0, 1
        li      $a0, 42
        syscall
`

    it('says the program exited, wherever the exit sits and whichever exit it is', async () => {
        expect((await run(CALLS_BELOW)).termination).toEqual({ kind: 'exit', code: 0 })
        expect((await run(`        .text\nmain:\n` + EXIT)).termination).toEqual({
            kind: 'exit',
            code: 0
        })
        const exit2 = await run(`        .text
main:
        li      $a0, 3
        li      $v0, 17
        syscall
`)
        expect(exit2.termination).toEqual({ kind: 'exit', code: 3 })
    })

    it('says a program that runs past its last instruction ended there, by a Run or a Step', async () => {
        const ran = await run(RUNS_PAST_THE_END)
        expect(ran.terminated).toBe(true)
        expect(ran.termination).toEqual({ kind: 'end' })
        const stepped = await build(RUNS_PAST_THE_END)
        for (let steps = 0; !stepped.terminated && steps < 10; steps++) await stepped.step()
        expect(stepped.termination).toEqual({ kind: 'end' })
    })

    it('forgets how the program ended when Undo takes the exit back', async () => {
        const emulator = await build(CALLS_BELOW)
        for (let steps = 0; !emulator.terminated && steps < 20; steps++) await emulator.step()
        expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.termination).toBeUndefined()
        await emulator.step()
        expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
    })

    it('ends the program on a runtime error, until Undo takes it back', async () => {
        const emulator = await build(
            `        .text
main:
        li      $t0, 1
        lw      $t1, 0($t0)
` + EXIT
        )
        expect(await emulator.run(INSTRUCTION_LIMIT)).toBe(
            InterpreterStatus.TerminatedWithException
        )
        //the Core would carry on past the failed load; the program is over all the same
        expect(emulator.terminated).toBe(true)
        expect(emulator.termination).toEqual({ kind: 'error', message: emulator.errors[0] })
        expect(emulator.errors[0]).toContain('fetch address not aligned')
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.terminated).toBe(false)
        expect(emulator.termination).toBeUndefined()
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

/**
 * The FPU and CP0 Register files against the real Core: what MARS holds in coprocessor 1 and
 * coprocessor 0 reaches the files the panel shows, and the Core's backstepper rolls a floating-point
 * write back ([the design record](../../../../../../docs/design/register-files.md)).
 */
describe('MIPS Register files', () => {
    /**
     * This MARS fork has no `li.s`, so 1.5 comes out of a `.float`. `add.s` doubles it, `cvt.d.s`
     * builds a double in the `$f4`/`$f5` pair and `c.lt.s` writes condition flag 0.
     */
    const FLOATS =
        `        .data
value:  .float  1.5
        .text
main:
        l.s     $f0, value
        add.s   $f2, $f0, $f0
        cvt.d.s $f4, $f0
        c.lt.s  $f0, $f2
` + EXIT

    function fileOf(emulator: Emulator, id: string) {
        const file = emulator.registerFiles.find((candidate) => candidate.id === id)
        if (!file) throw new Error(`No register file named ${id}`)
        return file
    }

    function fileValueOf(emulator: Emulator, id: string, name: string): bigint {
        const register = fileOf(emulator, id).registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name} in ${id}`)
        return register.value
    }

    it('lists the CPU file first, holding the very general registers', async () => {
        const emulator = await run(FLOATS)
        expect(emulator.registerFiles.map((file) => file.id)).toEqual(['cpu', 'fpu', 'cp0'])
        expect(emulator.registerFiles.map((file) => file.label)).toEqual(['CPU', 'FPU', 'CP0'])
        expect(emulator.registerFiles[0].registers).toBe(emulator.registers)
    })

    it('reads the FPU registers, the pair a double occupies and the condition flags', async () => {
        const emulator = await run(FLOATS)
        expect(emulator.errors).toEqual([])
        const fpu = fileOf(emulator, 'fpu')
        expect(fpu.registers).toHaveLength(32)
        expect(fileValueOf(emulator, 'fpu', '$f0')).toBe(0x3fc00000n)
        expect(fileValueOf(emulator, 'fpu', '$f2')).toBe(0x40400000n)
        //a double lives in the even/odd pair, low word in the even register, as MARS stores it:
        //1.5 as a double is 0x3ff8000000000000
        expect(fileValueOf(emulator, 'fpu', '$f4')).toBe(0x00000000n)
        expect(fileValueOf(emulator, 'fpu', '$f5')).toBe(0x3ff80000n)
        //`c.lt.s` with no flag number writes flag 0, and 1.5 is less than 3
        expect(fpu.flags.map((flag) => flag.name)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
        expect(fpu.flags.map((flag) => flag.value)).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    })

    it("reads the six coprocessor 0 registers, MARS's and the timer's", async () => {
        const emulator = await run(FLOATS)
        const cp0 = fileOf(emulator, 'cp0')
        expect(cp0.registers.map((register) => register.name)).toEqual([
            '$8 (vaddr)',
            '$9 (count)',
            '$11 (compare)',
            '$12 (status)',
            '$13 (cause)',
            '$14 (epc)'
        ])
        //status holds MARS's reset value until an exception changes it; Count went up once every
        //two instructions the program ran; the others stay at 0
        const executed = Number(emulator._getInstructionsExecuted())
        const values = cp0.registers.map((register) => register.value)
        expect(values[1]).toBeGreaterThan(0n)
        expect(values.filter((_, index) => index !== 1)).toEqual([0n, 0n, 0x0000ff11n, 0n, 0n])
        expect(Number(values[1])).toBeLessThanOrEqual(executed / 2)
    })

    it('leaves a $f register to highlight after the step that wrote it', async () => {
        const emulator = await build(FLOATS)
        //`l.s` of a label assembles to `lui $at` and `lwc1`, so the third step is the `add.s`
        for (let step = 0; step < 3; step++) await emulator.step()
        const f2 = fileOf(emulator, 'fpu').registers[2]
        expect(f2.value).toBe(0x40400000n)
        expect(f2.prev).toBe(0n)
    })

    it('restores a floating-point write on Undo, as the Core backsteps it', async () => {
        const emulator = await build(FLOATS)
        for (let step = 0; step < 3; step++) await emulator.step()
        emulator.undo(1)
        const f2 = fileOf(emulator, 'fpu').registers[2]
        expect(f2.value).toBe(0n)
        //the value the rollback took away is what the panel highlights against
        expect(f2.prev).toBe(0x40400000n)
    })

    /**
     * An address error taken with a handler installed at MARS's exception vector. Loading from
     * address 1 is unaligned, so before the jump MARS writes the faulting address into
     * `$8 (vaddr)`, the exception code into `$13 (cause)` and the exception level bit into
     * `$12 (status)`. The handler steps the return address past the faulting instruction, because
     * `eret` returns to `$14 (epc)` and re-running the load would take the same exception forever.
     */
    const ADDRESS_ERROR =
        `        .text
main:
        lw      $t0, 1($zero)
` +
        EXIT +
        `        .ktext  0x80000180
        mfc0    $k0, $14
        addiu   $k0, $k0, 4
        mtc0    $k0, $14
        eret
`

    it('names a coprocessor 0 write in the undo history as the CP0 file names it', async () => {
        const emulator = await build(ADDRESS_ERROR)
        expect(emulator.errors).toEqual([])
        //the faulting load and the three handler instructions up to `mtc0`, stopping before the
        //`eret` that clears the exception level bit again
        for (let step = 0; step < 4; step++) await emulator.step()
        const written = emulator.latestSteps
            .flatMap((step) => step.mutations)
            .filter((mutation) => mutation.type === 'WriteRegister')
            .map((mutation) => mutation.value.register)
        expect(written).toContain('$12 (status)')
        expect(written).toContain('$13 (cause)')
        expect(written).toContain('$8 (vaddr)')
        //vaddr is the address the load asked for, cause holds exception code 4 (address error on
        //load) in bits 2 to 6, status has the exception level bit set over MARS's reset value of
        //0x0000ff11, and epc is the address of the load, which the handler has just stepped past
        //and Count is 2: four instructions, the faulting load included
        const cp0 = fileOf(emulator, 'cp0')
        expect(cp0.registers.map((register) => register.value)).toEqual([
            0x00000001n,
            2n,
            0n,
            0x0000ff13n,
            0x00000010n,
            0x00400004n
        ])
    })

    it('shows zeros for both files before a Build and refuses an unknown file', () => {
        const emulator = MIPSEmulator('')
        expect(emulator._getRegisterFileValues('fpu')).toEqual(new Array(32).fill(0n))
        expect(emulator._getRegisterFileValues('cp0')).toEqual([0n, 0n, 0n, 0n, 0n, 0n])
        expect(() => emulator._getRegisterFileValues('cp1')).toThrow('Unknown register file: cp1')
    })

    it('writes a register of either file through the Core setters', async () => {
        const emulator = await run(FLOATS)
        emulator._setRegisterFileValue('fpu', '$f6', 0xffffffffn)
        emulator._setRegisterFileValue('cp0', '$13 (cause)', 0x8000000fn)
        //the setters bypass the backstepper, so a preset is visible at the next refresh and is not
        //an entry the simulation can step back over
        expect(emulator._getRegisterFileValues('fpu')[6]).toBe(0xffffffffn)
        expect(emulator._getRegisterFileValues('cp0')[4]).toBe(0x8000000fn)
    })
})

/**
 * Interrupts and MIPS32's timer against the real Core ([ADR 0074](../../../../../../docs/adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md)):
 * the "Interrupts and the timer" chapter's two programs, the keyboard's level-triggered requests,
 * a Step landing on the handler at 0x80000180 with the Log saying why, and Undo back out of it,
 * the timer taking the interrupt at the same instruction again since Count counts instructions.
 */
describe('MIPS interrupts and the timer', () => {
    const HANDLER = 0x80000180
    const cp0 = (emulator: Emulator, name: string) =>
        Number(
            emulator.registerFiles
                .find((file) => file.id === 'cp0')!
                .registers.find((register) => register.name === name)!.value
        )

    it('runs the chapter’s timer program, the same instructions every run and in a Testcase', async () => {
        //the Core counts every instruction since it loaded, so a run's own is the difference
        const executedBy = async () => {
            const emulator = await build(TIMER_EXAMPLE.MIPS)
            const before = emulator._getInstructionsExecuted()
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.errors).toEqual([])
            expect(emulator.stdOut).toBe('5')
            expect(emulator.terminated).toBe(true)
            return emulator._getInstructionsExecuted() - before
        }
        const executed = await executedBy()
        //Count counts instructions, so a second run takes exactly as many
        expect(await executedBy()).toBe(executed)
        //five ticks of 2,000 instructions each
        expect(Number(executed)).toBeGreaterThan(10_000)
        expect(Number(executed)).toBeLessThan(10_200)
        const testcase = await build(TIMER_EXAMPLE.MIPS)
        await testcase.runTestcase(SCREEN_TESTCASE, INSTRUCTION_LIMIT)
        expect(testcase.errors).toEqual([])
        expect(testcase.stdOut).toBe('5')
    })

    it('echoes every key through the receiver’s interrupt, keys typed before it was enabled included', async () => {
        const emulator = await run(KEYBOARD_EXAMPLE.MIPS, { typed: 'ab\n' })
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('ab\n')
        expect(emulator.terminated).toBe(true)
    })

    it('runs the chapter’s exception handler, which reports the exception and ends the program', async () => {
        const emulator = await run(EXCEPTION_EXAMPLE.MIPS)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('4')
        expect(emulator.terminated).toBe(true)
    })

    it('echoes a Testcase’s scripted input through the same interrupts', async () => {
        const emulator = await build(KEYBOARD_EXAMPLE.MIPS)
        await emulator.runTestcase({ ...SCREEN_TESTCASE, input: ['hi'] }, INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('hi\n')
    })

    it('steps into the timer handler, says so in the Log, and Undo steps back out', async () => {
        const emulator = await build(TIMER_EXAMPLE.MIPS)
        let steps = 0
        const pc = () => Number(emulator.pc) >>> 0
        while (pc() !== HANDLER && steps++ < 3000) await emulator.step()
        expect(pc()).toBe(HANDLER)
        const epc = cp0(emulator, '$14 (epc)')
        //the line the chapter quotes for this program
        expect(emulator.notes.map((note) => note.text)).toEqual([
            'Timer interrupt at 0x00400010 → handler at 0x80000180'
        ])
        expect(epc).toBe(0x00400010)
        expect(cp0(emulator, '$13 (cause)') & 0x807c).toBe(0x8000)
        expect(cp0(emulator, '$12 (status)') & 2).toBe(2)

        expect(emulator.undo(1)).toBe(1)
        expect(pc()).toBe(epc)
        expect(cp0(emulator, '$12 (status)') & 2).toBe(0)
        //the timer counts instructions, so the next Step takes it at the same place
        await emulator.step()
        expect(pc()).toBe(HANDLER)
        expect(cp0(emulator, '$14 (epc)')).toBe(epc)
    })

    //a display lab written for MARS: the transmitter's interrupt is turned on once and never off,
    //the handler prints the next character of a string at each one and, once the string is done,
    //just returns. MARS asks once per character taken, so this ends; asking for as long as the
    //console was ready re-entered the handler for ever
    it('runs a MARS display lab that never turns the transmitter’s interrupt off', async () => {
        const lab = `        .text
main:   li      $t0, 0xffff0000
        li      $t1, 2
        sw      $t1, 8($t0)     # transmitter control bit 1: interrupts on, for good
        la      $s0, message
        lb      $t2, 0($s0)     # print the first character: each one taken asks for the next
        addiu   $s0, $s0, 1
        sw      $t2, 12($t0)
wait:   lw      $t3, done
        beqz    $t3, wait
        li      $v0, 10
        syscall

        .data
message: .asciiz "hi"
done:   .word   0

        .ktext  0x80000180
        mfc0    $k0, $13        # Cause: bit 9 is the display
        andi    $k0, $k0, 0x200
        beqz    $k0, back
        lb      $k0, 0($s0)     # main left s0 to the handler: the next character
        beqz    $k0, finished
        lui     $k1, 0xffff
        sw      $k0, 12($k1)
        addiu   $s0, $s0, 1
back:   eret
finished:
        lui     $k1, 0x1001     # done, the word after the message
        li      $k0, 1
        sw      $k0, 4($k1)
        eret`
        const emulator = await build(lab)
        //the Core counts every instruction since it loaded, so the run's own are the difference
        const before = emulator._getInstructionsExecuted()
        await emulator.run(200_000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('hi')
        expect(emulator.terminated).toBe(true)
        //one interrupt for each of the two characters: the handler ran three times in all
        expect(Number(emulator._getInstructionsExecuted() - before)).toBeLessThan(1_000)
    })

    it('names the interrupt in its History row, and reads the handler’s addresses unsigned', async () => {
        const emulator = await build(TIMER_EXAMPLE.MIPS)
        let steps = 0
        while (emulator.pc !== BigInt(HANDLER) && steps++ < 3000) await emulator.step()
        //0x80000180, never the signed word -0x7ffffe80 the Core holds it as
        expect(emulator.pc).toBe(BigInt(HANDLER))
        //taking the interrupt ran no instruction: its row says what was taken and where it went,
        //and lists what taking it wrote, rather than reading as the interrupted instruction's
        const [entry] = emulator._getUndoHistory(1)
        expect(entry.kind).toBe('irq')
        expect(entry.pc).toBe(0x00400010)
        expect(entry.line).toBe(-1)
        expect(entry.mutations[0]).toEqual({
            type: 'TakeException',
            value: { vector: 0, name: 'Timer interrupt', from: 0x00400010n, handler: 0x80000180n }
        })
        expect(entry.mutations.map((mutation) => mutation.type)).toContain('WriteRegister')
        //the handler's instructions are rows of their own, at their unsigned addresses and lines
        await emulator.step()
        const [first] = emulator._getUndoHistory(1)
        const lines = TIMER_EXAMPLE.MIPS.split('\n')
        const lui = lines.findIndex((line) => line.includes('lui     $k1, 0x9000'))
        expect(first).toMatchObject({ kind: 'instruction', pc: HANDLER, line: lui })
        expect(emulator.getSourceLocationFromAddress(BigInt(HANDLER))?.line).toBe(lui)
        //and the decorations and the instruction it is on agree with the PC
        expect(emulator._getNextInstruction()?.address).toBe(BigInt(HANDLER + 4))
    })

    it('shows a call inside the handler at its unsigned addresses, in the Call stack and Symbols', async () => {
        const program = `        .text
main:   li      $t0, 50
        mtc0    $t0, $11
loop:   j       loop

        .ktext  0x80000180
        jal     tick            # a call inside the handler
        mfc0    $k0, $11
        addiu   $k0, $k0, 50
        mtc0    $k0, $11
        eret
tick:   jr      $ra
`
        const emulator = await build(program)
        const tick = Number(emulator._resolveMemoryLabel('tick'))
        expect(tick).toBe(HANDLER + 20)
        let steps = 0
        while (emulator.pc !== BigInt(tick) && steps++ < 3000) await emulator.step()
        expect(emulator.pc).toBe(BigInt(tick))
        //the handler the interrupt entered is a frame of its own, and the call it made the
        //innermost one
        expect(emulator.callStack.map((each) => each.name)).toEqual(['Interrupt handler', 'tick'])
        const frame = emulator.callStack[emulator.callStack.length - 1]
        //where the call returns to, after the `jal` at the handler's first word
        expect(frame).toMatchObject({
            address: BigInt(tick),
            destination: BigInt(HANDLER + 4),
            name: 'tick'
        })
        const lines = program.split('\n')
        const symbol = emulator.programSymbols?.labels.find((label) => label.name === 'tick')
        expect(symbol).toMatchObject({ address: BigInt(tick), kind: 'code' })
        expect(symbol?.definition?.line).toBe(lines.findIndex((line) => line.startsWith('tick:')))
    })

    it('stops a Run on a breakpoint at the handler’s first instruction', async () => {
        const emulator = await build(KEYBOARD_EXAMPLE.MIPS, { typed: 'q' })
        const lines = KEYBOARD_EXAMPLE.MIPS.split('\n')
        emulator.toggleBreakpoint(lines.findIndex((line) => line.includes('lui     $k1, 0xffff')))
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(Number(emulator.pc) >>> 0).toBe(HANDLER)
        expect(emulator.terminated).toBe(false)
    })
})

describe('MIPS diagnostic spans', () => {
    //`_checkCode` builds its own throwaway Core, which is the path that squiggles a program that
    //does not assemble, so the spans are read from `check()` rather than from a Build
    const BAD = [
        '        .text',
        'main:',
        '        addi    $t0, $t1, notanumber',
        '        bogusinstr $t0',
        ''
    ].join('\n')

    it('spans the whole token a diagnostic points at', async () => {
        const emulator = MIPSEmulator(BAD)
        const diagnostics = await emulator.check()
        const operand = diagnostics.find((d) => d.message.includes('notanumber'))
        //`notanumber` is the 27th through 36th character of its line
        expect(operand?.lineIndex).toBe(2)
        expect(operand?.column).toBe(27)
        expect(operand?.endColumn).toBe(37)
        const operator = diagnostics.find((d) => d.message.includes('bogusinstr'))
        expect(operator?.column).toBe(9)
        expect(operator?.endColumn).toBe(19)
    })
})

/**
 * Pokes against the real Core ([the design record](../../../../../../docs/design/pokes.md)): a register or
 * memory value changed between two instructions is one entry of MARS's own undo history, listed as
 * a row of its own and undone like an instruction
 * ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)).
 */
describe('MIPS Pokes', () => {
    const POKEABLE =
        `        .data
buffer: .space  2048
        .text
main:
        li      $t0, 5
        li      $t1, 6
        addu    $t2, $t0, $t1
` + EXIT

    /** Past the 64 words the 64 by 64 display mirrors, so a memory Poke there draws nothing. */
    const BUFFER = 0x10010400n

    /** Opens a File, writes to it and closes it, one syscall each, without ending the program. */
    const WRITE_FILE =
        `        .data
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
` + EXIT

    function registerOf(emulator: Emulator, name: string) {
        const register = emulator.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name}`)
        return register
    }

    function fileValue(emulator: Emulator, id: string, name: string): bigint {
        const file = emulator.registerFiles.find((candidate) => candidate.id === id)
        const register = file?.registers.find((candidate) => candidate.name === name)
        if (!register) throw new Error(`No register named ${name} in ${id}`)
        return register.value
    }

    it('records a poked CPU register as a step of its own and undoes it', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        expect(registerOf(emulator, '$t0').value).toBe(5n)
        expect(emulator.canPoke).toBe(true)
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 0x2an }])
        ).toBe(true)
        expect(registerOf(emulator, '$t0').value).toBe(0x2an)

        const [poke] = emulator.latestSteps
        expect(poke.kind).toBe('poke')
        //no instruction ran, so the row has neither a PC nor a line to jump to
        expect(poke.pc).toBe(-1)
        expect(poke.line).toBe(-1)
        expect(poke.writes).toEqual([{ type: 'register', name: '$t0', old: 5n, new: 0x2an }])
        expect(poke.mutations).toEqual([
            {
                type: 'WriteRegister',
                value: { register: '$t0', old: 5n, new: 0x2an, size: RegisterSize.Long }
            }
        ])

        expect(emulator.canUndo).toBe(true)
        expect(emulator.undo(1)).toBe(1)
        expect(registerOf(emulator, '$t0').value).toBe(5n)
        //the Poke is gone from the history and the instruction under it is back on top
        expect(emulator.latestSteps[0].kind).toBe('instruction')
    })

    it('never offers the program counter, hi or lo, which MARS has no setter for', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, '$t0')).toBe(true)
        for (const register of ['pc', 'hi', 'lo', '$zero']) {
            expect(emulator.canPokeRegister(CPU_REGISTER_FILE_ID, register)).toBe(false)
        }
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'pc', value: 0n }])).toBe(
            false
        )
        //a value that leaves the register as it is changes nothing and records nothing
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 5n }])).toBe(
            false
        )
        expect(emulator.latestSteps[0].kind).toBe('instruction')
    })

    it('records nothing when the panel pokes back the hex a negative register shows', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        //MARS keeps its registers in an `Int32Array`, so a register of all ones reads `-1n` here
        //while the row draws `ffffffff` and sends that back unsigned: the two are the same bits
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 0xffffffffn }])
        ).toBe(true)
        expect(registerOf(emulator, '$t0').value).toBe(-1n)
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 0xffffffffn }])
        ).toBe(false)
        //one Poke, one row: the second commit left the history where the first put it
        expect(emulator.latestSteps.filter((step) => step.kind === 'poke')).toHaveLength(1)
    })

    it('pokes a register of the FPU and of the CP0 file, each as one step', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        expect(emulator.pokeRegisters('fpu', [{ register: '$f2', value: 0x40400000n }])).toBe(true)
        expect(fileValue(emulator, 'fpu', '$f2')).toBe(0x40400000n)
        expect(emulator.latestSteps[0].writes).toEqual([
            { type: 'register', name: '$f2', old: 0n, new: 0x40400000n }
        ])

        expect(
            emulator.pokeRegisters('cp0', [{ register: '$13 (cause)', value: 0x8000000fn }])
        ).toBe(true)
        expect(fileValue(emulator, 'cp0', '$13 (cause)')).toBe(0x8000000fn)
        //the Core spells a coprocessor 0 register with its MIPS number, which is how the file
        //spells it too
        expect(emulator.latestSteps[0].writes).toEqual([
            { type: 'register', name: '$13 (cause)', old: 0n, new: 0x8000000fn }
        ])

        //two Pokes, two entries: each Undo takes one of them back
        emulator.undo(1)
        expect(fileValue(emulator, 'cp0', '$13 (cause)')).toBe(0n)
        expect(fileValue(emulator, 'fpu', '$f2')).toBe(0x40400000n)
        emulator.undo(1)
        expect(fileValue(emulator, 'fpu', '$f2')).toBe(0n)
    })

    it('pokes a run of memory bytes as one step, whatever its length', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        expect(emulator.pokeMemory(BUFFER, new Uint8Array([1, 2, 3, 4]))).toBe(true)
        expect([...emulator.readMemoryBytes(BUFFER, 4)]).toEqual([1, 2, 3, 4])

        const [poke] = emulator.latestSteps
        expect(poke.kind).toBe('poke')
        expect(poke.writes).toEqual([
            { type: 'memory', address: BUFFER, old: [0, 0, 0, 0], new: [1, 2, 3, 4] }
        ])
        expect(poke.mutations).toEqual([
            {
                type: 'WriteMemoryBytes',
                value: { address: BUFFER, old: [0, 0, 0, 0], new: [1, 2, 3, 4] }
            }
        ])

        //four bytes are one entry, so one Undo takes all four back
        expect(emulator.undo(1)).toBe(1)
        expect([...emulator.readMemoryBytes(BUFFER, 4)]).toEqual([0, 0, 0, 0])
    })

    it('restores the poked value when the step made after the Poke is undone too', async () => {
        const emulator = await build(POKEABLE)
        await emulator.step()
        emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 0x2an }])
        //`addu $t2, $t0, $t1` runs on the poked value, which is what a Poke is for
        await emulator.step()
        await emulator.step()
        expect(registerOf(emulator, '$t2').value).toBe(0x30n)
        expect(emulator.latestSteps.map((step) => step.kind)).toEqual([
            'instruction',
            'instruction',
            'poke',
            'instruction'
        ])

        //the two instructions and then the Poke, each one step
        expect(emulator.undo(3)).toBe(3)
        expect(registerOf(emulator, '$t0').value).toBe(5n)
        expect(registerOf(emulator, '$t2').value).toBe(0n)
    })

    it('groups one instruction into one row, as `undo` pops it', async () => {
        const emulator = await build(
            `        .text
main:
        jal     target
target:
` + EXIT
        )
        await emulator.step()
        //`jal` restores both `$ra` and the program counter, which used to be two History rows and
        //made "Undo to here" on row N undo N instructions rather than N rows
        expect(emulator.latestSteps).toHaveLength(1)
        const [step] = emulator.latestSteps
        expect(step.kind).toBe('instruction')
        expect(step.mutations.map((mutation) => mutation.type)).toEqual([
            'WriteRegister',
            'WriteRegister'
        ])
    })

    it('reads a store at or above 0x80000000 as the address it is', async () => {
        const emulator = await run(
            DATA +
                `        li      $s0, ${MARS_TRANSMITTER_DATA | 0}
        li      $t1, 0x41
        sw      $t1, 0($s0)
` +
                EXIT
        )
        const stores = emulator.latestSteps
            .flatMap((step) => step.mutations)
            .filter((mutation) => mutation.type === 'WriteMemory')
        expect(stores).toEqual([
            {
                type: 'WriteMemory',
                value: { address: 0xffff000cn, size: RegisterSize.Long, old: 0n, new: 0x41n }
            }
        ])
    })

    it('shows what sbrk wrote, not the heap break the Core keeps of its layout', async () => {
        const emulator = await build(
            `        .text
main:
        li      $a0, 16
        li      $v0, 9
        syscall
` + EXIT
        )
        for (let step = 0; step < 3; step++) await emulator.step()
        const [sbrk] = emulator.latestSteps
        //the block sbrk hands out first is MARS's heap base, in the register that held the service
        expect(sbrk.mutations).toEqual([
            {
                type: 'WriteRegister',
                value: { register: '$v0', old: 9n, new: 0x10040000n, size: RegisterSize.Long }
            }
        ])
    })

    it('repaints the bitmap display on a Poke into it and on its Undo', async () => {
        const emulator = await build(DATA + EXIT)
        expect(pixelAt(emulator, 0, 0)).toBe(0x000000)
        //the framebuffer is little endian, so the low byte of the word comes first
        expect(emulator.pokeMemory(0x10010000n, new Uint8Array([0x44, 0x33, 0x22, 0x11]))).toBe(
            true
        )
        expect(pixelAt(emulator, 0, 0)).toBe(0x223344)
        emulator.undo(1)
        expect(pixelAt(emulator, 0, 0)).toBe(0x000000)
    })

    it('leaves the FileSystem journal alone when a Poke is undone', async () => {
        const fileSystem = new FileSystem()
        //the File does not exist until the open syscall runs, and it is gone again once that
        //syscall is rolled back
        const written = () =>
            fileSystem.files['output.txt'] ? fileSystem.readText('output.txt') : ''
        const emulator = await build(WRITE_FILE, { fileSystem })
        for (let step = 0; step < 16 && written() !== 'hello'; step++) {
            await emulator.step()
        }
        expect(written()).toBe('hello')

        emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: '$t0', value: 0x2an }])
        //a Poke has no instruction identity, so undoing it rolls back nothing of the session whose
        //frames are keyed by the syscall's address
        expect(emulator.undo(1)).toBe(1)
        expect(written()).toBe('hello')
        //the write syscall is still the entry under it, and undoing far enough still takes it back
        for (let step = 0; step < 16 && written() === 'hello'; step++) emulator.undo(1)
        expect(written()).toBe('')
    })
})

describe('MIPS MIDI services', () => {
    const notes = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) =>
            c.type === 'note' ? [[c.pitch, c.durationMs, c.instrument, c.volume]] : []
        )

    it('plays 31 and 33 with MARS ranges and defaults applied', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(
            DATA +
                `        li      $a0, 200
        li      $a1, 50
        li      $a2, 40
        li      $a3, 90
        li      $v0, 31
        syscall
        li      $a0, 64
        li      $a1, 30
        li      $v0, 33
        syscall
` +
                EXIT,
            { audio: new Audio({ output }) }
        )
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(notes(output)).toEqual([
            [60, 50, 40, 90],
            [64, 30, 40, 90]
        ])
    })

    it('waits out a 33 on a testcase virtual clock, in silence', async () => {
        const output = new RecordingAudioOutput()
        const code =
            DATA +
            `        li      $a0, 60
        li      $a1, 5000
        li      $a2, 0
        li      $a3, 100
        li      $v0, 33
        syscall
        li      $v0, 30
        syscall
        li      $v0, 1
        syscall
` +
            EXIT
        const emulator = await build(code, { audio: new Audio({ output }) })
        const started = performance.now()
        const results = await emulator.test(
            code,
            [
                {
                    input: [],
                    expectedOutput: String((946684800000 + 5000) | 0),
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT
        )
        expect(performance.now() - started).toBeLessThan(2000)
        expect(results[0]?.errors ?? []).toEqual([])
        expect(results[0]?.passed).toBe(true)
        expect(notes(output)).toEqual([])
    })

    it('takes a Note back with the syscall that played it', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await build(
            DATA +
                `        li      $a0, 60
        li      $a1, 5000
        li      $a2, 0
        li      $a3, 100
        li      $v0, 31
        syscall
        nop
` +
                EXIT,
            { audio: new Audio({ output }) }
        )
        //`li` of a large value is two instructions on RISC-V, so step until the service has run
        for (let i = 0; i < 10 && notes(output).length === 0; i++) await emulator.step()
        expect(notes(output)).toEqual([[60, 5000, 0, 100]])
        emulator.undo(1)
        expect(output.commands.filter((c) => c.type === 'stop')).toHaveLength(1)
    })
})

describe('MIPS Synth', () => {
    it('runs the Synth chapter’s example, a note that starts and fades', async () => {
        const overview = synthEntries('MIPS', 'mips', '/documentation')[0]
        const example = /```\w+\n([\s\S]*?)```/.exec(overview.searchText)![1]
        const output = new RecordingAudioOutput()
        const emulator = await run(DATA + example, {
            audio: new Audio({ output }),
            virtualClock: true
        })
        expect(emulator.errors).toEqual([])
        const writes = output.commands.flatMap((c) => (c.type === 'synth' ? c.writes : []))
        const gates = writes.filter((value, i) => i % 2 === 1 && writes[i - 1] === 0x10)
        expect(gates).toEqual([1, 0])
    })

    const synthWrites = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'synth' ? c.writes : []))
    const uploads = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'synthUpload' ? [[c.offset, ...c.bytes]] : []))
    /** Channel 0 at 440 Hz and volume 100 with its gate on, then the frequency read back and printed. */
    const TONE = `        li      $t0, 0xffff0100
        li      $t1, 440
        sh      $t1, 0($t0)
        li      $t1, 100
        sb      $t1, 0x12($t0)
        li      $t1, 1
        sb      $t1, 0x10($t0)
        lhu     $a0, 0($t0)
        li      $v0, 1
        syscall
`

    it('hands every store in the block to the Synth, which the program reads back', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(DATA + TONE + EXIT, { audio: new Audio({ output }) })
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('440')
        expect(synthWrites(output)).toEqual([0, 440, 0x12, 100, 0x10, 1])
        expect(output.commands.at(-1)).toEqual({ type: 'releaseChips' })
    })

    it('names its block as a device region in the memory view, beside the MMIO words', async () => {
        const emulator = await build(DATA + TONE + EXIT, { audio: new Audio() })
        expect(
            emulator.memoryRegions
                .filter((region) => region.kind === 'device')
                .map((region) => [region.name, region.start, region.end])
        ).toEqual([
            ['MMIO', 0xffff0000n, 0xffff0010n],
            ['Synth', 0xffff0100n, 0xffff0300n],
            ['Input controller', 0xffff0300n, 0xffff0340n],
            ['MIDI port', 0xffff0340n, 0xffff0350n],
            ['Sampled-audio output', 0xffff0350n, 0xffff0360n],
            ['Bitmap display', 0x10010000n, 0x10010100n]
        ])
    })

    it('is off while the bitmap display covers its block, at the memory map base', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(DATA + TONE + EXIT, {
            audio: new Audio({ output }),
            display: { ...SMALL, baseAddress: 0xffff0000, width: 128, height: 128 }
        })
        expect(emulator.errors).toEqual([])
        expect(synthWrites(output)).toEqual([])
        expect(emulator.memoryRegions.map((region) => region.name)).not.toContain('Synth')
    })

    it('plays a Poke into its registers at once, and starts no upload from one', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await build(DATA + '        nop\n        nop\n' + EXIT, {
            audio: new Audio({ output })
        })
        await emulator.step()
        //a length, then the start register, as a program would start an upload
        expect(emulator.pokeMemory(0xffff0284n, new Uint8Array([4, 0]))).toBe(true)
        expect(emulator.pokeMemory(0xffff0100n, new Uint8Array([0xb8, 0x01]))).toBe(true)
        expect(emulator.pokeMemory(0xffff0288n, new Uint8Array([1]))).toBe(true)
        //heard while the program waits, without a Run or a Step: the Poke writes a byte at a time,
        //and its last write leaves 440
        expect(synthWrites(output).slice(-2)).toEqual([0, 440])
        expect(uploads(output)).toEqual([])
    })

    it('decodes a word store into the registers it covers', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(
            DATA +
                `        li      $t0, 0xffff0100
        li      $t1, 0x08000370
        sw      $t1, 0x20($t0)
` +
                EXIT,
            { audio: new Audio({ output }) }
        )
        expect(emulator.errors).toEqual([])
        expect(synthWrites(output)).toEqual([0x20, 0x370, 0x22, 0x800])
    })

    it('keeps a gate pulsed off and on, in order', async () => {
        const output = new RecordingAudioOutput()
        await run(
            DATA +
                `        li      $t0, 0xffff0100
        li      $t1, 1
        sb      $t1, 0x10($t0)
        sb      $zero, 0x10($t0)
        sb      $t1, 0x10($t0)
` +
                EXIT,
            { audio: new Audio({ output }) }
        )
        expect(synthWrites(output)).toEqual([0x10, 1, 0x10, 0, 0x10, 1])
    })

    it('copies an upload when it is started, before the program changes its buffer', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(
            `        .data
wave:   .byte   1, 2, 3, 4
        .text
main:   li      $t0, 0xffff0100
        la      $t1, wave
        sw      $t1, 0x180($t0)
        li      $t2, 4
        sh      $t2, 0x184($t0)
        li      $t2, 100
        sh      $t2, 0x186($t0)
        sb      $zero, 0x188($t0)
        li      $t2, 9
        sb      $t2, 0($t1)
` + EXIT,
            { audio: new Audio({ output }) }
        )
        expect(emulator.errors).toEqual([])
        expect(uploads(output)).toEqual([[100, 1, 2, 3, 4]])
    })

    it('plays its rewound registers after an Undo, without uploading again', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await build(
            `        .data
wave:   .byte   1, 2
        .text
main:   li      $t0, 0xffff0100
        la      $t1, wave
        sw      $t1, 0x180($t0)
        li      $t2, 2
        sh      $t2, 0x184($t0)
        sb      $zero, 0x188($t0)
        li      $t1, 100
        sb      $t1, 0x12($t0)
        li      $t1, 1
        sb      $t1, 0x10($t0)
        sb      $zero, 0x10($t0)
        nop
` + EXIT,
            { audio: new Audio({ output }) }
        )
        const gates = () =>
            synthWrites(output).filter((value, i, all) => i % 2 === 1 && all[i - 1] === 0x10)
        for (let i = 0; i < 20 && gates().length < 2; i++) await emulator.step()
        expect(gates()).toEqual([1, 0])
        expect(uploads(output)).toHaveLength(1)
        emulator.undo(1)
        //every register again, the gate back on among them
        expect(gates()).toEqual([1, 0, 1])
        expect(uploads(output)).toHaveLength(1)
        expect(emulator.peripherals.audio.activity.playingForMs).toBe(Infinity)
    })

    it('plays nothing in a Testcase, whose reads still see the registers', async () => {
        const output = new RecordingAudioOutput()
        const code = DATA + TONE + EXIT
        const emulator = await build(code, { audio: new Audio({ output }) })
        const results = await emulator.test(
            code,
            [{ ...SCREEN_TESTCASE, expectedOutput: '440' }],
            INSTRUCTION_LIMIT
        )
        expect(results[0]?.errors ?? []).toEqual([])
        expect(results[0]?.passed).toBe(true)
        expect(synthWrites(output)).toEqual([])
    })
})

/**
 * The Input controller at 0xffff0300 against the real Core
 * ([the design record](../../../../../../docs/design/input-controller.md)): what the program reads
 * after the Screen's keys and pointer reach the Keyboard and the Mouse, Undo putting back what a
 * read took, and the gates that keep input away before Run, after the end and in a Testcase.
 */
describe('MIPS Input controller', () => {
    it('runs the chapter’s first program: the arrows pressed, until Escape', async () => {
        const entry = inputControllerEntries('MIPS', 'mips', '/documentation').find(
            (candidate) => candidate.anchor === 'first-program'
        )!
        const example = /```\w+\n([\s\S]*?)```/.exec(entry.searchText)![1]
        const keyboard = new Keyboard()
        const emulator = await build(example, { keyboard, virtualClock: true })
        await emulator.step()
        for (const code of ['ArrowLeft', 'ArrowUp', 'KeyA', 'ArrowRight', 'Escape']) {
            keyboard.keyDown({ code, key: code })
            keyboard.keyUp({ code, key: code })
        }
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('LUR')
        expect(emulator.terminated).toBe(true)
    })

    it('says so when the simulator has no Input controller, as under a covering display', async () => {
        const entry = inputControllerEntries('MIPS', 'mips', '/documentation').find(
            (candidate) => candidate.anchor === 'first-program'
        )!
        const example = /```\w+\n([\s\S]*?)```/.exec(entry.searchText)![1]
        const emulator = await run(example, {
            display: { ...SMALL, baseAddress: 0xffff0000, width: 512, height: 512 }
        })
        expect(emulator.stdOut).toBe('This simulator has no Input controller.\n')
    })

    const READS = `        li      $s0, 0xffff0300
        lw      $t0, 0($s0)
        lw      $t1, 8($s0)
        lw      $t2, 12($s0)
        lw      $t3, 12($s0)
        lw      $t4, 16($s0)
        lw      $t5, 0x28($s0)
        lw      $t6, 12($s0)
        lw      $t7, 8($s0)
`
    const valueOf = (emulator: Emulator, name: string) =>
        Number(emulator.registers.find((r) => r.name === name)?.value ?? -1n) >>> 0
    const record = (kind: number, code: number, x = 0, y = 0) =>
        ((y << 21) | (x << 11) | (kind << 8) | code) >>> 0
    const arrowLeft = { code: 'ArrowLeft', key: 'ArrowLeft' }

    it('reads its ID, the queued events in order, the pointer and the key map', async () => {
        const keyboard = new Keyboard()
        const emulator = await build(DATA + READS + EXIT, { keyboard })
        //the program has started: the first instruction of `li` ran
        await emulator.step()
        keyboard.keyDown(arrowLeft)
        emulator.peripherals.mouse.buttonDown('left', 3, 2)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(valueOf(emulator, '$t0')).toBe(0x494e5001)
        expect(valueOf(emulator, '$t1')).toBe(2)
        expect(valueOf(emulator, '$t2')).toBe(record(1, 0x50))
        expect(valueOf(emulator, '$t3')).toBe(record(4, 1, 3, 2))
        expect(valueOf(emulator, '$t4')).toBe(((2 << 21) | (3 << 11) | 1) >>> 0)
        expect(valueOf(emulator, '$t5')).toBe(1 << (0x50 - 64))
        //an empty queue reads 0
        expect(valueOf(emulator, '$t6')).toBe(0)
        expect(valueOf(emulator, '$t7')).toBe(0)
    })

    it('hears nothing before the program starts, such as the click that focused the Screen', async () => {
        const keyboard = new Keyboard()
        const emulator = await build(DATA + READS + EXIT, { keyboard })
        emulator.peripherals.mouse.buttonDown('left', 1, 1)
        emulator.peripherals.mouse.buttonUp('left', 1, 1)
        keyboard.keyDown(arrowLeft)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(valueOf(emulator, '$t1')).toBe(0)
        expect(valueOf(emulator, '$t4')).toBe(0)
        expect(valueOf(emulator, '$t5')).toBe(0)
    })

    it('puts back an event a read took when Undo rewinds past the read', async () => {
        const keyboard = new Keyboard()
        const emulator = await build(DATA + READS + EXIT, { keyboard })
        await emulator.step()
        keyboard.keyDown(arrowLeft)
        keyboard.keyUp(arrowLeft)
        await emulator.run(INSTRUCTION_LIMIT)
        const word = (offset: number) => {
            const bytes = emulator.readMemoryBytes(BigInt(0xffff0300 + offset), 4)
            return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0
        }
        expect(word(8)).toBe(0)
        //the exit's two instructions, the reads of $t7, $t6, $t5, $t4 and the second event's read
        emulator.undo(7)
        expect(word(8)).toBe(1)
        expect(word(12)).toBe(record(2, 0x50))
        //and the first one's: the queue holds both again, in order
        emulator.undo(1)
        expect(word(8)).toBe(2)
        expect(word(12)).toBe(record(1, 0x50))
        //the key map shows the present: the key is up
        expect(word(0x28)).toBe(0)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(valueOf(emulator, '$t2')).toBe(record(1, 0x50))
        expect(valueOf(emulator, '$t3')).toBe(record(2, 0x50))
    })

    it('ignores program stores and Pokes, and stops a program that enables interrupts', async () => {
        const keyboard = new Keyboard()
        const emulator = await build(
            DATA +
                `        li      $s0, 0xffff0300
        sw      $zero, 0($s0)
        li      $t0, 77
        sw      $t0, 8($s0)
        lw      $t1, 0($s0)
        lw      $t2, 8($s0)
        li      $t0, 2
        sw      $t0, 4($s0)
` +
                EXIT,
            { keyboard }
        )
        expect(emulator.pokeMemory(0xffff0308n, new Uint8Array([9, 0, 0, 0]))).toBe(true)
        expect(emulator.readMemoryBytes(0xffff0308n, 4)[0]).toBe(0)
        //a Poke setting the interrupt-enable bit stops nothing
        expect(emulator.pokeMemory(0xffff0304n, new Uint8Array([2, 0, 0, 0]))).toBe(true)
        expect(emulator.readMemoryBytes(0xffff0304n, 4)[0]).toBe(0)
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.readMemoryBytes(0xffff0300n, 4)).toEqual(
            new Uint8Array([1, 0x50, 0x4e, 0x49])
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(valueOf(emulator, '$t1')).toBe(0x494e5001)
        expect(valueOf(emulator, '$t2')).toBe(0)
        expect(emulator.errors.join('\n')).toContain(
            'The Input controller does not raise interrupts'
        )
        expect(emulator.readMemoryBytes(0xffff0304n, 4)[0]).toBe(0)
    })

    it('is a device region of the memory view, beside the MMIO words and the Synth', async () => {
        const emulator = await build(DATA + EXIT, { audio: new Audio() })
        expect(
            emulator.memoryRegions
                .filter((region) => region.kind === 'device')
                .map((region) => region.name)
        ).toContain('Input controller')
    })

    it('is off while a display at the memory map base covers it, and back when it is moved away', async () => {
        const keyboard = new Keyboard()
        const covering = { ...SMALL, baseAddress: 0xffff0000, width: 512, height: 512 }
        const emulator = await build(
            DATA +
                `        li      $s0, 0xffff0300
        lw      $t0, 0($s0)
        lw      $t1, 12($s0)
        nop
        lw      $t2, 0($s0)
        lw      $t3, 8($s0)
` +
                EXIT,
            { keyboard, display: covering }
        )
        expect(emulator.memoryRegions.map((region) => region.name)).not.toContain(
            'Input controller'
        )
        await emulator.step()
        keyboard.keyDown(arrowLeft)
        for (let i = 0; i < 4; i++) await emulator.step()
        //a pixel, not the ID, and no key press wrote one
        expect(valueOf(emulator, '$t0')).toBe(0)
        expect(valueOf(emulator, '$t1')).toBe(0)
        emulator.setDisplay(SMALL)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(valueOf(emulator, '$t2')).toBe(0x494e5001)
        //the key went down while it was off, and was kept
        expect(valueOf(emulator, '$t3')).toBe(1)
    })

    it('is idle in a Testcase, which has no keyboard or mouse', async () => {
        const keyboard = new Keyboard()
        const code =
            DATA +
            `        li      $s0, 0xffff0000
        lw      $t0, 4($s0)
        li      $s0, 0xffff0300
        lw      $a0, 8($s0)
        li      $v0, 1
        syscall
        lw      $a0, 16($s0)
        syscall
` +
            EXIT
        const emulator = await build(code, { keyboard })
        await emulator.step()
        keyboard.keyDown(arrowLeft)
        emulator.peripherals.mouse.moveTo(5, 5)
        //a key pressed while the Testcase runs, when the program reads the receiver
        const unsubscribe = emulator.peripherals.terminal.onInputChange(() => {
            keyboard.keyDown({ code: 'KeyQ', key: 'q' })
            emulator.peripherals.mouse.buttonDown('left', 6, 6)
        })
        try {
            const results = await emulator.test(
                code,
                [{ ...SCREEN_TESTCASE, input: ['x'], expectedOutput: '00' }],
                INSTRUCTION_LIMIT
            )
            expect(results[0]?.errors ?? []).toEqual([])
            expect(results[0]?.passed).toBe(true)
        } finally {
            unsubscribe()
        }
    })
})

describe('MIPS MIDI port and sampled-audio output', () => {
    const examples = soundDeviceExamples('MIPS')
    const messages = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'midi' ? [[...c.message]] : []))
    const chunks = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'pcm' ? [c] : []))
    const frames = (output: RecordingAudioOutput) =>
        chunks(output).reduce((total, chunk) => total + chunk.frames.length / 2, 0)
    const SCALE = [60, 62, 64, 65, 67, 69, 71, 72]
    /**
     * A sound program runs a hundred thousand instructions or so, each of whose memory accesses the
     * Core checks against every observer on its memory, which every Emulator of the package shares:
     * by the end of this file, the earlier tests' Emulators have left about a thousand there.
     */
    const HEAVY = 30_000
    const testcase = (expectedOutput: string): Testcase => ({
        input: [],
        expectedOutput,
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: []
    })

    it('runs the chapter’s MIDI example, a scale on a piano, each byte once the port can take it', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(examples.midi, {
            audio: new Audio({ output }),
            virtualClock: true
        })
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(messages(output)).toEqual([
            [0xc0, 0],
            ...SCALE.flatMap((key) => [
                [0x90, key, 100],
                [0x80, key, 0]
            ])
        ])
        //each note heard when its last byte has left, 0.32 ms a byte, and held for its 300 ms
        const at = output.commands.flatMap((c) => (c.type === 'midi' ? [c.at] : []))
        expect(at[1]).toBeCloseTo(5 * 0.32, 9)
        //the note off, after the sleep, on a line idle since: three bytes from then
        expect(at[2]).toBeCloseTo(300 + 3 * 0.32, 9)
        expect(output.prepared).toContainEqual({ kind: 'midiPort' })
        //the program's end lets the port's last notes go
        expect(output.commands.at(-1)).toMatchObject({ type: 'programEnd' })
    })

    it(
        'runs the chapter’s sampled-audio example, two seconds of a 400 Hz square wave',
        async () => {
            const output = new RecordingAudioOutput()
            const emulator = await run(examples.pcm, {
                audio: new Audio({ output }),
                virtualClock: true
            })
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            expect(frames(output)).toBe(16_000)
            const [first, ...rest] = chunks(output)
            expect(first).toMatchObject({ start: 0, rate: 8000 })
            //mono frames are heard on both sides: ten samples high, ten low
            const left = [...first.frames].filter((_, index) => index % 2 === 0).slice(0, 20)
            expect(left).toEqual([...new Array(10).fill(0.25), ...new Array(10).fill(-0.25)])
            //one unbroken stream: each chunk starts where the one before it ended
            let end = first.start + (first.frames.length / 2 / 8000) * 1000
            for (const chunk of rest) {
                expect(chunk.start).toBeCloseTo(end, 6)
                end = chunk.start + (chunk.frames.length / 2 / 8000) * 1000
            }
        },
        HEAVY
    )

    it(
        'keeps the timing of both in a Testcase, which waits on its virtual clock instead of spinning',
        async () => {
            //5,000 bytes through the port and 8,000 words into the FIFO, waiting on Status and Free
            //alone: the first 4,096 bytes and 8,192 frames fit at once, the rest drain at their speeds
            const code = `        .text
main:   li      $v0, 30
        syscall
        move    $s7, $a0
        li      $s0, 0xffff0340
        li      $s1, 5000
byte:   lw      $t0, 4($s0)
        andi    $t0, $t0, 0x40
        bnez    $t0, byte
        li      $t1, 0xfe
        sb      $t1, 0($s0)
        addiu   $s1, $s1, -1
        bnez    $s1, byte
        li      $v0, 30
        syscall
        subu    $a0, $a0, $s7
        li      $v0, 1
        syscall
        li      $a0, 32
        li      $v0, 11
        syscall
        li      $v0, 30
        syscall
        move    $s7, $a0
        li      $s0, 0xffff0350
        li      $t0, 1
        sw      $t0, 0($s0)
        li      $s1, 8000
word:   lw      $t0, 8($s0)
        beqz    $t0, word
        sw      $zero, 12($s0)
        addiu   $s1, $s1, -1
        bnez    $s1, word
        li      $v0, 30
        syscall
        subu    $a0, $a0, $s7
        li      $v0, 1
        syscall
        li      $v0, 10
        syscall
`
            const output = new RecordingAudioOutput()
            const emulator = await build(code, { audio: new Audio({ output }) })
            //about 90,000 instructions: a program that spun on Status or Free would run into this limit
            const results = await emulator.test(code, [testcase('289 976')], 200_000)
            expect(results[0]?.errors ?? []).toEqual([])
            expect(results[0]?.passed).toBe(true)
            //a Testcase is silent
            expect(messages(output)).toEqual([])
            expect(frames(output)).toBe(0)
        },
        HEAVY
    )

    it(
        'runs both chapter examples in a Testcase, silent and finished',
        async () => {
            for (const code of [examples.midi, examples.pcm]) {
                const emulator = await build(code, { audio: new Audio() })
                const results = await emulator.test(code, [testcase('')], INSTRUCTION_LIMIT)
                expect(results[0]?.errors ?? []).toEqual([])
                expect(results[0]?.passed).toBe(true)
            }
        },
        HEAVY
    )

    it('takes back a note on Undo: one not heard yet is cut, one already heard is stopped', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await build(examples.midi, {
            audio: new Audio({ output }),
            virtualClock: true
        })
        const heard = (message: number[]) =>
            messages(output).some((m) => m.join() === message.join())
        for (let i = 0; i < 200 && !heard([0x90, 60, 100]); i++) await emulator.step()
        expect(heard([0x90, 60, 100])).toBe(true)
        //no time has passed on the virtual clock: the velocity byte is still in the port
        emulator.undo(1)
        expect(output.commands.at(-1)).toEqual({ type: 'cut', after: 4 * 0.32, device: 'midi' })
        expect(heard([0x80, 60, 0])).toBe(false)
        //step on through the 300 ms the note sounds, then back over it: the note it started ends
        for (let i = 0; i < 200 && emulator.peripherals.clock.now() < 300; i++)
            await emulator.step()
        expect(emulator.peripherals.clock.now()).toBe(300)
        let undone = 0
        while (!heard([0x80, 60, 0]) && undone < 20) undone += emulator.undo(1)
        expect(heard([0x80, 60, 0])).toBe(true)
        expect(messages(output).filter((m) => m[0] === 0x90)).toHaveLength(2)
    })

    it('is off while the bitmap display covers both blocks at the memory map base', async () => {
        const output = new RecordingAudioOutput()
        const emulator = await run(examples.midi, {
            audio: new Audio({ output }),
            virtualClock: true,
            display: { ...SMALL, baseAddress: 0xffff0000, width: 128, height: 128 }
        })
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(messages(output)).toEqual([])
        const names = emulator.memoryRegions.map((region) => region.name)
        expect(names).not.toContain('MIDI port')
        expect(names).not.toContain('Sampled-audio output')
    })
})
