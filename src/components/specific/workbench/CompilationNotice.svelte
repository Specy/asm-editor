<script lang="ts">
    let { notice }: { notice: string } = $props()
</script>

{#if notice}
    <div class="compilation-notice" role="status">{notice}</div>
{/if}

<style lang="scss">
    .compilation-notice {
        padding: 0.55rem 0.75rem;
        color: var(--secondary-text);
        border-bottom: 1px solid var(--wb-line);
        background: color-mix(in srgb, var(--accent) 12%, var(--secondary));
        font-size: 0.8rem;
    }
</style>
