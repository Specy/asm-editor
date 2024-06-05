<script lang="ts">
    import { type Justify, justifyMap } from './layoutUtils'
    import type { ThemeKeys } from '$stores/themeStore'

    export let justify: Justify | undefined = undefined
		export let flex1: boolean | undefined
    export let align: Justify | undefined = undefined
    export let gap: string | undefined = undefined
    export let padding: string | undefined = undefined
    export let background: ThemeKeys | undefined = undefined
    export let style: string | undefined = undefined
				export let margin: string | undefined
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
    {style ?? ''}
    "
>
	<slot />
</div>

<style>
	.flex {
		display: flex;
	}
</style>