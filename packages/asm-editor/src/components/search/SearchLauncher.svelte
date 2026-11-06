<script lang="ts">
    /**
     * A box that opens the page's search palette: full width at the top of a landing page, compact
     * at the top of a sidebar. It looks like the box it opens, and what is typed into it goes on in
     * the palette. Pointing at it or focusing it starts the search model loading, so it is on its
     * way by the time the palette opens.
     */
    import FaSearch from '~icons/fa-solid/search'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import { shortcutLabel, shortcutsStore, ShortcutAction } from '#stores/shortcutsStore.ts'
    import { openSearchPalette } from './paletteState.svelte'
    import { SITE_SCOPE } from '#lib/search/scope.ts'

    interface Props {
        placeholder?: string
        size?: 'full' | 'compact'
        /** Opens the site's palette, which searches everything, rather than the page's. */
        site?: boolean
    }

    let { placeholder = 'Search', size = 'compact', site = false }: Props = $props()
    const owner = $derived(site ? 'site' : 'page')

    /** The model, and for the site's search its index too: no page preloads every shard. */
    function warm() {
        searchClient.warmModel()
        if (site)
            searchClient
                .loadScope(SITE_SCOPE)
                .catch((error: Error) =>
                    console.warn(`search: could not load the index (${error.message})`)
                )
    }

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
    <span class="placeholder">{placeholder}</span>
    {#if key}
        <kbd>{shortcutLabel(key)}</kbd>
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
        border-radius: 0.5rem;
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
        font-size: 0.9rem;
    }
    .full {
        padding: 0.8rem 1rem;
        font-size: 1.05rem;
    }
    .icon {
        display: flex;
        flex: none;
        width: 0.95em;
        height: 0.95em;
        opacity: 0.7;
    }
    .placeholder {
        flex: 1;
        min-width: 0;
        opacity: 0.7;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    kbd {
        flex: none;
        padding: 0.05rem 0.4rem;
        border-radius: 0.3rem;
        border: 1px solid var(--tertiary);
        font-family: inherit;
        font-size: 0.75rem;
        opacity: 0.8;
    }
</style>
