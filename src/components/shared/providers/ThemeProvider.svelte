<script lang="ts">
    import { ThemeStore, themeCssVariables } from '$stores/themeStore.svelte'
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
</script>

<Body
    style={`
		--scroll-accent: ${scrollbar.color};
		background-color: ${background.color};
		color: ${new TinyColor(background.color).isDark() ? ThemeStore.meta.textForDark : ThemeStore.meta.textForLight};
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
