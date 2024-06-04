<script lang="ts">
    import { type Justify, justifyMap } from './layoutUtils'
    import type { ThemeKeys } from '$stores/themeStore'

    export let justify: Justify | undefined
    export let align: Justify | undefined
    export let gap: string | undefined
    export let padding: string | undefined
    export let background: ThemeKeys | undefined
    export let style: string | undefined
		export let margin: string | undefined
		export let flex1: boolean | undefined
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
    {style}
    "
>
	<slot />
</div>

<style>
    .col {
        display: flex;
        flex-direction: column;
    }
</style>