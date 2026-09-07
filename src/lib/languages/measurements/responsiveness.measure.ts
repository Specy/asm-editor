import { describe, it } from 'vitest'
import {
    ANIMATION_EXAMPLES,
    buildProgram,
    COMPUTE_LOOP,
    example,
    MEASURED_LANGUAGES,
    median,
    printTable,
    round,
    sleep,
    startFakeRenderer,
    type MeasurableEmulator,
    type MeasuredLanguage
} from './harness'
import type { EmulatorSettings } from '$lib/languages/commonLanguageFeatures.svelte'

/**
 * How long the host is held between two slices, and how long Stop then takes to be answered.
 * [ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md) budgets a tenth of a
 * second for Stop, and the host being held is what that budget is really about: a Core runs on the
 * main thread, so a click on Stop is not even delivered until the slice it lands in comes back.
 * The measurement is therefore the loop lag — how late a 10 ms timer fires while a program runs —
 * which is the slice length as the user feels it, plus the latency of the Stop that follows.
 *
 * Three shapes of program, because they stress the slice budget differently: a compute loop (the
 * budget's own calibration case), the animation examples (which end every slice on a wait), and a
 * drawing loop with no wait at all, which is the case an adapter counting traps rather than
 * instructions can overshoot by minutes.
 */

/** How long each program is left running while the lag is sampled. */
const RUN_MS = 3_000
const LAG_INTERVAL_MS = 10

/** A program that draws as fast as it can, never waits, and asks for a whole image every frame. */
const DRAWING_LOOP: Partial<Record<MeasuredLanguage, string>> = {
    Z80: [
        'P_FILL  equ 0x11',
        'P_CMD   equ 0x17',
        'C_CLEAR equ 9',
        'C_BUF   equ 11',
        'C_SHOW  equ 13',
        '        .org 0x8000',
        'start:  ld a, C_BUF',
        '        out (P_CMD), a',
        'loop:   ld a, 0x03',
        '        out (P_FILL), a',
        '        ld a, C_CLEAR',
        '        out (P_CMD), a',
        '        ld a, C_SHOW',
        '        out (P_CMD), a',
        '        jp loop'
    ].join('\n'),
    M68K: [
        '    ORG $1000',
        'START:',
        '    move.b  #92,d0',
        '    move.l  #17,d1',
        '    trap    #15         * double buffering on',
        'loop:',
        '    move.b  #11,d0',
        '    move.l  #$FF00,d1',
        '    trap    #15         * clear the whole image',
        '    move.b  #94,d0',
        '    trap    #15         * and present it',
        '    bra     loop'
    ].join('\n')
}

type Lag = { lags: number[]; stop: () => void }

/**
 * How late a timer fires. Nothing on the host runs while a Core does, so this is the length of the
 * slice the timer landed in — the delay a click on Stop would have suffered.
 */
function startLagProbe(): Lag {
    const lags: number[] = []
    let due = performance.now() + LAG_INTERVAL_MS
    const timer = setInterval(() => {
        const now = performance.now()
        lags.push(Math.max(0, now - due))
        due = now + LAG_INTERVAL_MS
    }, LAG_INTERVAL_MS)
    return { lags, stop: () => clearInterval(timer) }
}

type Sample = {
    label: string
    language: MeasuredLanguage
    lags: number[]
    stopMs: number
    errors: string[]
}

async function sample(
    label: string,
    language: MeasuredLanguage,
    code: string,
    settings: EmulatorSettings = {},
    drive?: (emulator: MeasurableEmulator) => void
): Promise<Sample> {
    const emulator = await buildProgram(language, code, settings)
    drive?.(emulator)
    const stopRenderer = startFakeRenderer(emulator.peripherals.screen)
    const probe = startLagProbe()
    //0 is the app's "no instruction limit" setting, so only Stop ends the run
    const run = emulator.run(0)
    await sleep(RUN_MS)
    const stopAt = performance.now()
    emulator.clear()
    await run
    const stopMs = performance.now() - stopAt
    probe.stop()
    stopRenderer()
    const errors = emulator.errors.filter((error) => !/limit/i.test(error))
    emulator.dispose?.()
    //the first tick covers the build, not the run
    return { label, language, lags: probe.lags.slice(1), stopMs, errors }
}

function row(sample: Sample): (string | number)[] {
    if (sample.lags.length === 0) return [sample.language, sample.label, '—', '—', '—', '—']
    return [
        sample.language,
        sample.label,
        round(median(sample.lags)),
        round(Math.max(...sample.lags)),
        sample.lags.filter((lag) => lag > 100).length,
        round(sample.stopMs)
    ]
}

const HEADER = [
    'Core',
    'Program',
    'Median loop lag ms',
    'Worst loop lag ms',
    'Ticks over 100 ms',
    'Stop answered in ms'
]

describe('responsiveness while a program runs', () => {
    it('measures the loop lag of a compute-only run', async () => {
        const rows: (string | number)[][] = []
        for (const language of MEASURED_LANGUAGES) {
            rows.push(row(await sample('compute loop', language, COMPUTE_LOOP[language])))
        }
        printTable('Loop lag during a compute-only run', HEADER, rows)
    })

    it('measures the loop lag of the animation examples', async () => {
        const rows: (string | number)[][] = []
        for (const animation of ANIMATION_EXAMPLES) {
            rows.push(
                row(
                    await sample(animation.path, animation.language, example(animation.path), {
                        display: animation.display
                    })
                )
            )
        }
        printTable('Loop lag during the animation examples', HEADER, rows)
    })

    it('measures the loop lag of a drawing loop that never waits', async () => {
        const rows: (string | number)[][] = []
        for (const [language, code] of Object.entries(DRAWING_LOOP)) {
            rows.push(row(await sample('drawing loop', language as MeasuredLanguage, code)))
        }
        printTable('Loop lag during a drawing loop with no wait', HEADER, rows)
    })
})
