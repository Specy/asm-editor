import type { CycleCount } from './commonLanguageFeatures.svelte'

/**
 * A count of clock cycles as the panels and the Log write it, grouped in thousands: `12,345`. In
 * English whatever the browser's language, as the rest of the editor's wording is.
 */
export function formatCycles(cycles: bigint | number): string {
    return cycles.toLocaleString('en-US')
}

/** What the panels put before a count of cycles that is an estimate: `≈ 12,345`. */
export const CYCLE_ESTIMATE_MARK = '≈'

/**
 * Why a 68020 program's cycles are an estimate, as the counter's hover and a History row's say it
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 3): its manual can give
 * only the time of the case where each instruction is in the cache already.
 */
export const CYCLE_ESTIMATE_REASON =
    '68020 timings depend on overlapping instruction execution and the instruction cache. This estimate uses the manual’s timings for instructions already in the cache.'

/**
 * How the panels name a processor that `opt bit` gave the 68020's bit fields: `68000 with bit
 * fields`.
 */
export const WITH_BIT_FIELDS = 'with bit fields'

/**
 * Why the cycles of a program for `processor`, as the panels name it, are an estimate: a 68020's,
 * its manual's cache case; and a 68000's or a 68010's that `opt bit` gave a bit field, which takes
 * that same time, as EASy68K counts it, since neither processor has one.
 */
export function cycleEstimateReason(processor?: string): string {
    return processor?.endsWith(WITH_BIT_FIELDS)
        ? 'Bit-field instructions enabled by opt bit use the 68020 manual’s timings for instructions already in the cache, as in EASy68K. All other instructions use exact 68000 or 68010 timings.'
        : CYCLE_ESTIMATE_REASON
}

/**
 * What the counter above the PC says on hover
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 30): whose cycles they
 * are, the processor the program is written for, the 68000 unless it says otherwise, and for an
 * estimate why it is one.
 */
export function cycleCounterTooltip(count: CycleCount, processor = '68000'): string {
    const since = `${formatCycles(count.total)} since the program started or trap #15 task 30 last reset the counter`
    const total = count.estimate
        ? `Estimated ${processor} clock cycles: ${since}. ${cycleEstimateReason(processor)}`
        : `${processor} clock cycles: ${since}.`
    if (count.last === undefined) return total
    return `${total} Last step: ${formatCycles(count.last)} ${count.last === 1 ? 'cycle' : 'cycles'}.`
}
