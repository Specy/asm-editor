<script lang="ts">
    import type { Z80FlagEffect } from '$lib/languages/Z80/Z80-documentation'

    interface Props {
        flags: Z80FlagEffect[]
    }

    let { flags }: Props = $props()
    // A table of 190 variants is unreadable if every row spells out six untouched flags, so only
    // the ones the instruction actually changes get a chip. Part of the table writes an undefined
    // flag as a space instead of a `*`, which would print as a chip with nothing after the `=`, so
    // both spellings are shown as `*`.
    let touched = $derived(flags.filter((flag) => flag.effect !== '-'))
</script>

{#if touched.length === 0}
    <span class="none" title="This instruction does not change any flag">—</span>
{:else}
    <span class="flags">
        {#each touched as flag (flag.name)}
            <span class="flag" title="{flag.name}: {flag.meaning}">
                {flag.name}{flag.effect === '+'
                    ? ''
                    : `=${flag.effect === ' ' ? '*' : flag.effect}`}
            </span>
        {/each}
    </span>
{/if}

<style lang="scss">
    .flags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem;
    }
    .flag {
        font-family: FiraCode;
        font-size: 0.75rem;
        padding: 0 0.3rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        white-space: nowrap;
    }
    .none {
        opacity: 0.6;
    }
</style>
