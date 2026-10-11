<script>
    /** @type {{size?: number, style?: string, label?: string, onClick?:  (e: MouseEvent) => void, children?: import('svelte').Snippet}} */
    let { size = 1.2, style = '', label, children, onClick } = $props()
    const boxStyle = $derived(
        `width:${size}rem; min-width: ${size}rem; height:${size}rem; ${style};`
    )
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
