<script module lang="ts">
    import { lazyLoad } from '#lib/lazyLoad.ts'

    /** One download for every palette on the page, the site's and the page's. */
    const loadPalette = lazyLoad(() => import('./SearchPalette.svelte').then((m) => m.default))
</script>

<script lang="ts">
    /**
     * The search palette, loaded after the page rather than with it: the palette brings the
     * Markdown parser its index entries are read with, which no page needs to show itself. Its
     * code starts loading once the page has come in, or at once if the palette is opened first.
     *
     * What has to work from the first moment stays here: Ctrl+K, and the count of the page's own
     * palettes, which decides whether Ctrl+K opens a page's palette or the site's. A palette opened
     * before its code has arrived shows as soon as it does.
     */
    import { onMount, untrack } from 'svelte'
    import type { Component, ComponentProps } from 'svelte'
    import type SearchPalette from './SearchPalette.svelte'
    import { openSearchPalette, registerPaletteScope, searchPalette } from './paletteState.svelte'
    import { listenForSearchKey, typedInEditor } from './searchHotkey'

    type Props = ComponentProps<typeof SearchPalette>

    let props: Props = $props()

    let Palette = $state<Component<Props>>()

    function load() {
        loadPalette().then(
            (component) => (Palette = component),
            (error: Error) => console.warn(`search: could not load the palette (${error.message})`)
        )
    }

    onMount(() => {
        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(load, { timeout: 2000 })
            return () => window.cancelIdleCallback(id)
        }
        const timer = setTimeout(load, 500)
        return () => clearTimeout(timer)
    })

    // opened before its code has come: fetch it now
    $effect(() => {
        if (searchPalette.open && !Palette) untrack(load)
    })

    // what this palette searches, which a search box loads when pointed at (paletteState.svelte.ts)
    $effect(() => registerPaletteScope(props.site ? 'site' : 'page', props.scope))

    $effect(() => {
        if (props.site) return
        untrack(() => searchPalette.pagePalettes++)
        return () => untrack(() => searchPalette.pagePalettes--)
    })

    // the site's palette takes the key only where no page palette does, and never from an editor
    $effect(() =>
        listenForSearchKey((event) => {
            if (!props.site) return void openSearchPalette()
            if (searchPalette.pagePalettes > 0 || typedInEditor(event)) return false
            openSearchPalette('', 'site')
        })
    )
</script>

{#if Palette}
    <Palette {...props} />
{/if}
