<script type="ts">
	import { ThemeStore } from '$stores/themeStore'
	import type { ThemeProp } from '$stores/themeStore'
	import { TinyColor } from '@ctrl/tinycolor'
	import { onMount } from 'svelte'
	import { Body } from 'svelte-body'
	export let style = ''
	let theme: ThemeProp[] = []
	onMount(() => {
		ThemeStore.theme.subscribe(() => {
			theme = ThemeStore.toArray()
		})
	})
</script>

<svelte:body style="background-color:red;" />
<Body
	style={`
    ${theme
			.map(
				({ name, color }) => `
    --${name}: ${color};
    --${name}-text: ${new TinyColor(color).isDark() ? '#dbdbdb' : '#181818'};
    --RGB-${name}: ${
					new TinyColor(color).toRgbString().match(/(\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)/)[0]
				};
    `
			)
			.join('\n')}
    ${style}
`}
/>
<slot />