<script lang="ts">
    interface Props {
        style?: string
        children?: import('svelte').Snippet
    }

    let { style = '', children }: Props = $props()
</script>

<div class="navbar" {style}>
    {@render children?.()}
</div>

<style lang="scss">
    /* Pinned to the viewport. It used to be `absolute` with no positioned ancestor, which anchored
       it to the initial containing block, and that only looked pinned because the body scrolled
       inside itself while the viewport stood still. The document scrolls now (see `body` in
       global.css), so the anchor has to be the viewport itself. */
    .navbar {
        position: fixed;
        top: 0rem;
        padding: 0.5rem;
        width: 100%;
        gap: 0.8rem;
        border-radius: 0.6rem;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        display: flex;
        justify-content: space-between;
        background-color: rgba(var(--RGB-secondary), 0.5);
        backdrop-filter: blur(0.4rem);
        z-index: 4;
    }

    @media print {
        .navbar {
            display: none;
        }
    }
</style>
