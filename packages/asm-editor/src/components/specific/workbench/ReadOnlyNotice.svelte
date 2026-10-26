<script lang="ts">
    import type { Snippet } from 'svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    let {
        label = 'read-only',
        description,
        action,
        findOpen = false
    }: {
        label?: string
        description?: string
        action?: Snippet
        /**
         * Whether the editor's find widget is open: it opens in the same corner, where the notice
         * would cover it, so the notice hides until Find closes.
         */
        findOpen?: boolean
    } = $props()
</script>

<!-- the description on the label, clear of the action, which may have a Tooltip of its own -->
<div class="read-only-notice" class:find-open={findOpen} role="status">
    <span class="label" {@attach tooltip(description)}>{label}</span>
    {#if action}<span class="action">{@render action()}</span>{/if}
</div>

<style lang="scss">
    .read-only-notice {
        position: absolute;
        z-index: 4;
        top: 0.5rem;
        right: 1.5rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem 0.5rem;
        width: fit-content;
        max-width: calc(100% - 2.25rem);
        padding: 0.2rem 0.5rem;
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        border-radius: 0.5rem;
        color: var(--secondary-text);
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        backdrop-filter: blur(8px);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.25);
        font-size: 0.8rem;
        overflow-wrap: anywhere;
        transition:
            opacity 0.2s,
            visibility 0.2s;

        /* gone while the find widget slides in over the same corner */
        &.find-open {
            opacity: 0;
            visibility: hidden;
        }
    }
    .label {
        min-width: 0;
    }
    .action {
        display: flex;
        flex: none;
        margin-left: auto;
    }
</style>
