<script lang="ts">
    /** A page's tile in a list of pages: a link **Card** with its title and an arrow shown on hover. */
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import type { ResolvedPathname } from '$app/types'
    import Card from '#cmp/shared/layout/Card.svelte'

    interface Props {
        href: ResolvedPathname
        children?: import('svelte').Snippet
    }

    let { href, children }: Props = $props()
</script>

<Card {href} direction="row" class="navigation-link">
    {@render children?.()}
    <div class="arrow">
        <FaArrowRight />
    </div>
</Card>

<style lang="scss">
    :global(.navigation-link) {
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        width: 100%;
        padding: 1rem 1rem 1rem 2rem;
        font-size: var(--fs-lead);
    }
    .arrow {
        opacity: 0;
        height: 1.5rem;
        transition:
            opacity var(--dur-fast),
            transform var(--dur-fast);
        transform: translateX(-1rem);
    }
    :global(.navigation-link:hover) .arrow {
        opacity: 1;
        transform: translateX(0);
    }
</style>
