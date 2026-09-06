import { appendFileSync, readFileSync } from 'node:fs'
import type { ExecutionSlice, ExecutionSliceRequest } from '$lib/languages/ExecutionSlice'
import type { EmulatorSettings } from '$lib/languages/commonLanguageFeatures.svelte'
import { M68KEmulator } from '$lib/languages/M68K/M68KEmulator.svelte'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import type { ProjectDisplay } from '$lib/languages/mars/marsDisplay'
import type { EmulatorPeripherals } from '$lib/languages/peripherals/peripheralSet'
import type { Screen } from '$lib/languages/peripherals/screen/Screen'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { X86Emulator } from '$lib/languages/X86/X86Emulator.svelte'
import { Z80Emulator } from '$lib/languages/Z80/Z80Emulator.svelte'

/**
 * What the phase 8 measurements need from an Emulator, and the pieces every measurement file shares:
 * building one per language under node, running a single unsliced slice, and printing a markdown row
 * ([the plan](../../../../docs/design/screen-peripherals-plan.md), phase 8).
 *
 * Kept out of `*.test.ts` on purpose: these files time things, they take minutes, and they are run
 * with `npm run measure`, not with the suite.
 */

export type MeasuredLanguage = 'Z80' | 'M68K' | 'MIPS' | 'RISC-V' | 'X86'

export const MEASURED_LANGUAGES: MeasuredLanguage[] = ['Z80', 'M68K', 'MIPS', 'RISC-V', 'X86']

/** What a Build does in the app: `settingsStore.values.maxHistorySize`, whose default is 100. */
export const HISTORY_SIZE = 100

export type MeasurableEmulator = {
    compile(historySize: number, code?: string): Promise<void>
    check(): Promise<unknown>
    run(limit: number): Promise<unknown>
    step(): Promise<boolean>
    clear(): void
    dispose?(): void
    readonly errors: string[]
    readonly stdOut: string
    readonly terminated: boolean
    readonly peripherals: EmulatorPeripherals
}

type SliceRunner = { _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> }

export async function createMeasurableEmulator(
    language: MeasuredLanguage,
    code: string,
    options: EmulatorSettings = {}
): Promise<MeasurableEmulator> {
    if (language === 'Z80') return Z80Emulator(code, options) as unknown as MeasurableEmulator
    if (language === 'M68K') return M68KEmulator(code, options) as unknown as MeasurableEmulator
    if (language === 'MIPS') return MIPSEmulator(code, options) as unknown as MeasurableEmulator
    if (language === 'RISC-V') return RISCVEmulator(code, options) as unknown as MeasurableEmulator
    return (await X86Emulator(code, options)) as unknown as MeasurableEmulator
}

/**
 * Builds a program the way the project page does: the semantic check first (on MIPS and RISC-V it
 * assembles a throwaway Core, and letting it race the build empties the undo history), then a
 * compile with the shipped history size.
 */
export async function buildProgram(
    language: MeasuredLanguage,
    code: string,
    options: EmulatorSettings = {}
): Promise<MeasurableEmulator> {
    const emulator = await createMeasurableEmulator(language, code, options)
    await emulator.check()
    await emulator.compile(HISTORY_SIZE, code)
    return emulator
}

/**
 * One slice big enough for the whole measurement, which is what "without yields" means: the Core is
 * entered once and comes back when it has run every instruction. An exhausted limit is how s68k
 * reports the end of such a slice, and the instructions still ran, so it is not a failure here.
 */
export async function runUnsliced(
    emulator: MeasurableEmulator,
    instructions: number
): Promise<number> {
    const runner = emulator as unknown as SliceRunner
    try {
        const slice = await runner._runSlice({
            instructionBudget: instructions,
            //no adapter's throughput estimate can cap a budget this large, so the slice is the
            //whole run: `sliceInstructionBudget` returns the instruction budget itself
            timeBudgetMs: Number.MAX_SAFE_INTEGER,
            breakpoints: [],
            runInstructionLimit: instructions,
            speedCorrection: 1
        })
        return slice.instructions
    } catch {
        return instructions
    }
}

/** A loop that does nothing but arithmetic: no I/O, no Screen, no memory traffic. */
export const COMPUTE_LOOP: Record<MeasuredLanguage, string> = {
    Z80: '        .org 0x8000\nloop:   inc a\n        jp loop\n',
    M68K: '    ORG $1000\nSTART:\nloop:\n    addq.l #1,d0\n    bra loop\n',
    MIPS: '.text\nmain:\nloop:   addi $t0, $t0, 1\n        j loop\n',
    'RISC-V': '.text\nmain:\nloop:   addi t0, t0, 1\n        j loop\n',
    X86: 'global _start\nsection .text\n_start:\nspin:\n    inc rax\n    jmp spin\n'
}

/**
 * The animation examples of `examples/`, with the display parameters their header comments tell the
 * user to set. They are what frame pacing, Stop during a wait and the Screen history budget are
 * measured on: each one clears or redraws, presents and then lets program time pass.
 */
export type AnimationExample = {
    language: MeasuredLanguage
    path: string
    display?: ProjectDisplay
    /** What the program waits on between frames, for the measurement tables. */
    pacing: string
}

const MARS_BALL_DISPLAY: ProjectDisplay = {
    unitWidth: 4,
    unitHeight: 4,
    width: 512,
    height: 512,
    baseAddress: 0x10010000
}

export const ANIMATION_EXAMPLES: AnimationExample[] = [
    { language: 'Z80', path: 'z80/bouncing-ball.z80', pacing: 'frame sync, port 0x41' },
    { language: 'M68K', path: 'm68k/bouncing-ball.x68', pacing: 'task 23, two hundredths' },
    {
        language: 'MIPS',
        path: 'mips/bouncing-ball.asm',
        display: MARS_BALL_DISPLAY,
        pacing: 'syscall 32, 16 ms'
    },
    {
        language: 'RISC-V',
        path: 'risc-v/bouncing-ball.s',
        display: MARS_BALL_DISPLAY,
        pacing: 'ecall 32, 16 ms'
    }
]

/**
 * What the Screen panel does in a browser: repaint on an animation frame and call `markPainted()`.
 * Nothing does that under node, and a Screen left dirty forever would hold the scheduler at the
 * short slice budget, so a measurement without this would not be measuring the GUI's behaviour.
 */
export function startFakeRenderer(screen: Screen, intervalMs = 16): () => void {
    const timer = setInterval(() => {
        if (screen.dirty) screen.markPainted()
    }, intervalMs)
    return () => clearInterval(timer)
}

export function example(path: string): string {
    return readFileSync(new URL(`../../../../examples/${path}`, import.meta.url), 'utf8')
}

/** Waits without blocking the loop the run is scheduled on. */
export function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function round(value: number, decimals = 1): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

export function median(values: number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * A markdown table the phase 8 documents can take verbatim. Vitest swallows a test's console output
 * unless it fails, so the tables are also appended to the file `MEASURE_OUT` names.
 */
export function printTable(title: string, header: string[], rows: (string | number)[][]): void {
    const text = [
        '',
        `### ${title}`,
        '',
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
        ''
    ].join('\n')
    console.log(text)
    const out = process.env.MEASURE_OUT
    if (out) appendFileSync(out, `${text}\n`)
}
