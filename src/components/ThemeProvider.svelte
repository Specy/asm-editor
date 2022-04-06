<script type="ts">
    import { ThemeProp, ThemeStore } from '$stores/themeStore'
    import { TinyColor } from '@ctrl/tinycolor';  
    import { onMount } from 'svelte';
    let theme: ThemeProp[] = []
    onMount(() => {
        ThemeStore.theme.subscribe(() => {
            theme = ThemeStore.toArray()
        })
    })
</script>


<div style={`
    ${theme.map(({ name, color }) => `
    --${name}: ${color};
    --${name}-text: ${new TinyColor(color).isDark() ? '#dbdbdb' : '#181818'};
    --RGB-${name}: ${new TinyColor(color).toRgbString().match(/(\s*\d+\s*),(\s*\d+\s*),(\s*\d+\s*)/)[0]};
    `).join('\n')}
`}>
    <slot></slot>
</div>


<style>
    div{
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background-color: var(--primary);        
    }
</style>