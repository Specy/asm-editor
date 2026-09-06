import { describe, it } from 'vitest'
import {
    buildProgram,
    COMPUTE_LOOP,
    HISTORY_SIZE,
    MEASURED_LANGUAGES,
    median,
    printTable,
    round,
    runUnsliced,
    startFakeRenderer,
    type MeasuredLanguage
} from './harness'

/**
 * Instructions per second with and without the scheduler's yields, on every Core that runs under
 * node ([ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md): yields must cost
 * under five percent of compute-only throughput). The same number sets each adapter's
 * `*_INSTRUCTIONS_PER_MS`, which is how a slice's time budget becomes an instruction budget.
 *
 * "Without yields" is one slice big enough for the whole run, which is what the scheduler did before
 * ADR 0007; "with yields" is `run()`, the real path, which slices, yields to the host between slices
 * and re-enters the Core each time. Both execute the same instruction count of the same tight loop,
 * built the way the project page builds a program (the shipped undo history size).
 */

/** How long one measured run should take, so a slow Core is not measured on a hundred instructions. */
const TARGET_RUN_MS = 2_000
const PROBE_INSTRUCTIONS = 100_000
const REPEATS = 3

type Result = {
    language: MeasuredLanguage
    instructions: number
    unsliced: number[]
    sliced: number[]
    note: string
}

async function measure(language: MeasuredLanguage): Promise<Result> {
    const code = COMPUTE_LOOP[language]
    const result: Result = { language, instructions: 0, unsliced: [], sliced: [], note: '' }

    //warm up the Core and the assembler, then size the run from what one probe slice cost
    const probe = await buildProgram(language, code)
    if (probe.errors.length > 0) {
        result.note = `did not assemble: ${probe.errors.join('; ')}`
        return result
    }
    const probeStart = performance.now()
    await runUnsliced(probe, PROBE_INSTRUCTIONS)
    const probeMs = Math.max(1, performance.now() - probeStart)
    probe.dispose?.()
    const instructions = Math.min(
        50_000_000,
        Math.max(200_000, Math.round((PROBE_INSTRUCTIONS / probeMs) * TARGET_RUN_MS))
    )
    result.instructions = instructions

    for (let repeat = 0; repeat < REPEATS; repeat++) {
        const one = await buildProgram(language, code)
        const oneStart = performance.now()
        await runUnsliced(one, instructions)
        result.unsliced.push(performance.now() - oneStart)
        one.dispose?.()

        const many = await buildProgram(language, code)
        //the MIPS and RISC-V adapters put their configured geometry back on the Screen at every
        //build, which leaves it dirty; without a renderer to paint it the scheduler would hold the
        //short slice budget for the whole run, which is not what a browser does
        const stopRenderer = startFakeRenderer(many.peripherals.screen)
        const manyStart = performance.now()
        await many.run(instructions)
        result.sliced.push(performance.now() - manyStart)
        stopRenderer()
        many.dispose?.()
    }
    return result
}

describe('compute-only throughput', () => {
    it(`measures instructions per second with and without yields, history ${HISTORY_SIZE}`, async () => {
        const rows: (string | number)[][] = []
        for (const language of MEASURED_LANGUAGES) {
            let result: Result
            try {
                result = await measure(language)
            } catch (error) {
                rows.push([language, '—', '—', '—', '—', `failed: ${String(error)}`])
                continue
            }
            if (result.note !== '') {
                rows.push([result.language, '—', '—', '—', '—', result.note])
                continue
            }
            const unsliced = median(result.unsliced)
            const sliced = median(result.sliced)
            const unslicedIps = (result.instructions / unsliced) * 1000
            const slicedIps = (result.instructions / sliced) * 1000
            rows.push([
                result.language,
                result.instructions.toLocaleString('en-US'),
                Math.round(unslicedIps).toLocaleString('en-US'),
                Math.round(slicedIps).toLocaleString('en-US'),
                `${round(((unsliced - sliced) / unsliced) * -100, 2)}%`,
                round(slicedIps / 1000)
            ])
        }
        printTable(
            'Compute-only throughput',
            [
                'Core',
                'Instructions',
                'Instructions/s, one slice',
                'Instructions/s, sliced and yielding',
                'Cost of yielding',
                'Measured instructions/ms'
            ],
            rows
        )
    })
})
