import type { CycleCount } from './commonLanguageFeatures.svelte'

/**
 * A count of clock cycles as the panels and the Log write it, grouped in thousands: `12,345`. In
 * English whatever the browser's language, as the rest of the editor's wording is.
 */
export function formatCycles(cycles: bigint | number): string {
    return cycles.toLocaleString('en-US')
}

/**
 * What the counter under the registers says on hover
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 30).
 */
export function cycleCounterTooltip(count: CycleCount): string {
    const total = `The clock cycles a 68000 takes to run this program: ${formatCycles(count.total)} since it started or trap #15 task 30 last cleared the counter.`
    if (count.last === undefined) return total
    return `${total} The newest step took ${formatCycles(count.last)}.`
}
