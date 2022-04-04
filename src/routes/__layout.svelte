<script lang="ts">
	import '../global.css'
	import Footer from '$cmp/layout/Footer.svelte'
	import ErrorLogger from '$cmp/misc/ErrorLogger.svelte'
	import PageTransition from '$cmp/layout/PageTransition.svelte'
	import { page } from '$app/stores'
	import Nav from '$cmp/layout/Nav.svelte'
	import { theme } from '$stores/theme'
	import { browser } from '$app/env'
	theme.subscribe((value) => {
		if (!browser) return
		if (value === 'dark') return document.body.classList.add('body-dark')
		document.body.classList.remove('body-dark')
	})
</script>

<ErrorLogger>
	<Nav />
	<PageTransition refresh={$page.path}>
		<slot />
	</PageTransition>
	<Footer />
</ErrorLogger>