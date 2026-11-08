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
    /* One of the home page's quick links, a card in a row of them over hex bytes: a quarter
       see-through, so the bytes show through faintly, and a plain change of colour under the
       pointer, with nothing moving or fading. The lines between the cards are their own top and
       left borders, solid over the page so the bytes do not show through them, pulled back a
       pixel so that those along the row's edges fall outside it, which cuts them off. */
    .link-element {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        flex: 1;
        min-width: 10rem;
        margin: -1px 0 0 -1px;
        padding: 1.4rem;
        align-items: center;
        justify-content: space-between;
        background-color: color-mix(in srgb, var(--background) 75%, transparent);
        color: var(--background-text);
        border-top: 1px solid color-mix(in srgb, var(--tertiary) 60%, var(--background));
        border-left: 1px solid color-mix(in srgb, var(--tertiary) 60%, var(--background));
        &:hover {
            background-color: color-mix(in srgb, var(--accent) 14%, var(--background));
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
