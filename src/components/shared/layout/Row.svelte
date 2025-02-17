<script lang="ts">
    import { type Justify, justifyMap } from './layoutUtils'
    import type { ThemeKeys } from '$stores/themeStore.svelte'

    interface Props {
        justify?: Justify | undefined
        flex1?: boolean | undefined
        align?: Justify | undefined
        gap?: string | undefined
        padding?: string | undefined
        background?: ThemeKeys | undefined
        style?: string | undefined
        margin?: string | undefined
        wrap?: boolean | undefined
        children?: import('svelte').Snippet
    }

    let {
        justify = undefined,
        flex1 = undefined,
        align = undefined,
        gap = undefined,
        padding = undefined,
        background = undefined,
        style = undefined,
        margin = undefined,
        wrap = undefined,
        children
    }: Props = $props()
</script>

<div
    class="flex"
    style="
    {justify ? `justify-content: ${justifyMap[justify]};` : ''}
    {align ? `align-items: ${justifyMap[align]};` : ''}
    {gap ? `gap: ${gap};` : ''}
    {padding ? `padding: ${padding};` : ''}
    {background ? `background-color: var(--${background}); color: var(--${background}-text);` : ''}
    {flex1 ? 'flex:1;' : ''}
    {margin ? `margin: ${margin};` : ''}
    {wrap ? 'flex-wrap: wrap;' : ''}
    {style ?? ''}
    "
>
    {@render children?.()}
</div>

<style>
    .flex {
        display: flex;
    }
</style>
