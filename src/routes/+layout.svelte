<script lang="ts">
    import '../global.css'
    import ErrorLogger from '$cmp/shared/providers/LoggerProvider.svelte'
    import PageTransition from '$cmp/shared/providers/PageTransition.svelte'
    import { page } from '$app/state'
    import ThemeProvider from '$cmp/shared/providers/ThemeProvider.svelte'
    import PromptProvider from '$cmp/shared/providers/PromptProvider.svelte'
    import Footer from '$cmp/shared/layout/Footer.svelte'
    import { onMount } from 'svelte'
    import { registerServiceWorker } from '$lib/register-sw'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { beforeNavigate } from '$app/navigation'
    import { navigationStore } from '$stores/navigationStore'

    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()
    let metaTheme: HTMLMetaElement = $state(null)

    onMount(() => {
        registerServiceWorker()
        import('$lib/monaco/Monaco').then((i) => i.Monaco.registerLanguages())
        metaTheme = document.querySelector('meta[name="theme-color"]')
    })
    beforeNavigate((p) => {
        navigationStore.navigatingTo(p.to.url.pathname, p.from.url.pathname, p.to.url.searchParams)
    })
    const color = ThemeStore.theme.secondary
    $effect(() => {
        if (metaTheme) {
            metaTheme.content = color.color
        }
    })
</script>



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
