<script lang="ts">
    /**
     * An icon in a box of one size, a step of the type scale or the size of the text round it. A
     * plain box: most icons sit inside a button or a link already, whose pointer it takes, and a
     * clickable icon is an `IconButton` or a `<button>` round it.
     */
    import type { Snippet } from 'svelte'
    import { iconLength, type IconSize } from '#src/styles/iconSizes.ts'

    interface Props {
        size?: IconSize
        style?: string
        children?: Snippet
    }

    let { size = 'lead', style = '', children }: Props = $props()
    /** a step of the type scale, or the size of the text round it (styles/iconSizes.ts) */
    const length = $derived(iconLength(size))
    const boxStyle = $derived(`width:${length}; min-width: ${length}; height:${length}; ${style};`)
</script>

<div class="icon" style={boxStyle}>
    {@render children?.()}
</div>

<style>
    .icon {
        padding: 0;
        margin: 0;
        width: unset;
        height: unset;
        color: inherit;
        font: inherit;
        border: none;
        background: none;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
</style>
