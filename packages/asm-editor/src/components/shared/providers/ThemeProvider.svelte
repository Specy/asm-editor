<script lang="ts">
    import { ThemeStore, themeCssVariables } from '#stores/themeStore.svelte.ts'
    import { TinyColor } from '@ctrl/tinycolor'
    import { Body } from 'svelte-body'
    interface Props {
        style?: string
        children?: import('svelte').Snippet
    }

    let { style = '', children }: Props = $props()
    let scrollbar = $derived(ThemeStore.theme.scrollbar)
    let background = $derived(ThemeStore.theme.background)
    let variables = $derived(themeCssVariables(ThemeStore.theme, ThemeStore.meta))
    let text = $derived(
        new TinyColor(background.color).isDark()
            ? ThemeStore.meta.textForDark
            : ThemeStore.meta.textForLight
    )

    //the page's own scrollbar belongs to the document's root, above <body> and the theme's element:
    //its colour, and the text colour its thumb's hover mixes in, have to be there too
    $effect(() => {
        const root = document.documentElement
        root.style.setProperty('--scroll-accent', scrollbar.color)
        root.style.color = text
    })
</script>

<Body
    style={`
		--scroll-accent: ${scrollbar.color};
		background-color: ${background.color};
		color: ${text};
	`}
/>

<div class="theme-root" style={`${variables}${style}`}>
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
