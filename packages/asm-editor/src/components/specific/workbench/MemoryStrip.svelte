<script lang="ts">
    /**
     * What stands beside the registers in memory's place while the Preferences set the memory panel
     * to 0 bytes: a strip as tall as the registers, whose button brings memory back at its default
     * size. On a desktop the debug column's Collapse, which memory's controls hold, is at its top.
     */
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { DEFAULT_MEMORY_PANEL_SIZE, preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import FaMemory from '~icons/fa-solid/memory'
    import FaAngleDoubleRight from '~icons/fa-solid/angle-double-right'

    interface Props {
        /** The column's Collapse, which only the desktop's column has. */
        onCollapse?: () => void
        /** The column Collapse collapses, which its button names. */
        columnId?: string
        /** That button, which the strip the column collapses to hands the focus back to. */
        collapseButton?: HTMLButtonElement
    }

    let { onCollapse, columnId, collapseButton = $bindable() }: Props = $props()
</script>

<div class="memory-strip">
    {#if onCollapse}
        <button
            class="collapse-button"
            aria-expanded="true"
            aria-controls={columnId}
            aria-label="Collapse"
            {@attach tooltip('Collapse the registers and memory')}
            bind:this={collapseButton}
            onclick={onCollapse}
        >
            <FaAngleDoubleRight />
        </button>
    {/if}
    <button
        class="show-button"
        aria-label="Show memory"
        {@attach tooltip(`Show the memory panel (${DEFAULT_MEMORY_PANEL_SIZE} bytes per page)`, {
            placement: 'left'
        })}
        onclick={() => preferencesStore.setValue('memoryPanelSize', DEFAULT_MEMORY_PANEL_SIZE)}
    >
        <FaMemory />
        <span class="strip-label ellipsis">Memory</span>
    </button>
</div>

<style lang="scss">
    .memory-strip {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 32px;
        min-height: 0;
    }

    button {
        display: flex;
        align-items: center;
        border: none;
        background: transparent;
        color: var(--secondary-text);
        font: inherit;
        cursor: pointer;

        :global(svg) {
            flex: none;
            width: var(--fs-small);
            height: var(--fs-small);
        }

        &:hover {
            background-color: color-mix(in srgb, var(--accent) 15%, transparent);
        }

        &:focus-visible {
            outline: solid 1px var(--accent);
            outline-offset: -0.2rem;
        }
    }

    /* as tall as memory's controls, and ruled off from the strip under it as they are from the page */
    .collapse-button {
        flex: none;
        justify-content: center;
        height: 2.3rem;
        padding: 0;
        border-bottom: 1px solid var(--wb-line, var(--tertiary));
    }

    /* the rest of the strip, the debug column's own strip's look: the name read top to bottom */
    .show-button {
        flex: 1;
        flex-direction: column;
        gap: 0.6rem;
        min-height: 0;
        padding: 0.6rem 0;
        font-size: var(--fs-small);
    }

    .strip-label {
        writing-mode: vertical-rl;
        min-height: 0;
        color: var(--text-muted);
    }
</style>
