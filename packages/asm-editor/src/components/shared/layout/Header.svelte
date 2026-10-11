<script lang="ts">
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
        margin: 1rem;
        margin-left: 0;
    }

    .noMargin {
        margin: 0;
    }
</style>
