<script lang="ts">
    import Column from './Column.svelte'
    import type { Justify } from './layoutUtils'
    import type { ThemeKeys } from '$stores/themeStore'

    interface Props {
        justify?: Justify | undefined
        align?: Justify | undefined
        gap?: string | undefined
        padding?: string | undefined
        style?: string | undefined
        background?: ThemeKeys
        border?: ThemeKeys | undefined
        borderStyle?: string
        radius?: string
        withShadow?: boolean
        children?: import('svelte').Snippet
    }

    let {
        justify = undefined,
        align = undefined,
        gap = undefined,
        padding = undefined,
        style = undefined,
        background = 'primary',
        border = undefined,
        borderStyle = 'solid 0.1rem',
        radius = '0.5rem',
        withShadow = false,
        children
    }: Props = $props()
</script>

<Column
    {justify}
    {align}
    {gap}
    {padding}
    {background}
    style="
	{border ? `border: ${borderStyle} var(--${border})` : ''};
	border-radius: {radius};
	{withShadow ? 'box-shadow: 0 0.1rem 0.5rem rgba(var(--shadow-rgb), 0.2);' : ''};
	{style}"
>
    {@render children?.()}
</Column>
