<script>
	import Button from '$cmp/buttons/Button.svelte'
	import ColorThemeRow from '$cmp/ColorThemeRow.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import Title from '$cmp/layout/Title.svelte'
	import { ThemeStore } from '$stores/themeStore'
	import { onMount } from 'svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import { scale } from 'svelte/transition'
	let theme = ThemeStore.toArray()
	onMount(() => {
		ThemeStore.theme.subscribe((_) => {
			theme = ThemeStore.toArray()
		})
	})
</script>

<svelte:head>
	<title> Theme </title>
	<meta name="description" content="Change the theme of the app" />
</svelte:head>

<main class="page">
	<div class="content">
		<div class="header">
			<a href="/projects" class="go-back" title="Go to the main page">
				<Button hasIcon cssVar="primary" style="padding: 0.4rem" title="Go to the main page">
					<Icon size={2}>
						<FaAngleLeft />
					</Icon>
				</Button>
			</a>
			<Title noMargin>Theme</Title>
		</div>
		<div class="colors">
			{#each theme as color, i (color.name)}
				<div in:scale={{ delay: i * 50 + 200, start: 0.9, duration: 150 }}>
					<ColorThemeRow bind:color />
				</div>
			{/each}
		</div>
	</div>
</main>

<style lang="scss">
	.header {
		display: flex;
		margin-top: 4rem;
		margin-bottom: 2rem;
		align-items: center;
	}
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.content {
		display: flex;
		flex-direction: column;
		padding: 0.8rem;
		max-width: 40rem;
		width: 100%;
	}
	.colors {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 3rem;
	}
	@media screen and (min-width: 650px) {
		.go-back {
			position: absolute;
			top: 1rem;
			left: 1rem;
		}
	}
	@media screen and (max-width: 650px) {
		.header {
			margin-top: 1rem;
		}
	}
</style>
