<script lang="ts">
    /**
     * A shortcut's keys as they read, Shift+→ with the arrow drawn as an icon, as the search
     * palette's footer draws its arrow keys, rather than as a text arrow, which reads as `->` in
     * the app's fonts. The arrow's name stays in the text for a screen reader. Drawn inside a `Kbd`
     * or a button, at its text's size.
     */
    import { shortcutParts, type ShortcutArrow } from '#stores/shortcutsStore.ts'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaArrowRight from '~icons/fa-solid/arrow-right'

    /** The shortcut in the shortcut store's form, such as `ShiftLeft+ArrowRight`. */
    let { shortcut }: { shortcut: string } = $props()

    const ARROWS = {
        up: { icon: FaArrowUp, name: 'Up' },
        down: { icon: FaArrowDown, name: 'Down' },
        left: { icon: FaArrowLeft, name: 'Left' },
        right: { icon: FaArrowRight, name: 'Right' }
    } satisfies Record<ShortcutArrow, object>

    const parts = $derived(shortcutParts(shortcut))
</script>

{#each parts as part, index (index)}
    {#if part.arrow}
        {@const arrow = ARROWS[part.arrow]}
        <span class="arrow"
            ><arrow.icon aria-hidden="true" /><span class="visually-hidden">{arrow.name}</span
            ></span
        >
    {:else}
        {part.text}
    {/if}
{/each}

<style>
    .arrow {
        display: inline-flex;
        align-items: center;
    }

    /* a little under the text's size, as a key cap's arrow is, in a Kbd and a button alike */
    .arrow :global(svg) {
        width: 0.85em;
        height: 0.85em;
    }
</style>
