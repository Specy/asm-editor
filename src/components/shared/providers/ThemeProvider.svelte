<script lang="ts">
	import { ThemeStore } from '$stores/themeStore'
	import type { ThemeProp } from '$stores/themeStore'
	import { TinyColor } from '@ctrl/tinycolor'
	import { onMount } from 'svelte'
	import { Body } from 'svelte-body'
	export let style = ''
	let theme: ThemeProp[] = ThemeStore.toArray()
	onMount(() => {
		ThemeStore.theme.subscribe(() => {
			theme = ThemeStore.toArray()
		})
	})
	let accent = ThemeStore.get('accent')
	let background = ThemeStore.get('background')
</script>

<Body
	style={`
		--scroll-accent: ${$accent.color};
		background-color: ${$background.color};
		color: ${new TinyColor($background.color).isDark() ? ThemeStore.textForDark : ThemeStore.textForLight};
	`}
/>

<div
	class="theme-root"
	style={`
    ${theme
			.map(({ name, color }) => {
				const text = new TinyColor(color).isDark()
					? ThemeStore.textForDark
					: ThemeStore.textForLight
				return `
    --${name}: ${color};
    --${name}-text: ${text};
    --RGB-${name}: ${
					new TinyColor(color).toRgbString().match(/(\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)/)[0]
				};
	--RGB-${name}-text : ${
					new TinyColor(text).toRgbString().match(/(\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)/)[0]
				};
    `
			})
			.join('\n')}
    ${style}
`}
>
	<slot />
</div>

<style lang="scss">
	.theme-root {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		width: 100%;
	}
</style>
