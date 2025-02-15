<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'

    let { md, note } = $props<{
        md: string
        note: string
    }>()

</script>

<div class="below-line-content">
    <MarkdownRenderer source={md} />
    {#if note}
        <div class="note">
            {note}
        </div>
    {/if}
</div>

<style lang="scss">
    .below-line-content {
        position: relative;
        background-color: rgba(var(--RGB-tertiary), 0.3);
        //border-top: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        //border-bottom: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        border-left: solid 1px #404040;
        padding: 0.1rem 0;
        font-size: 1rem;
    }

    :global(._markdown .shiki) {
        border-radius: 0;
        background-color: transparent !important;
        padding: 0 !important;
    }

    .note {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        line-height: 1;
        opacity: 0.5;
        font-size: 0.8rem;
        transform: translateY(-50%);
    }
</style>
