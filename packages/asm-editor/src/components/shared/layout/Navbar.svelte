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
    /* flat, the width of the screen, set off from the page by one rule like the home page's
       dividers, and see-through enough that the page shows faintly as it scrolls under */
    .navbar {
        position: fixed;
        top: 0rem;
        /* the right side as tight as the top, so the last button sits square in the corner */
        padding: 0.5rem 0.5rem 0.5rem 1rem;
        width: 100%;
        gap: 0.8rem;
        display: flex;
        justify-content: space-between;
        background-color: color-mix(in srgb, var(--background) 82%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--background-text) 11%, transparent);
        backdrop-filter: blur(0.5rem);
        z-index: 4;
    }

    @media (max-width: 600px) {
        .navbar {
            padding: 0.5rem;
        }
    }

    @media print {
        .navbar {
            display: none;
        }
    }
</style>
