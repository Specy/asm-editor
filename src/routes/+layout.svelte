<script lang="ts">
	import '../global.css'
	import ErrorLogger from '$cmp/Providers/Logger.svelte'
	import PageTransition from '$cmp/Providers/PageTransition.svelte'
	import { page } from '$app/stores'
	import ThemeProvider from '$cmp/Providers/ThemeProvider.svelte'
	import PromptProvider from '$cmp/Providers/PromptProvider.svelte'
	import Footer from '$cmp/layout/Footer.svelte'
	import { onMount } from 'svelte'
	import { registerServiceWorker } from '$lib/register-sw'
	onMount(registerServiceWorker)
</script>

<ThemeProvider>
	<ErrorLogger>
		<PromptProvider>
			<PageTransition refresh={$page.url.pathname}>
				<slot />
			</PageTransition>
			<Footer pages={['/projects', '/projects/create']} />
		</PromptProvider>
	</ErrorLogger>
</ThemeProvider>
