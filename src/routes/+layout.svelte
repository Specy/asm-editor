<script lang="ts">
	import '../global.css'
	import ErrorLogger from '$cmp/providers/LoggerProvider.svelte'
	import PageTransition from '$cmp/providers/PageTransition.svelte'
	import { page } from '$app/stores'
	import ThemeProvider from '$cmp/providers/ThemeProvider.svelte'
	import PromptProvider from '$cmp/providers/PromptProvider.svelte'
	import Footer from '$cmp/layout/Footer.svelte'
	import { onMount} from 'svelte'
	import { registerServiceWorker } from '$lib/register-sw'
	import { ThemeStore } from '$stores/themeStore'
	import { beforeNavigate } from '$app/navigation'
	import { navigationStore } from '$stores/navigationStore'
	let metaTheme:HTMLMetaElement = null
	
	onMount(() => {
		registerServiceWorker()
		metaTheme = document.querySelector('meta[name="theme-color"]')
	})
	beforeNavigate((p) => {
		navigationStore.navigatingTo(p.to.url.pathname, p.from.url.pathname, p.to.url.searchParams)
	})
	const color = ThemeStore.get("secondary")
	$: {
		if (metaTheme){
			metaTheme.content = $color.color
		}
	}
</script>
<svelte:head>
	<meta name="description" content="Write, learn and run M68K assembly code on your browser. View registers and memory, step and undo the program.">
	<meta property="og:description" content="Write, learn and run M68K assembly code on your browser. View registers and memory, step and undo the program.">
	<meta property="og:title" content="Asm Editor">
</svelte:head>

<ThemeProvider>
	<ErrorLogger>
		<PromptProvider>
			<PageTransition refresh={$page.url.pathname} />
			<slot />

			<!-- fix this -->
			<Footer pages={['/projects', '/projects/create', '', '/', '/themes', "/donate", "/changelog", "/documentation"]} />
		</PromptProvider>
	</ErrorLogger>
</ThemeProvider>
