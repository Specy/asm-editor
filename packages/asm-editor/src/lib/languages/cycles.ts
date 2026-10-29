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
    'A 68020 overlaps each instruction with the next and keeps recent code in a cache, so the time of one depends on its neighbours. Its manual gives each instruction’s time for the case where the instruction is in the cache already, which is what is counted here.'

/**
 * What the counter under the registers says on hover
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 30): whose cycles they
 * are, the processor the program is written for, the 68000 unless it says otherwise, and for an
 * estimate why it is one.
 */
export function cycleCounterTooltip(count: CycleCount, processor = '68000'): string {
    const since = `${formatCycles(count.total)} since it started or trap #15 task 30 last cleared the counter`
    const total = count.estimate
        ? `An estimate of the clock cycles a ${processor} takes to run this program: ${since}. ${CYCLE_ESTIMATE_REASON}`
        : `The clock cycles a ${processor} takes to run this program: ${since}.`
    if (count.last === undefined) return total
    return `${total} The newest step took ${formatCycles(count.last)}.`
}
