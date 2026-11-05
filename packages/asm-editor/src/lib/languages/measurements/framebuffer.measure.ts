import { beforeAll, describe, it } from 'vite-plus/test'
import type { ExecutionSlice, ExecutionSliceRequest } from '#lib/languages/ExecutionSlice.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'
import {
    COMPUTE_LOOP,
    createMeasurableEmulator,
    HISTORY_SIZE,
    median,
    printTable,
    round,
    runUnsliced,
    type MeasurableEmulator
} from './harness'

/**
 * What MIPS and RISC-V programs that draw at 640 by 480 get from the Cores, the baseline of asmOS
 * stage 2 ([the plan](../../../../../../docs/design/asmos-stage2-plan.md), M0) that native dirty
 * tracking (M1) and the Cores' tuning (M2) are measured against: a compute loop's instructions per
 * millisecond, and the frames a second of two drawing programs, each with Undo on and off.
 *
 * - **Full frame** stores every word of the 640 by 480 grid each frame, about 0.92 million
 *   instructions: a full redraw.
 * - **Window copy** copies a 300 by 200 picture from memory past the grid to a place on the grid
 *   that moves each frame, about 0.3 million instructions: a window being dragged.
 *
 * Each frame ends with a 16 ms sleep, which ends the slice as it does in the editor and brings the
 * Screen up to date. The sleep itself is answered at once, so a frame costs what the Core and the
 * Screen's update cost and nothing else: frames a second here is the most the program could show.
 *
 * The Core's build is the one `CORE_BACKEND` names, `javascript` (the default) or `webassembly`;
 * the WebAssembly build needs Node's `--experimental-wasm-exnref`, which the measure config passes.
 */

type MarsLanguage = 'MIPS' | 'RISC-V'
const LANGUAGES: MarsLanguage[] = ['MIPS', 'RISC-V']
const BACKEND = process.env.CORE_BACKEND === 'webassembly' ? 'webassembly' : 'javascript'

const DISPLAY: ProjectDisplay = {
    unitWidth: 1,
    unitHeight: 1,
    width: 640,
    height: 480,
    baseAddress: 0x10010000
}
const SCREEN_DIRECTIVE = '# @screen width=640 height=480 unit=1 base=0x10010000'

const FULL_FRAME: Record<MarsLanguage, string> = {
    MIPS: [
        SCREEN_DIRECTIVE,
        '.text',
        'main:   li $s0, 0x10010000',
        '        li $s1, 1228800',
        '        addu $s1, $s0, $s1',
        '        li $s2, 0',
        '        li $s3, 0x010305',
        'frame:  move $t0, $s0',
        'fill:   sw $s2, 0($t0)',
        '        addiu $t0, $t0, 4',
        '        bne $t0, $s1, fill',
        '        addu $s2, $s2, $s3',
        '        li $v0, 32',
        '        li $a0, 16',
        '        syscall',
        '        j frame'
    ].join('\n'),
    'RISC-V': [
        SCREEN_DIRECTIVE,
        '.text',
        'main:   li s0, 0x10010000',
        '        li s1, 1228800',
        '        add s1, s0, s1',
        '        li s2, 0',
        '        li s3, 0x010305',
        'frame:  mv t0, s0',
        'fill:   sw s2, 0(t0)',
        '        addi t0, t0, 4',
        '        bne t0, s1, fill',
        '        add s2, s2, s3',
        '        li a7, 32',
        '        li a0, 16',
        '        ecall',
        '        j frame'
    ].join('\n')
}

/**
 * A background once, a 300 by 200 picture at 0x10200000, then each frame the picture copied a row
 * at a time to a place 4 pixels further along a line, bouncing between its ends.
 */
const WINDOW_COPY: Record<MarsLanguage, string> = {
    MIPS: [
        SCREEN_DIRECTIVE,
        '.text',
        'main:   li $t0, 0x10010000',
        '        li $t3, 0',
        '        li $t4, 480',
        'bg_row: andi $t2, $t3, 255',
        '        sll $t2, $t2, 8',
        '        ori $t2, $t2, 0x40',
        '        lui $t5, 0x20',
        '        or $t2, $t2, $t5',
        '        addiu $t1, $t0, 2560',
        'bg_col: sw $t2, 0($t0)',
        '        addiu $t0, $t0, 4',
        '        bne $t0, $t1, bg_col',
        '        addiu $t3, $t3, 1',
        '        bne $t3, $t4, bg_row',
        '        li $t0, 0x10200000',
        '        li $t1, 240000',
        '        addu $t1, $t1, $t0',
        '        li $t2, 0',
        '        li $t3, 0x010307',
        'source: sw $t2, 0($t0)',
        '        addu $t2, $t2, $t3',
        '        addiu $t0, $t0, 4',
        '        bne $t0, $t1, source',
        '        li $s0, 0',
        '        li $s2, 4',
        'frame:  li $t0, 89600',
        '        addu $t0, $t0, $s0',
        '        sll $t0, $t0, 2',
        '        li $t5, 0x10010000',
        '        addu $t0, $t0, $t5',
        '        li $t1, 0x10200000',
        '        li $t3, 0',
        '        li $t4, 200',
        'cp_row: move $t6, $t0',
        '        addiu $s4, $t1, 1200',
        'cp_col: lw $t2, 0($t1)',
        '        sw $t2, 0($t6)',
        '        addiu $t1, $t1, 4',
        '        addiu $t6, $t6, 4',
        '        bne $t1, $s4, cp_col',
        '        addiu $t0, $t0, 2560',
        '        addiu $t3, $t3, 1',
        '        bne $t3, $t4, cp_row',
        '        addu $s0, $s0, $s2',
        '        bgez $s0, lo_ok',
        '        subu $s2, $zero, $s2',
        '        addu $s0, $s0, $s2',
        '        addu $s0, $s0, $s2',
        'lo_ok:  ble $s0, 340, hi_ok',
        '        subu $s2, $zero, $s2',
        '        addu $s0, $s0, $s2',
        '        addu $s0, $s0, $s2',
        'hi_ok:  li $v0, 32',
        '        li $a0, 16',
        '        syscall',
        '        j frame'
    ].join('\n'),
    'RISC-V': [
        SCREEN_DIRECTIVE,
        '.text',
        'main:   li t0, 0x10010000',
        '        li t3, 0',
        '        li t4, 480',
        'bg_row: andi t2, t3, 255',
        '        slli t2, t2, 8',
        '        li t5, 0x200040',
        '        or t2, t2, t5',
        '        li t1, 2560',
        '        add t1, t1, t0',
        'bg_col: sw t2, 0(t0)',
        '        addi t0, t0, 4',
        '        bne t0, t1, bg_col',
        '        addi t3, t3, 1',
        '        bne t3, t4, bg_row',
        '        li t0, 0x10200000',
        '        li t1, 240000',
        '        add t1, t1, t0',
        '        li t2, 0',
        '        li t3, 0x010307',
        'source: sw t2, 0(t0)',
        '        add t2, t2, t3',
        '        addi t0, t0, 4',
        '        bne t0, t1, source',
        '        li s0, 0',
        '        li s2, 4',
        'frame:  li t0, 89600',
        '        add t0, t0, s0',
        '        slli t0, t0, 2',
        '        li t5, 0x10010000',
        '        add t0, t0, t5',
        '        li t1, 0x10200000',
        '        li t3, 0',
        '        li t4, 200',
        'cp_row: mv t6, t0',
        '        addi s4, t1, 1200',
        'cp_col: lw t2, 0(t1)',
        '        sw t2, 0(t6)',
        '        addi t1, t1, 4',
        '        addi t6, t6, 4',
        '        bne t1, s4, cp_col',
        '        li t5, 2560',
        '        add t0, t0, t5',
        '        addi t3, t3, 1',
        '        bne t3, t4, cp_row',
        '        add s0, s0, s2',
        '        bgez s0, lo_ok',
        '        sub s2, zero, s2',
        '        add s0, s0, s2',
        '        add s0, s0, s2',
        'lo_ok:  li t5, 340',
        '        ble s0, t5, hi_ok',
        '        sub s2, zero, s2',
        '        add s0, s0, s2',
        '        add s0, s0, s2',
        'hi_ok:  li a7, 32',
        '        li a0, 16',
        '        ecall',
        '        j frame'
    ].join('\n')
}

/** How long a compute run and a drawing run should take. */
const COMPUTE_MS = 2_000
const DRAWING_MS = 3_000
const WARM_UP_FRAMES = 2
const REPEATS = 3

type SliceRunner = { _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> }

async function build(
    language: MarsLanguage,
    code: string,
    undo: boolean
): Promise<MeasurableEmulator> {
    const emulator = await createMeasurableEmulator(language, code, { display: DISPLAY })
    await emulator.check()
    await emulator.compile(undo ? HISTORY_SIZE : 0, code)
    if (emulator.errors.length > 0) throw new Error(emulator.errors.join('; '))
    return emulator
}

/** Instructions per millisecond of the compute loop, the median of `REPEATS` runs. */
async function compute(language: MarsLanguage, undo: boolean): Promise<number> {
    const probe = await build(language, COMPUTE_LOOP[language], undo)
    const probeStart = performance.now()
    await runUnsliced(probe, 200_000)
    const instructions = Math.round((200_000 / (performance.now() - probeStart)) * COMPUTE_MS)
    probe.dispose?.()
    const rates: number[] = []
    for (let repeat = 0; repeat < REPEATS; repeat++) {
        const emulator = await build(language, COMPUTE_LOOP[language], undo)
        const start = performance.now()
        const executed = await runUnsliced(emulator, instructions)
        rates.push(executed / (performance.now() - start))
        emulator.dispose?.()
    }
    return median(rates)
}

type Frames = { framesPerSecond: number; instructionsPerFrame: number; imageMatches: boolean }

/**
 * Frames a second of a drawing program: slices run back to back, each ended by the program's
 * sleep, which is answered at once and counted as a frame.
 */
async function frames(language: MarsLanguage, code: string, undo: boolean): Promise<Frames> {
    const emulator = await build(language, code, undo)
    const clock = emulator.peripherals.clock as unknown as { wait: (ms: number) => Promise<void> }
    let count = 0
    clock.wait = () => {
        count++
        return Promise.resolve()
    }
    const runner = emulator as unknown as SliceRunner & { _getInstructionsExecuted(): bigint }
    const executed = () => Number(runner._getInstructionsExecuted())
    const slice = (first: boolean) =>
        runner._runSlice({
            instructionBudget: 50_000_000,
            timeBudgetMs: Number.MAX_SAFE_INTEGER,
            breakpoints: [],
            skipBreakpointAtPc: first,
            runInstructionLimit: Number.MAX_SAFE_INTEGER,
            speedCorrection: 1
        })
    await slice(true)
    while (count < WARM_UP_FRAMES) await slice(false)
    const startFrames = count
    const startInstructions = executed()
    const start = performance.now()
    while (performance.now() - start < DRAWING_MS) await slice(false)
    const elapsed = performance.now() - start
    const drawn = count - startFrames
    const result = {
        framesPerSecond: (drawn / elapsed) * 1000,
        instructionsPerFrame: (executed() - startInstructions) / drawn,
        imageMatches: imageMatchesMemory(emulator)
    }
    emulator.dispose?.()
    return result
}

/** Whether the Screen shows what memory holds, checked on a word in every row. */
function imageMatchesMemory(emulator: MeasurableEmulator): boolean {
    const memory = emulator as unknown as {
        _readMemoryBytes(address: bigint, length: bigint): Uint8Array
    }
    const pixels = emulator.peripherals.screen.visiblePixels
    for (let row = 0; row < DISPLAY.height; row++) {
        const column = (row * 37) % DISPLAY.width
        const index = row * DISPLAY.width + column
        const bytes = memory._readMemoryBytes(BigInt(DISPLAY.baseAddress + index * 4), 4n)
        const shown = pixels.subarray(index * 4, index * 4 + 3)
        if (shown[0] !== bytes[2] || shown[1] !== bytes[1] || shown[2] !== bytes[0]) return false
    }
    return true
}

describe(`MIPS and RISC-V at 640 by 480, ${BACKEND} Cores`, () => {
    beforeAll(async () => {
        if (BACKEND !== 'webassembly') return
        const [mips, riscv] = [await import('@specy/mips'), await import('@specy/risc-v')]
        const backends = [await mips.useWebAssembly(), await riscv.useWebAssembly()]
        if (backends.some((backend) => backend !== 'webassembly'))
            throw new Error(
                'the WebAssembly builds did not load: run with --experimental-wasm-exnref'
            )
    })

    it('measures compute and drawing speed, Undo on and off', async () => {
        const rows: (string | number)[][] = []
        for (const language of LANGUAGES) {
            for (const undo of [false, true]) {
                const rate = await compute(language, undo)
                const full = await frames(language, FULL_FRAME[language], undo)
                const window = await frames(language, WINDOW_COPY[language], undo)
                rows.push([
                    language,
                    undo ? 'on' : 'off',
                    Math.round(rate).toLocaleString('en-US'),
                    round(full.framesPerSecond),
                    Math.round(full.instructionsPerFrame).toLocaleString('en-US'),
                    round(window.framesPerSecond),
                    Math.round(window.instructionsPerFrame).toLocaleString('en-US'),
                    full.imageMatches && window.imageMatches ? 'yes' : 'NO'
                ])
            }
        }
        printTable(
            `MIPS and RISC-V speed, ${BACKEND} Cores`,
            [
                'Core',
                'Undo',
                'Compute, instructions/ms',
                'Full frame, frames/s',
                'Instructions/frame',
                'Window copy, frames/s',
                'Instructions/frame',
                'Screen matches memory'
            ],
            rows
        )
    })
})
