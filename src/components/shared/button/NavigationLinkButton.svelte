<script lang="ts">
    import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'

    interface Props {
        href: string
        children?: import('svelte').Snippet
    }

    let { href, children }: Props = $props()
</script>

<a class="link" {href}>
    {@render children?.()}
    <div class="arrow">
        <FaArrowRight />
    </div>
</a>

<style lang="scss">
    .link {
        padding: 1rem 2rem;
        padding-right: 1rem;
        align-items: center;
        border-radius: 0.5rem;
        width: 100%;
        display: flex;
        gap: 1rem;
        font-size: 1.2rem;
        justify-content: space-between;
        background-color: var(--secondary);
        color: var(--secondary-text);
        transition: all 0.2s;
        &:hover {
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }
    }
    .arrow {
        opacity: 0;
        height: 1.5rem;
        transition: all 0.2s;
        transform: translateX(-1rem);
    }
    .link:hover .arrow {
        opacity: 1;
        transform: translateX(0);
    }
</style>
