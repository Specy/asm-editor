<script lang="ts">
    /**
     * The cycle counter above the PC, for a Target whose Core counts the clock cycles its processor
     * takes: "Cycles 12,345 (+8)", the newest step's cost in parentheses at the line's right end, so
     * that a count growing a digit moves nothing
     * ([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md), decision 30). An
     * estimate, a 68020 program's, is marked "Cycles ≈ 12,345 (+8)", and the hover says why. The
     * host draws nothing for a Target that does not count.
     */
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import type { CycleCount } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import {
        CYCLE_ESTIMATE_MARK,
        cycleCounterTooltip,
        formatCycles
    } from '#lib/languages/cycles.ts'

    interface Props {
        cycles: CycleCount
        /**
         * The processor the program is written for, when it is a later one than the 68000 or one
         * `opt bit` gave the bit fields.
         */
        processor?: string
        style?: string
    }

    let { cycles, processor, style = '' }: Props = $props()
</script>

<div class="cycles-line" {style} {@attach tooltip(cycleCounterTooltip(cycles, processor))}>
    <span class="small-heading">Cycles</span>
    <span class="count"
        >{cycles.estimate ? `${CYCLE_ESTIMATE_MARK} ` : ''}{formatCycles(cycles.total)}</span
    >
    {#if cycles.last !== undefined}
        <span class="last">(+{formatCycles(cycles.last)})</span>
    {/if}
</div>

<style>
    .cycles-line {
        display: flex;
        flex: none;
        align-items: baseline;
        gap: 0.5rem;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
    }

    /* the label a panel's heading, the count in the font of the PC's value under it */
    .count {
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        color: var(--text-muted);
    }

    /* the newest step's cost, in the colour the panels give what the newest step changed, at the
       right end, where neither the count before it nor its own width moves the rest */
    .last {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        color: var(--accent);
    }
</style>
