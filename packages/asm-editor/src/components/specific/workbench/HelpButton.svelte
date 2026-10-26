<script lang="ts">
    /**
     * A "?" in a read-only notice that opens the Documentation on what the notice is over
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 9). Its question is its accessible name and its tooltip.
     */
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    let { label, onclick }: { label: string; onclick?: () => void } = $props()
</script>

<button type="button" class="help" aria-label={label} {@attach tooltip(label)} {onclick}>?</button>

<style lang="scss">
    .help {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.3rem;
        height: 1.3rem;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: var(--secondary-text);
        background: var(--secondary);
        cursor: pointer;
        font-size: inherit;
        font-weight: bold;
        line-height: 1;

        &:hover {
            color: var(--tertiary-text);
            background: var(--tertiary);
        }

        &:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 2px;
        }
    }
</style>
