<script lang="ts">
    import type { Snippet } from 'svelte'

    let {
        label = 'read-only',
        description,
        action
    }: {
        label?: string
        description?: string
        action?: Snippet
    } = $props()
</script>

<div class="read-only-notice" role="status" title={description ?? label}>
    <span class="label">{label}</span>
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
