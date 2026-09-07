import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EmulatorSettings } from '$lib/languages/commonLanguageFeatures.svelte'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import type { ProjectDisplay } from '$lib/languages/mars/marsDisplay'
import {
    buildProgram,
    createMeasurableEmulator,
    example,
    HISTORY_SIZE,
    printTable,
    round,
    sleep,
    startFakeRenderer,
    type MeasurableEmulator,
    type MeasuredLanguage
} from './harness'

/**
 * Every program in `examples/`, run headlessly through the Emulator and its peripherals on every
 * Core that loads under node. It is the automated half of the manual verification matrix
 * (`docs/manual-verification.md`): what a program assembles to, what it prints and what it leaves on
 * the Screen can be checked here, and only pixels judged by eye, pacing and the feel of input need a
 * browser.
 *
 * A program that runs until Stop is given an instruction limit of the harness' own and, on top of
 * it, a wall-clock budget, because a program paced by waits costs no instructions while it waits.
 */

/** The harness' own safety net: a Run in the app has no instruction limit, this measurement does. */
const INSTRUCTION_LIMIT = 2_000_000
/** How long a program that never terminates is allowed to run before Stop ends it. */
const RUN_BUDGET_MS = 2_500
const SAMPLE_MS = 250

const MARS_TOUR: ProjectDisplay = {
    unitWidth: 1,
    unitHeight: 1,
    width: 256,
    height: 256,
    baseAddress: 0x10010000
}
const MARS_BALL: ProjectDisplay = {
    ...MARS_TOUR,
    unitWidth: 4,
    unitHeight: 4,
    width: 512,
    height: 512
}
const MARS_KEYBOARD: ProjectDisplay = {
    ...MARS_TOUR,
    unitWidth: 8,
    unitHeight: 8,
    width: 512,
    height: 256
}

type Program = {
    path: string
    language: MeasuredLanguage
    /** What the row is for, in the matrix's words. */
    exercises: string
    settings?: EmulatorSettings
    /** GUI input the program polls for, injected once the program is built. */
    drive?: (emulator: MeasurableEmulator) => void
    /** A reference program that is checked in to be compared against, not to be run here. */
    referenceOnly?: boolean
}

const PROGRAMS: Program[] = [
    {
        path: 'z80/bouncing-ball.z80',
        language: 'Z80',
        exercises: 'double buffering, frame sync'
    },
    {
        path: 'z80/keyboard-move.z80',
        language: 'Z80',
        exercises: 'key state polling, text on the Screen and in the transcript',
        drive: (emulator) => emulator.peripherals.keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
    },
    {
        path: 'z80/mouse-paint.z80',
        language: 'Z80',
        exercises: 'mouse polling, its views and flags',
        drive: (emulator) => emulator.peripherals.mouse.buttonDown('left', 100, 60)
    },
    { path: 'm68k/graphics-tour.x68', language: 'M68K', exercises: 'every drawing task, 80 to 96' },
    {
        path: 'm68k/bouncing-ball.x68',
        language: 'M68K',
        exercises: 'double buffering (92/94) and program time (23)'
    },
    {
        path: 'm68k/keyboard-move.x68',
        language: 'M68K',
        exercises: 'key state (19), text to both windows',
        drive: (emulator) => emulator.peripherals.keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
    },
    {
        path: 'm68k/mouse-paint.x68',
        language: 'M68K',
        exercises: 'the mouse task (61), its flags and pixels',
        drive: (emulator) => emulator.peripherals.mouse.buttonDown('left', 200, 150)
    },
    {
        path: 'm68k/easy68k/graphicSound.X68',
        language: 'M68K',
        exercises: "EASy68K's own graphics and sound reference",
        referenceOnly: true
    },
    {
        path: 'm68k/easy68k/mouseWindowSize.X68',
        language: 'M68K',
        exercises: "EASy68K's own mouse and window reference",
        referenceOnly: true
    },
    {
        path: 'm68k/easy68k/clockDigital.X68',
        language: 'M68K',
        exercises: "EASy68K's own animated clock reference",
        referenceOnly: true
    },
    {
        path: 'Bad_Apple.s68k',
        language: 'M68K',
        exercises:
            'the repository’s own animation: a video drawn cell by cell (tasks 11, 23, 80, 81, 87)'
    },
    {
        path: 'mips/bitmap-tour.asm',
        language: 'MIPS',
        exercises: 'the bitmap display over a whole grid',
        settings: { display: MARS_TOUR }
    },
    {
        path: 'mips/bouncing-ball.asm',
        language: 'MIPS',
        exercises: 'sleep (32) and program time (30)',
        settings: { display: MARS_BALL }
    },
    {
        path: 'mips/keyboard-display.asm',
        language: 'MIPS',
        exercises: 'the four memory-mapped registers',
        settings: { display: MARS_KEYBOARD },
        drive: (emulator) => emulator.peripherals.keyboard.typeText('ab')
    },
    {
        path: 'risc-v/bitmap-tour.s',
        language: 'RISC-V',
        exercises: 'the bitmap display over a whole grid',
        settings: { display: MARS_TOUR }
    },
    {
        path: 'risc-v/bouncing-ball.s',
        language: 'RISC-V',
        exercises: 'sleep (32) and program time (30)',
        settings: { display: MARS_BALL }
    },
    {
        path: 'risc-v/keyboard-display.s',
        language: 'RISC-V',
        exercises: 'the four memory-mapped registers',
        settings: { display: MARS_KEYBOARD },
        drive: (emulator) => emulator.peripherals.keyboard.typeText('ab')
    }
]

type Picture = { ink: number; colors: number; size: string }

/**
 * What is on the Screen, described without eyes: how many pixels differ from the commonest color,
 * which is the background every one of these programs clears or fills to, and how many colors are on
 * it. A blank Screen is `0` ink and `1` color.
 */
function pictureOf(emulator: MeasurableEmulator): Picture {
    const screen = emulator.peripherals.screen
    const pixels = screen.visiblePixels
    const histogram = new Map<number, number>()
    for (let offset = 0; offset < pixels.length; offset += 4) {
        const color = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
        histogram.set(color, (histogram.get(color) ?? 0) + 1)
    }
    let background = 0
    for (const [color, count] of histogram) {
        if (count > (histogram.get(background) ?? 0)) background = color
    }
    const total = pixels.length / 4
    return {
        ink: total - (histogram.get(background) ?? 0),
        colors: histogram.size,
        size: `${screen.width} × ${screen.height}`
    }
}

type Outcome = {
    program: Program
    assembled: boolean
    errors: string[]
    terminated: boolean
    stdOut: string
    picture: Picture
    milliseconds: number
    stoppedByTheBudget: boolean
}

/** An assembler's complaint, cut down to something a table row can hold. */
function summarize(error: unknown): string[] {
    const lines = String(error instanceof Error ? error.message : error)
        .split('\n')
        .filter((line) => line.trim() !== '')
    const first = lines[0] ?? 'no error reported'
    return lines.length > 1 ? [`${first} (and ${lines.length - 1} more)`] : [first]
}

const NOT_RUN: Picture = { ink: 0, colors: 0, size: '—' }

async function runProgram(program: Program): Promise<Outcome> {
    const code = example(program.path)
    let emulator: MeasurableEmulator
    try {
        emulator = await buildProgram(program.language, code, program.settings ?? {})
    } catch (error) {
        //an assembler that refuses a program throws rather than reporting it, which is what the
        //EASy68K reference programs do here on purpose
        return {
            program,
            assembled: false,
            errors: summarize(error),
            terminated: false,
            stdOut: '',
            picture: NOT_RUN,
            milliseconds: 0,
            stoppedByTheBudget: false
        }
    }
    const assembled = emulator.errors.length === 0
    if (!assembled) {
        const errors = summarize(emulator.errors.join('\n'))
        emulator.dispose?.()
        return {
            program,
            assembled,
            errors,
            terminated: false,
            stdOut: '',
            picture: NOT_RUN,
            milliseconds: 0,
            stoppedByTheBudget: false
        }
    }
    program.drive?.(emulator)
    const stopRenderer = startFakeRenderer(emulator.peripherals.screen)
    const start = performance.now()
    let finished = false
    const run = emulator.run(INSTRUCTION_LIMIT).finally(() => {
        finished = true
    })
    //a program paced by waits spends no instructions waiting, so the limit alone would never end it
    let picture = pictureOf(emulator)
    while (!finished && performance.now() - start < RUN_BUDGET_MS) {
        await sleep(SAMPLE_MS)
        //sampled while it runs: Stop clears the Screen, so the last frame has to be read before it
        if (!finished) picture = pictureOf(emulator)
    }
    const stoppedByTheBudget = !finished
    if (stoppedByTheBudget) emulator.clear()
    await run
    const milliseconds = performance.now() - start
    stopRenderer()
    if (!stoppedByTheBudget) picture = pictureOf(emulator)
    const outcome: Outcome = {
        program,
        assembled,
        errors: [...emulator.errors],
        terminated: emulator.terminated,
        stdOut: emulator.stdOut,
        picture,
        milliseconds,
        stoppedByTheBudget
    }
    emulator.dispose?.()
    return outcome
}

/** One line of what happened, for the matrix's Result column. */
function verdictOf(outcome: Outcome): string {
    if (outcome.program.referenceOnly) {
        return outcome.assembled
            ? 'assembled, though it is checked in as a reference only'
            : `reference only, does not assemble here: ${outcome.errors[0] ?? 'no error reported'}`
    }
    if (!outcome.assembled) return `did not assemble: ${outcome.errors.join('; ')}`
    const limitOnly = outcome.errors.filter((error) => !/limit/i.test(error))
    if (limitOnly.length > 0) return `ran with errors: ${limitOnly.join('; ')}`
    if (outcome.terminated) return 'ran to termination'
    if (outcome.stoppedByTheBudget) return `ran until Stop after ${round(outcome.milliseconds)} ms`
    return 'ran to its instruction limit'
}

function firstLine(text: string): string {
    const line = text.split('\n').find((candidate) => candidate.trim() !== '') ?? ''
    return line.length > 40 ? `${line.slice(0, 40)}…` : line
}

describe('examples/', () => {
    it('lists every checked-in program', () => {
        const found: string[] = []
        const walk = (directory: string) => {
            for (const entry of readdirSync(
                new URL(`../../../../examples/${directory}`, import.meta.url),
                {
                    withFileTypes: true
                }
            )) {
                const path = directory === '' ? entry.name : `${directory}/${entry.name}`
                if (entry.isDirectory()) walk(path)
                else if (!entry.name.endsWith('.md')) found.push(path)
            }
        }
        walk('')
        //a new example must reach the matrix, so the list above is checked against the directory
        expect(found.sort()).toEqual(PROGRAMS.map((program) => program.path).sort())
    })

    it(`runs every program headlessly, history ${HISTORY_SIZE}`, async () => {
        const rows: (string | number)[][] = []
        for (const program of PROGRAMS) {
            let outcome: Outcome
            try {
                outcome = await runProgram(program)
            } catch (error) {
                rows.push([
                    program.language,
                    program.path,
                    program.exercises,
                    `threw: ${summarize(error)[0]}`,
                    '—',
                    '—'
                ])
                continue
            }
            rows.push([
                outcome.program.language,
                outcome.program.path,
                outcome.program.exercises,
                verdictOf(outcome),
                outcome.picture.size === '—'
                    ? '—'
                    : `${outcome.picture.ink.toLocaleString('en-US')} ink, ${outcome.picture.colors} colors, ${outcome.picture.size}`,
                firstLine(outcome.stdOut) || '—'
            ])
        }
        printTable(
            'Every example, run headlessly under node',
            ['Core', 'Program', 'Exercises', 'Result', 'Screen', 'First line printed'],
            rows
        )
    })

    it('reports whether the x86 Core loads under node', async () => {
        let verdict: string
        try {
            const emulator = await createMeasurableEmulator(
                'X86',
                'global _start\nsection .text\n_start:\n    mov rax, 42\n'
            )
            await emulator.check()
            await emulator.compile(HISTORY_SIZE)
            await emulator.run(INSTRUCTION_LIMIT)
            verdict =
                emulator.errors.length === 0
                    ? 'loads and runs'
                    : `errors: ${emulator.errors.join('; ')}`
            emulator.dispose?.()
        } catch (error) {
            verdict = `does not load under node: ${String(error)}`
        }
        printTable('x86 under node', ['Core', 'Verdict'], [['X86', verdict]])
    })
})
