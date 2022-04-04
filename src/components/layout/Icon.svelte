<script>
    export let size = '1.2rem'
    export let style = ''
</script>

<div class="icon" style={`width:${size}; height:${size}; ${style}`} on:click>
    <slot />
</div>

<style>
    .icon{
        cursor: pointer;
    }
</style>