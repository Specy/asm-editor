<script>
    export let size = 1.2
    export let style = ''
</script>

<div class="icon" style={`width:${size}rem; height:${size}rem; ${style}`} on:click>
    <slot />
</div>

<style>
    .icon{
        cursor: pointer;
    }
</style>