<script lang="ts">
    import { type Justify, justifyMap } from './layoutUtils'
    import type { ThemeKeys } from '$stores/themeStore.svelte'

    interface Props {
        justify?: Justify | undefined
        align?: Justify | undefined
        gap?: string | undefined
        padding?: string | undefined
        background?: ThemeKeys | undefined
        style?: string | undefined
        margin?: string | undefined
        flex1?: boolean | undefined
        children?: import('svelte').Snippet
    }

    let {
        justify = undefined,
        align = undefined,
        gap = undefined,
        padding = undefined,
        background = undefined,
        style = undefined,
        margin = undefined,
        flex1 = undefined,
        children
    }: Props = $props()
</script>

<div
    class="col"
    style="
    {justify ? `justify-content: ${justifyMap[justify]};` : ''}
    {align ? `align-items: ${justifyMap[align]};` : ''}
    {gap ? `gap: ${gap};` : ''}
    {padding ? `padding: ${padding};` : ''}
    {background ? `background-color: var(--${background}); color: var(--${background}-text);` : ''}
    {flex1 ? 'flex:1;' : ''}
    {margin ? `margin: ${margin};` : ''}
    {style ?? ''}
    "
>
    {@render children?.()}
</div>

<style>
    .col {
        display: flex;
        flex-direction: column;
    }
</style>
