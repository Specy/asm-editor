<script lang="ts">
    import type { Snippet } from 'svelte'
    import { iconLength, type IconSize } from '#src/styles/iconSizes.ts'

    interface Props {
        size?: IconSize
        style?: string
        label?: string
        onClick?: (e: MouseEvent) => void
        children?: Snippet
    }

    let { size = 'lead', style = '', label, children, onClick }: Props = $props()
    /** a step of the type scale, or the size of the text round it (styles/iconSizes.ts) */
    const length = $derived(iconLength(size))
    const boxStyle = $derived(`width:${length}; min-width: ${length}; height:${length}; ${style};`)
</script>

<!-- a clickable icon is a button so the keyboard can reach it; the others stay plain boxes, since
     most of them sit inside a button already -->
{#if onClick}
    <button type="button" class="icon" aria-label={label} style={boxStyle} onclick={onClick}>
        {@render children?.()}
    </button>
{:else}
    <div class="icon" style={boxStyle}>
        {@render children?.()}
    </div>
{/if}

<style>
    .icon {
        cursor: pointer;
        padding: 0;
        margin: 0;
        width: unset;
        height: unset;
        color: inherit;
        /* a button would take the browser's smaller control font, and the em sized glyph with it */
        font: inherit;
        border: none;
        background: none;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
</style>
