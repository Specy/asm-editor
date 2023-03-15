<script type="ts">
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
</script>

<div
	class="theme-root"
	style={`
    ${theme
			.map(
				({ name, color }) => `
    --${name}: ${color};
    --${name}-text: ${
					new TinyColor(color).isDark() ? ThemeStore.textForDark : ThemeStore.textForLight
				};
    --RGB-${name}: ${
					new TinyColor(color).toRgbString().match(/(\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)/)[0]
				};
    `
			)
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
