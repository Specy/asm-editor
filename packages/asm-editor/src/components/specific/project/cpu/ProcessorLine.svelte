<script lang="ts">
    /**
     * The processor a Build's program is written for, beside the registers, while it is one of the
     * Target's later processors: an M68K program's `opt p=68020` line makes the registers and the
     * instructions the 68020's ([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md),
     * decision 3), and `opt bit` gives a 68000 program the bit fields, `68000 with bit fields`.
     * The host draws nothing for the processor a Target starts on as it is. The badge is the one a
     * later processor's instructions carry in the Documentation.
     */
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    interface Props {
        processor: string
        style?: string
    }

    let { processor, style = '' }: Props = $props()
</script>

<div class="processor-line" {style}>
    <span class="label">Processor</span>
    <span class="processor" {@attach tooltip(`Processor selected for this program: ${processor}`)}
        >{processor}</span
    >
</div>

<style>
    .processor-line {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
        font-size: 0.85rem;
    }

    .label {
        opacity: 0.8;
    }

    .processor {
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.75rem;
        line-height: 1.5;
        background-color: var(--accent2);
        color: var(--accent2-text);
        white-space: nowrap;
    }
</style>
