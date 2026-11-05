import { describe, expect, it } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { RISCVCsrRegisterNames } from '#lib/languages/RISC-V/RISC-V-registers.ts'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'
import type { MarsDevices } from '#lib/languages/mars/MarsDevices.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { projectBuildSources } from '#lib/buildSources.ts'
import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import { provideRuntimeLibrary } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { fileFingerprint, type CompilationRecord } from '#lib/sourceCompilation/records.ts'

/**
 * The stage-2 features together on MIPS and RISC-V
 * ([asmOS stage 2](../../../../../../docs/design/asmos-stage2.md)): timers and interrupts beside the
 * sampled-audio output and the MIDI port, and a hand-written unit a C Program links by need that
 * holds an interrupt handler.
 */

const SMALL: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 64,
    height: 64,
    baseAddress: 0x10010000
}
const LIMIT = 5_000_000
const MIPS_HANDLER = 0x80000180

type Language = 'MIPS' | 'RISC-V'
type Emulator = ReturnType<typeof MIPSEmulator> | ReturnType<typeof RISCVEmulator>

async function build(
    language: Language,
    code: string,
    options: { clock?: ProgramClock; audio?: Audio } = {}
): Promise<Emulator> {
    const make = language === 'MIPS' ? MIPSEmulator : RISCVEmulator
    const emulator = make(code, {
        display: SMALL,
        peripherals: {
            clock: options.clock ?? new ProgramClock({ mode: 'virtual' }),
            audio: options.audio
        }
    })
    await emulator.check()
    await emulator.compile(2_000, code)
    return emulator
}

/** The Emulator's devices, which the tests read the MIDI port's queue from. */
const devicesOf = (emulator: Emulator) => (emulator as unknown as { devices: MarsDevices }).devices

const frames = (output: RecordingAudioOutput) =>
    output.commands.reduce(
        (total, command) => total + (command.type === 'pcm' ? command.frames.length / 2 : 0),
        0
    )

/** The MIDI messages the output plays in the end: each cut drops what was due after it. */
function heardMidi(output: RecordingAudioOutput): { at: number; message: number[] }[] {
    let heard: { at: number; message: number[] }[] = []
    for (const command of output.commands) {
        if (command.type === 'midi') heard.push({ at: command.at, message: [...command.message] })
        else if (command.type === 'cut' && (command.device ?? 'midi') === 'midi')
            heard = heard.filter((entry) => entry.at <= command.after)
    }
    return heard
}

const TESTCASE: Testcase = {
    input: [],
    expectedOutput: '',
    startingRegisters: {},
    expectedRegisters: {},
    startingMemory: [],
    expectedMemory: []
}

/** 6,000 words of a square wave, two samples each, while the timer counts ticks; prints them. */
const STREAMING_WITH_TIMER: Record<Language, string> = {
    MIPS: `        .text
main:   li      $s0, 0xffff0350 # the sampled-audio output
        li      $t0, 8000
        sw      $t0, 4($s0)     # Rate
        li      $t0, 1
        sw      $t0, 0($s0)     # Control: on, in mono
        li      $t0, 1000
        mtc0    $t0, $11        # Compare: a tick every 1,000 Counts
        li      $s1, 0x20002000
        li      $s2, 0xC000C000
        li      $s3, 6000
        li      $s4, 5
loop:   lw      $t0, 8($s0)     # Free
        beqz    $t0, loop
        sw      $s1, 12($s0)    # Data
        addiu   $s4, $s4, -1
        bnez    $s4, next
        xor     $s1, $s1, $s2
        li      $s4, 5
next:   addiu   $s3, $s3, -1
        bnez    $s3, loop
        lw      $a0, ticks
        li      $v0, 1
        syscall
        li      $v0, 10
        syscall

        .kdata
ticks:  .word   0

        .ktext  0x80000180
        lui     $k1, 0x9000
        lw      $k0, 0($k1)
        addiu   $k0, $k0, 1
        sw      $k0, 0($k1)
        mfc0    $k0, $11
        addiu   $k0, $k0, 1000
        mtc0    $k0, $11
        eret`,
    'RISC-V': `        .text
main:   la      t0, handler
        csrw    t0, utvec
        li      t0, 0x10
        csrs    t0, uie
        li      s5, 0xffff0018  # time, and timecmp 8 bytes on
        lw      t1, 0(s5)
        addi    t1, t1, 100
        sw      t1, 8(s5)       # a tick every 100 ms
        sw      zero, 12(s5)
        li      s4, 0
        csrsi   ustatus, 1
        li      s0, 0xffff0350  # the sampled-audio output
        li      t0, 8000
        sw      t0, 4(s0)       # Rate
        li      t0, 1
        sw      t0, 0(s0)       # Control: on, in mono
        li      s1, 0x20002000
        li      s2, 0xC000C000
        li      s3, 6000
        li      s6, 5
loop:   lw      t0, 8(s0)       # Free
        beqz    t0, loop
        sw      s1, 12(s0)      # Data
        addi    s6, s6, -1
        bnez    s6, next
        xor     s1, s1, s2
        li      s6, 5
next:   addi    s3, s3, -1
        bnez    s3, loop
        mv      a0, s4
        li      a7, 1
        ecall
        li      a7, 10
        ecall

handler:
        addi    s4, s4, 1
        lw      t6, 8(s5)
        addi    t6, t6, 100
        sw      t6, 8(s5)
        uret`
}

describe.each(['MIPS', 'RISC-V'] as const)(
    '%s: a timer interrupt while the program streams samples',
    (language) => {
        it('plays every sample and counts the ticks, in a Run and in a Testcase', async () => {
            const output = new RecordingAudioOutput()
            const clock = new ProgramClock({ mode: 'virtual' })
            const emulator = await build(language, STREAMING_WITH_TIMER[language], {
                clock,
                audio: new Audio({ output })
            })
            await emulator.run(LIMIT)
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            expect(frames(output)).toBe(12_000)
            const ticks = Number(emulator.stdOut)
            //12,000 samples at 8,000 a second through an 8,192-frame FIFO: the last word goes in
            //once 3,808 frames have played, 476 ms on, which the full FIFO's Free reads waited for
            expect(clock.now()).toBeGreaterThanOrEqual(476)
            expect(clock.now()).toBeLessThan(500)
            if (language === 'MIPS') {
                //Count counts instructions: tens of thousands of them, a tick each 2,000
                expect(ticks).toBeGreaterThan(10)
            } else {
                //Program time: the Free reads moved the virtual clock, and the timer with it
                expect(ticks).toBeGreaterThanOrEqual(3)
                expect(ticks).toBeLessThanOrEqual(4)
            }
            const testcase = await build(language, STREAMING_WITH_TIMER[language], {
                audio: new Audio()
            })
            await testcase.runTestcase(TESTCASE, LIMIT)
            expect(testcase.errors).toEqual([])
            if (language === 'MIPS') expect(testcase.stdOut).toBe(emulator.stdOut)
            else expect(Math.abs(Number(testcase.stdOut) - ticks)).toBeLessThanOrEqual(1)
        }, 30_000)
    }
)

/**
 * A RISC-V `wfi` waits in Program time, as a `sleep` does: what the sampled-audio output played
 * meanwhile is what its Free register says next.
 */
const FREE_AFTER_WFI = `        .text
main:   la      t0, handler
        csrw    t0, utvec
        li      t0, 0x10
        csrs    t0, uie
        li      s0, 0xffff0350  # the sampled-audio output
        li      t0, 8000
        sw      t0, 4(s0)       # Rate
        li      t0, 1
        sw      t0, 0(s0)       # Control: on, in mono
        li      t1, 100         # 100 words: 200 frames, 25 ms of sound
fill:   sw      zero, 12(s0)
        addi    t1, t1, -1
        bnez    t1, fill
        li      s2, 0xffff0018
        lw      t1, 0(s2)
        addi    t1, t1, 10
        sw      t1, 8(s2)       # timecmp: 10 ms from now
        sw      zero, 12(s2)
        csrsi   ustatus, 1
        wfi                     # 80 frames play meanwhile
        lw      a0, 8(s0)       # Free
        li      a7, 1
        ecall
        li      a7, 10
        ecall

handler:
        li      t1, -1
        sw      t1, 12(s2)      # timecmp out of reach
        sw      t1, 8(s2)
        uret`

describe('RISC-V: wfi and the sampled-audio output', () => {
    //8,192 frames of room, less the 200 written, plus the 80 that played in 10 ms at 8,000 a second
    const FREE = String(8192 - 200 + 80)

    it('reads Free after a wfi as the frames played during the wait left it', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        const emulator = await build('RISC-V', FREE_AFTER_WFI, {
            clock,
            audio: new Audio({ output: new RecordingAudioOutput() })
        })
        await emulator.run(LIMIT)
        expect(emulator.errors).toEqual([])
        expect(clock.now()).toBe(10)
        expect(emulator.stdOut).toBe(FREE)
    })

    it('reads the same in a Testcase, silent but on the same clock', async () => {
        const emulator = await build('RISC-V', FREE_AFTER_WFI, { audio: new Audio() })
        await emulator.runTestcase(TESTCASE, LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe(FREE)
    })
})

/** Notes sent until the timer's handler, which sends a control change of its own, ends the loop. */
const MIDI_WITH_TIMER: Record<Language, string> = {
    MIPS: `        .text
main:   li      $s0, 0xffff0340 # the MIDI port
        li      $t0, 30
        mtc0    $t0, $11        # Compare: the timer at Count 30
        li      $s1, 60
loop:   li      $a0, 0x90
        jal     send
        move    $a0, $s1
        jal     send
        li      $a0, 100
        jal     send
        addiu   $s1, $s1, 1
        lui     $t1, 0x9000
        lw      $t1, 0($t1)     # done
        beqz    $t1, loop
        li      $v0, 10
        syscall
send:   lw      $t0, 4($s0)     # Status
        andi    $t0, $t0, 0x40
        bnez    $t0, send
        sb      $a0, 0($s0)     # Data
        jr      $ra

        .kdata
done:   .word   0

        .ktext  0x80000180
        lui     $k1, 0xffff
        li      $k0, 0xb0       # control change, channel 1:
        sb      $k0, 0x340($k1)
        li      $k0, 123        # all notes off
        sb      $k0, 0x340($k1)
        sb      $zero, 0x340($k1)
        lui     $k1, 0x9000
        li      $k0, 1
        sw      $k0, 0($k1)     # done
        mtc0    $zero, $11
        eret`,
    'RISC-V': `        .text
main:   la      t0, handler
        csrw    t0, utvec
        li      t0, 0x10
        csrs    t0, uie
        li      s0, 0xffff0340  # the MIDI port
        li      s2, 0xffff0018  # time, and timecmp 8 bytes on
        lw      t1, 0(s2)
        addi    t1, t1, 2
        sw      t1, 8(s2)       # the timer 2 ms from now
        sw      zero, 12(s2)
        csrsi   ustatus, 1
        li      s1, 60
        li      s3, 4           # four notes, twelve bytes: 3.84 ms on the line
notes:  li      a0, 0x90
        jal     send
        mv      a0, s1
        jal     send
        li      a0, 100
        jal     send
        addi    s1, s1, 1
        addi    s3, s3, -1
        bnez    s3, notes
        wfi                     # the timer, with bytes still on the line
        li      a7, 10
        ecall
send:   lw      t0, 4(s0)       # Status
        andi    t0, t0, 0x40
        bnez    t0, send
        sb      a0, 0(s0)       # Data
        ret

handler:
        li      t1, 0xb0        # control change, channel 1:
        sb      t1, 0(s0)
        li      t1, 123         # all notes off
        sb      t1, 0(s0)
        sb      zero, 0(s0)
        li      t1, -1
        sw      t1, 12(s2)      # timecmp out of reach
        sw      t1, 8(s2)
        uret`
}

describe.each(['MIPS', 'RISC-V'] as const)(
    '%s: Undo across an interrupt while the MIDI port has bytes queued',
    (language) => {
        const handlerOf = (emulator: Emulator) =>
            language === 'MIPS'
                ? MIPS_HANDLER
                : Number(emulator._resolveMemoryLabel('handler')) >>> 0
        const pc = (emulator: Emulator) => Number(emulator.pc) >>> 0
        const status = (emulator: Emulator) =>
            Number(
                emulator.registerFiles
                    .find((file) => file.id === 'cp0')!
                    .registers.find((register) => register.name === '$12 (status)')!.value
            )
        const ustatus = (emulator: Emulator) =>
            Number(
                emulator._getRegisterFileValues('csr')[
                    (RISCVCsrRegisterNames as readonly string[]).indexOf('ustatus')
                ]
            )
        const interruptState = (emulator: Emulator) =>
            language === 'MIPS' ? status(emulator) : ustatus(emulator)

        it('takes back the handler’s bytes and the interrupt, and plays the same messages after', async () => {
            const reference = new RecordingAudioOutput()
            const straight = await build(language, MIDI_WITH_TIMER[language], {
                audio: new Audio({ output: reference })
            })
            await straight.run(LIMIT)
            expect(straight.errors).toEqual([])
            expect(straight.terminated).toBe(true)
            const expected = heardMidi(reference)
            //the handler's control change, among the notes main sent around it
            expect(expected.map((entry) => entry.message)).toContainEqual([0xb0, 123, 0])

            const output = new RecordingAudioOutput()
            const emulator = await build(language, MIDI_WITH_TIMER[language], {
                audio: new Audio({ output })
            })
            const midi = devicesOf(emulator).midi!
            const handler = handlerOf(emulator)
            let before = { pc: 0, queued: 0, interrupts: 0 }
            for (let steps = 0; pc(emulator) !== handler && steps < 1_000; steps++) {
                before = {
                    pc: pc(emulator),
                    queued: midi.queued,
                    interrupts: interruptState(emulator)
                }
                await emulator.step()
            }
            expect(pc(emulator)).toBe(handler)
            expect(emulator.notes.at(-1)?.text).toMatch(/^Timer interrupt at /)
            //bytes from before the interrupt are still on the line
            expect(midi.queued).toBeGreaterThan(0)
            const atInterrupt = midi.queued
            //the handler's control change: three bytes more
            let handlerSteps = 0
            while (midi.queued < atInterrupt + 3 && handlerSteps < 10) {
                await emulator.step()
                handlerSteps++
            }
            expect(midi.queued).toBe(atInterrupt + 3)
            expect(heardMidi(output).at(-1)?.message).toEqual([0xb0, 123, 0])

            //back over the handler's instructions and the interrupt itself
            expect(emulator.undo(handlerSteps + 1)).toBe(handlerSteps + 1)
            expect(pc(emulator)).toBe(before.pc)
            expect(interruptState(emulator)).toBe(before.interrupts)
            expect(midi.queued).toBe(atInterrupt)
            expect(output.commands.at(-1)).toMatchObject({ type: 'cut', device: 'midi' })
            expect(heardMidi(output).some((entry) => entry.message[0] === 0xb0)).toBe(false)

            //the interrupt is taken again, and the program ends as it did without the Undo
            await emulator.step()
            expect(pc(emulator)).toBe(handler)
            await emulator.run(LIMIT)
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            const heard = heardMidi(output)
            expect(heard.map((entry) => entry.message)).toEqual(
                expected.map((entry) => entry.message)
            )
            //MIPS's timer counts instructions and Program time stands still: the same times too
            if (language === 'MIPS') expect(heard).toEqual(expected)
        })
    }
)

/**
 * A C Program that links a hand-written GNU unit by need, the unit holding the timer's interrupt
 * handler: in `.ktext` on MIPS, and installed through `utvec` on RISC-V. The Generated assembly is
 * written as a compiler would, and the Runtime library is a test one, so nothing is compiled.
 */
const C_SOURCE = `extern volatile int ticks;
void ticks_start(void);
void ticks_wait(void);
int main(void) {
    ticks_start();
    while (ticks < 3) ticks_wait();
    return ticks;
}
`
const C_PROGRAM = {
    MIPS: {
        crt0: '.text\n.globl _start\n_start:\njal main\nmove $4,$2\nli $2,17\nsyscall\n',
        main: `	.text
	.globl	main
	.type	main, @function
main:
	addiu	$sp,$sp,-24
	sw	$31,20($sp)
	jal	ticks_start
$L2:
	jal	ticks_wait
	lui	$2,%hi(ticks)
	lw	$2,%lo(ticks)($2)
	slt	$2,$2,3
	bne	$2,$0,$L2
	lui	$2,%hi(ticks)
	lw	$2,%lo(ticks)($2)
	lw	$31,20($sp)
	addiu	$sp,$sp,24
	jr	$31
`,
        unit: `# ticks_start, ticks_wait and the timer's handler, written by hand in GNU syntax
	.text
	.globl	ticks_start
ticks_start:
	li	$8,200
	mtc0	$8,$11
	jr	$31
	.globl	ticks_wait
ticks_wait:
	jr	$31

	.data
	.globl	ticks
	.p2align	2
ticks:
	.word	0

	.ktext
	lui	$27,%hi(ticks)
	lw	$26,%lo(ticks)($27)
	addiu	$26,$26,1
	sw	$26,%lo(ticks)($27)
	mfc0	$26,$11
	addiu	$26,$26,200
	mtc0	$26,$11
	eret
`
    },
    'RISC-V': {
        crt0: '.text\n.globl _start\n_start:\ncall main\nli a7,93\necall\n',
        main: `	.text
	.globl	main
	.p2align	2
main:
	addi	sp, sp, -16
	sw	ra, 12(sp)
	call	ticks_start
.LBB0_1:
	call	ticks_wait
	lui	a0, %hi(ticks)
	lw	a0, %lo(ticks)(a0)
	li	a1, 3
	blt	a0, a1, .LBB0_1
	lw	ra, 12(sp)
	addi	sp, sp, 16
	ret
`,
        unit: `# ticks_start, ticks_wait and the timer's handler, written by hand in GNU syntax
	.text
	.globl	ticks_start
ticks_start:
	lui	t0,%hi(ticks_handler)
	addi	t0,t0,%lo(ticks_handler)
	csrrw	zero,utvec,t0
	li	t0,16
	csrrs	zero,uie,t0
	li	t1,-65512
	lw	t2,0(t1)
	addi	t2,t2,10
	sw	t2,8(t1)
	sw	zero,12(t1)
	csrrsi	zero,ustatus,1
	ret
	.globl	ticks_wait
ticks_wait:
	wfi
	ret
ticks_handler:
	csrrw	zero,uscratch,t0
	lui	t0,%hi(saved)
	addi	t0,t0,%lo(saved)
	sw	t1,0(t0)
	sw	t2,4(t0)
	lui	t1,%hi(ticks)
	lw	t2,%lo(ticks)(t1)
	addi	t2,t2,1
	sw	t2,%lo(ticks)(t1)
	li	t1,-65512
	lw	t2,8(t1)
	addi	t2,t2,10
	sw	t2,8(t1)
	lw	t1,0(t0)
	lw	t2,4(t0)
	csrrw	t0,uscratch,zero
	uret

	.data
	.globl	ticks
	.p2align	2
ticks:
	.word	0
saved:
	.word	0,0
`
    }
}

for (const language of ['MIPS', 'RISC-V'] as const)
    provideRuntimeLibrary('v1', language, {
        abi: 'v1',
        target: language === 'MIPS' ? 'mips' : 'riscv32',
        compiler: 'test',
        members: { '@runtime/v1/crt0.s': C_PROGRAM[language].crt0 },
        index: { _start: '@runtime/v1/crt0.s' },
        memberSources: {}
    })

describe.each([
    { language: 'MIPS' as const, extension: 'mips' },
    { language: 'RISC-V' as const, extension: 'riscv' }
])('$language: a C Program linking a hand-written unit that holds an interrupt handler', (spec) => {
    const { language, extension } = spec
    const program = C_PROGRAM[language]
    const entry = `main.c.${extension}`
    const unit = `ticks.${extension}`
    const text = (content: string) => ({ encoding: 'plain' as const, content })

    function sources(extra: Record<string, string> = {}): BuildSources {
        const files: Record<string, ReturnType<typeof text>> = {
            'main.c': text(C_SOURCE),
            [entry]: text(program.main),
            [unit]: text(program.unit)
        }
        for (const [path, content] of Object.entries(extra)) files[path] = text(content)
        const compilations: CompilationRecord[] = [
            {
                sourcePath: 'main.c',
                outputPath: entry,
                target: language,
                language: 'c',
                compilerId: 'test',
                optimization: '0',
                inputs: { 'main.c': fileFingerprint(files['main.c'])! },
                outputFingerprint: fileFingerprint(files[entry])!,
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1'
            }
        ]
        return projectBuildSources({
            files: files as ProjectFiles,
            entry,
            language,
            compilations,
            programs: [entry]
        })
    }
    const errors = (emulator: { compilerDiagnostics: readonly Diagnostic[] }) =>
        emulator.compilerDiagnostics.filter((d) => d.severity === 'error')

    it('takes the unit by the names main needs, and its handler counts the timer’s ticks', async () => {
        const input = sources({
            //an unrelated exercise in the Core's own dialect, with a mistake: never assembled
            [`exercise.${extension}`]: '.text\nmain:\n\tthis line is wrong\n'
        })
        expect(input.linkUnits).toEqual([`exercise.${extension}`, unit])
        const clock = new ProgramClock({ mode: 'virtual' })
        const make = language === 'MIPS' ? MIPSEmulator : RISCVEmulator
        const emulator = make(input, { language, peripherals: { clock } })
        try {
            await emulator.check()
            await emulator.compile(200_000, input)
            expect(errors(emulator)).toEqual([])
            expect(emulator.buildArtifacts.some((artifact) => artifact.file === unit)).toBe(true)
            await emulator.run(1_000_000)
            expect(emulator.errors).toEqual([])
            expect(emulator.termination).toEqual({ kind: 'exit', code: 3 })
            //RISC-V's wfi moved the virtual clock to each timecmp: three ticks of 10 ms
            if (language === 'RISC-V') expect(clock.now()).toBe(30)
        } finally {
            emulator.dispose()
        }
    })
})
