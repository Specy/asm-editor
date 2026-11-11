<script lang="ts">
    /**
     * A box that opens the page's search palette: full width at the top of a landing page, compact
     * at the top of a sidebar. It looks like the box it opens, and what is typed into it goes on in
     * the palette. Pointing at it or focusing it starts the palette's index and the search model
     * loading, so they are on their way by the time the palette opens.
     */
    import FaSearch from '~icons/fa-solid/search'
    import { shortcutsStore, ShortcutAction } from '#stores/shortcutsStore.ts'
    import { openSearchPalette, warmSearch } from './paletteState.svelte'
    import Kbd from '#cmp/shared/misc/Kbd.svelte'
    import ShortcutKeys from '#cmp/shared/misc/ShortcutKeys.svelte'

    interface Props {
        placeholder?: string
        size?: 'full' | 'compact'
        /** Opens the site's palette, which searches everything, rather than the page's. */
        site?: boolean
    }

    let { placeholder = 'Search', size = 'compact', site = false }: Props = $props()
    const owner = $derived(site ? 'site' : 'page')

    /** The palette's index and the model, on their way before the palette opens. */
    const warm = () => warmSearch(owner)

    const key = $derived(
        [...$shortcutsStore.entries()].find(
            ([, shortcut]) => shortcut.type === ShortcutAction.SearchDocumentation
        )?.[0]
    )

    function onkeydown(event: KeyboardEvent) {
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            openSearchPalette(event.key, owner)
        } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault()
            openSearchPalette('', owner)
        }
    }
</script>

<button
    type="button"
    class="search-launcher {size}"
    aria-haspopup="dialog"
    onclick={() => openSearchPalette('', owner)}
    onpointerenter={warm}
    onfocus={warm}
    {onkeydown}
>
    <span class="icon" aria-hidden="true"><FaSearch /></span>
    <span class="placeholder ellipsis">{placeholder}</span>
    {#if key}
        <Kbd><ShortcutKeys shortcut={key} /></Kbd>
    {/if}
</button>

<style>
    .search-launcher {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        min-width: 0;
        border: 1px solid color-mix(in srgb, var(--tertiary) 80%, transparent);
        border-radius: var(--r-control);
        background-color: var(--secondary);
        color: var(--secondary-text);
        font: inherit;
        text-align: left;
        cursor: text;
    }
    .search-launcher:hover {
        border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    }
    .search-launcher:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }
    .compact {
        padding: 0.45rem 0.6rem;
        font-size: var(--fs-small);
    }
    .full {
        padding: 0.8rem 1rem;
        font-size: var(--fs-prose);
    }
    .icon {
        display: flex;
        flex: none;
        width: 0.95em;
        height: 0.95em;
        opacity: 0.7;
    }
    /* as dim as the placeholder beside it */
    .search-launcher :global(.kbd) {
        color: var(--text-muted);
    }
    .placeholder {
        flex: 1;
        min-width: 0;
        color: var(--text-muted);
    }
</style>
