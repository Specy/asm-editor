<script lang="ts">
    /**
     * The cycle counter under the registers, for a Target whose Core counts the clock cycles its
     * processor takes: "Cycles 12,345 (+8)", the newest step's cost in parentheses
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
        /** The processor the program is written for, when it is a later one than the 68000. */
        processor?: string
        style?: string
    }

    let { cycles, processor, style = '' }: Props = $props()
</script>

<div class="cycles-line" {style} {@attach tooltip(cycleCounterTooltip(cycles, processor))}>
    <span class="label">Cycles</span>
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
        gap: 0.4rem;
        min-width: 0;
        font-size: 0.85rem;
        white-space: nowrap;
        overflow: hidden;
    }

    .label {
        opacity: 0.8;
    }

    .count {
        font-family: 'Fira Code', monospace;
    }

    /* the newest step's cost, in the colour the panels give what the newest step changed */
    .last {
        font-family: 'Fira Code', monospace;
        color: var(--accent);
    }
</style>
