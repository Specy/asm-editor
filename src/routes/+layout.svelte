<script lang="ts">
    import '../global.css'
    import ErrorLogger from '$cmp/shared/providers/LoggerProvider.svelte'
    import PageTransition from '$cmp/shared/providers/PageTransition.svelte'
    import { page } from '$app/state'
    import ThemeProvider from '$cmp/shared/providers/ThemeProvider.svelte'
    import PromptProvider from '$cmp/shared/providers/PromptProvider.svelte'
    import Footer from '$cmp/shared/layout/Footer.svelte'
    import { onMount } from 'svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { beforeNavigate } from '$app/navigation'
    import { navigationStore } from '$stores/navigationStore'
    import { toAbsoluteUrl } from '$lib/seo'

    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()
    let metaTheme: HTMLMetaElement | null = $state(null)

    // Emitted once here rather than in each of the ~40 pages that write their own
    // head block: both values derive from the URL, so a page has nothing to add.
    let canonicalUrl = $derived(toAbsoluteUrl(page.url.pathname))

    onMount(() => {
        // The service worker is registered automatically by SvelteKit from
        // src/service-worker.ts — no manual registration needed here.
        import('$lib/monaco/Monaco').then((i) => i.Monaco.registerLanguages())
        metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    })
    beforeNavigate((p) => {
        if (!p.to || !p.from) return
        navigationStore.navigatingTo(p.to.url.pathname, p.from.url.pathname, p.to.url.searchParams)
    })
    const color = ThemeStore.theme.secondary
    $effect(() => {
        if (metaTheme) {
            metaTheme.content = color.color
        }
    })
</script>

<svelte:head>
    <link rel="canonical" href={canonicalUrl} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:site_name" content="Asm Editor" />
    <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<ThemeProvider>
    <ErrorLogger>
        <PromptProvider>
            <PageTransition refresh={page.url.pathname} />
            {@render children?.()}

            <!-- fix this -->
            <Footer
                pages={[
                    /^\/projects$/,
                    /^\/projects\/create$/,
                    /^\/learn\/courses$/,
                    /^\\$/,
                    /^\/$/,
                    /^\/themes$/,
                    /^\/donate$/,
                    /^\/changelog$/,
                    /^\/documentation$/
                ]}
            />
        </PromptProvider>
    </ErrorLogger>
</ThemeProvider>
