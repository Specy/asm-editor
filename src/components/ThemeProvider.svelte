<script type="ts">
    import { ThemeProp, ThemeStore } from '$stores/themeStore' 
    import { onMount } from 'svelte';
    let theme: ThemeProp[] = []
    onMount(() => {
        ThemeStore.theme.subscribe(() => {
            theme = ThemeStore.toArray()
        })
    })
</script>


<div style={`
    ${theme.map(({ name, color }) => `--${name}: ${color};`).join('\n')}
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