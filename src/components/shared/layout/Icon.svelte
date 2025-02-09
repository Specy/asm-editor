<script>
    import { createBubbler } from 'svelte/legacy'

    const bubble = createBubbler()
    /** @type {{size?: number, style?: string, children?: import('svelte').Snippet}} */
    let { size = 1.2, style = '', children } = $props()
</script>

<div
    class="icon"
    style={`width:${size}rem; min-width: ${size}rem; height:${size}rem; ${style};`}
    onclick={bubble('click')}
>
    {@render children?.()}
</div>

<style>
    .icon {
        cursor: pointer;
        padding: 0;
        margin: 0;
        width: unset;
        height: unset;
        color: inherit;
        border: none;
        background: none;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
</style>
