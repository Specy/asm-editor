<script>
    export let size = 1.2
    export let style = ''
    export let hoverable = false
</script>

<div class="icon" style={`width:${size}rem; min-width: ${size}; height:${size}rem; ${style};`} on:click>
    <slot />
</div>

<style>
    .icon{
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
</style>