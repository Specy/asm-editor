<script lang="ts">
    import type { ResolvedPathname } from '$app/types'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    interface Props {
        href: ResolvedPathname
        /** What the link leads to, where its one word does not say. */
        title?: string
        icon?: import('svelte').Snippet
        description?: import('svelte').Snippet
    }

    let { href, title, icon, description }: Props = $props()
</script>

<a class="link-element" {href} {@attach tooltip(title)}>
    <div class="link-icon">
        {@render icon?.()}
    </div>
    <div class="link-description">
        {@render description?.()}
    </div>
</a>

<style lang="scss">
    .link-element {
        display: flex;
        flex-direction: column;
        background-color: var(--secondary);
        gap: 1rem;
        flex: 1;
        min-width: 10rem;
        padding: 1.4rem;
        align-items: center;
        justify-content: space-between;
        transition: all 0.3s;
        &:hover {
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }
    }
    .link-icon {
        width: 1.8rem;
        height: 1.8rem;
    }
    .link-description {
        font-size: 1.2rem;
        text-align: center;
    }

    @media screen and (max-width: 650px) {
        .link-element {
            padding: 1.2rem;
        }

        .link-icon {
            width: 1.5rem;
            height: 1.5rem;
        }
        .link-description {
            font-size: 1.1rem;
        }
    }
</style>
