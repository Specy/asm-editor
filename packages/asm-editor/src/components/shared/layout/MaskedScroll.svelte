<script lang="ts">
    interface Props {
        children?: import('svelte').Snippet
        mask?: string
        padding?: string
        gap?: string
    }

    let { children, mask = '1rem', padding = '1rem 0', gap = '1rem' }: Props = $props()
</script>

<div
    class="masked-scroll"
    style="--mask-size: {mask}; --scroll-padding: {padding}; --scroll-gap: {gap};"
>
    {@render children?.()}
</div>

<style>
    .masked-scroll {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--scroll-gap);
        min-height: 0;
        overflow-y: auto;
        padding: var(--scroll-padding);
        -webkit-mask-image: linear-gradient(
            to bottom,
            transparent,
            #000 var(--mask-size),
            #000 calc(100% - var(--mask-size)),
            transparent
        );
        mask-image: linear-gradient(
            to bottom,
            transparent,
            #000 var(--mask-size),
            #000 calc(100% - var(--mask-size)),
            transparent
        );
    }
</style>
