<script lang="ts">
    import { useWorkbench } from './workbenchContext'

    const { session } = useWorkbench()
</script>

{#if session.compilationNotice}
    <div class="compilation-notice" role="status">{session.compilationNotice}</div>
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
