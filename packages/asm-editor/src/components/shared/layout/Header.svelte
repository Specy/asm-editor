<script lang="ts">
    /**
     * A heading. As an `h1`, the default, it is the page's title, drawn in one style on every page
     * but the home page (design-system.md, D8): Rubik at `--fs-h1`, which the token steps down on
     * phones, at 600 (the owner's, 2026-11-08; D8 had 700), tracked −0.03em, its lines balanced,
     * with the room above and below it that the content pages gave their titles. The other levels
     * keep the sizes the page around them gives.
     */
    interface Props {
        noMargin?: boolean
        style?: string
        id?: string | undefined
        type?: 'h1' | 'h2' | 'h3' | 'h4'
        children?: import('svelte').Snippet
    }

    let { noMargin = false, style = '', id = undefined, type = 'h1', children }: Props = $props()
</script>

{#if type === 'h1'}
    <h1 class:noMargin {style} {id}>
        {@render children?.()}
    </h1>
{:else if type === 'h2'}
    <h2 class:noMargin {style} {id}>
        {@render children?.()}
    </h2>
{:else if type === 'h3'}
    <h3 class:noMargin {style} {id}>
        {@render children?.()}
    </h3>
{:else if type === 'h4'}
    <h4 class:noMargin {style} {id}>
        {@render children?.()}
    </h4>
{/if}

<style>
    h1 {
        margin: 0.75rem 0 1.5rem;
        font: 600 var(--fs-h1) / 1.16 var(--font-ui);
        letter-spacing: -0.03em;
        text-wrap: balance;
    }

    .noMargin {
        margin: 0;
    }
</style>
