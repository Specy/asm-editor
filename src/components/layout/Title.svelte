<script>
    export let noMargin = false
    export let style = ''
</script>

<h1 {style} class:noMargin>
    <slot />
</h1>


<style >
    h1{
        margin: 1rem;
        margin-left: 0
    }
    .noMargin{
        margin:0;
    }
</style>
