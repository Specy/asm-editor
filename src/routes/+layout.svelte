<script lang="ts">
	import '../global.css'
	import ErrorLogger from '$cmp/providers/LoggerProvider.svelte'
	import PageTransition from '$cmp/providers/PageTransition.svelte'
	import { page } from '$app/stores'
	import ThemeProvider from '$cmp/providers/ThemeProvider.svelte'
	import PromptProvider from '$cmp/providers/PromptProvider.svelte'
	import Footer from '$cmp/layout/Footer.svelte'
	import { onMount } from 'svelte'
	import { registerServiceWorker } from '$lib/register-sw'
	onMount(() => {
		//dont run in localhost
		if (window.location.hostname !== 'localhost'){
			registerServiceWorker()
		}
	})
</script>

<ThemeProvider>
	<ErrorLogger>
		<PromptProvider>
			<PageTransition refresh={$page.url.pathname}>
				<slot />
			</PageTransition>
			<Footer pages={['/projects', '/projects/create', '', '/', '/themes', "/donate"]} />
		</PromptProvider>
	</ErrorLogger>
</ThemeProvider>
