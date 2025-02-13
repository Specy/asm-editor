<script lang="ts">
    import { ThemeStore } from '$stores/themeStore'
    import type { ThemeProp } from '$stores/themeStore'
    import { TinyColor } from '@ctrl/tinycolor'
    import { onMount } from 'svelte'
    import { Body } from 'svelte-body'
    interface Props {
        style?: string
        children?: import('svelte').Snippet
    }

    let { style = '', children }: Props = $props()
    let theme: ThemeProp[] = $state(ThemeStore.toArray())
    let store = $state(ThemeStore)
    onMount(() => {
        ThemeStore.theme.subscribe(() => {
            theme = ThemeStore.toArray()
            store = ThemeStore
        })
    })
    let scrollbar = store.get('scrollbar')
    let accent = store.get('accent')
    let background = store.get('background')
</script>

<Body
    style={`
		--scroll-accent: ${$scrollbar.color};
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
    {@render children?.()}
</div>

<style lang="scss">
    .theme-root {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        width: 100%;
    }
</style>
