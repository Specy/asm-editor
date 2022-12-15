<script>
    export let size = 1.2
    export let style = ''
</script>

<div class="icon" style={`width:${size}rem; min-width: ${size}rem; height:${size}rem; ${style};`}>
    <slot />
</div>

<style>
    .icon{
        cursor: pointer;
        padding: 0;
        margin: 0;
        width: unset;
        height: unset;
        color: inherit;
        border: none;
        background: none;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
</style>