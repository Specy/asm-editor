<script lang="ts">
	import '../global.css'
	import ErrorLogger from '$cmp/misc/ErrorLogger.svelte'
	import PageTransition from '$cmp/layout/PageTransition.svelte'
	import { page } from '$app/stores'
	import ThemeProvider from '$cmp/ThemeProvider.svelte'
	import PromptProvider from '$cmp/PromptProvider.svelte'
</script>

<ThemeProvider>
	<ErrorLogger>
		<PromptProvider>
			<PageTransition refresh={$page.url.pathname}>
				<slot />
			</PageTransition>
		</PromptProvider>
	</ErrorLogger>
</ThemeProvider>
