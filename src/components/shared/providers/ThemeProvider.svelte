<script lang="ts">
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { TinyColor } from '@ctrl/tinycolor'
    import { Body } from 'svelte-body'
    interface Props {
        style?: string
        children?: import('svelte').Snippet
    }

    let { style = '', children }: Props = $props()
    let theme = ThemeStore.themeList
    let scrollbar = $derived(ThemeStore.theme.scrollbar)
    let background = $derived(ThemeStore.theme.background)

    function toRgbChannels(color: string) {
        const { r, g, b } = new TinyColor(color).toRgb()
        return `${r}, ${g}, ${b}`
    }
</script>

<Body
    style={`
		--scroll-accent: ${scrollbar.color};
		background-color: ${background.color};
		color: ${new TinyColor(background.color).isDark() ? ThemeStore.meta.textForDark : ThemeStore.meta.textForLight};
	`}
/>

<div
    class="theme-root"
    style={`
    ${theme
        .map(({ name, color }) => {
            const isDark = new TinyColor(color).isDark()
            const text = isDark ? ThemeStore.meta.textForDark : ThemeStore.meta.textForLight
            //the dimmed variant of the same text, for prose sitting on this color
            const textMuted = isDark
                ? ThemeStore.meta.textMutedForDark
                : ThemeStore.meta.textMutedForLight
            return `
    --${name}: ${color};
    --${name}-text: ${text};
    --${name}-text-muted: ${textMuted};
    --RGB-${name}: ${toRgbChannels(color)};
	--RGB-${name}-text : ${toRgbChannels(text)};
	--RGB-${name}-text-muted : ${toRgbChannels(textMuted)};
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
