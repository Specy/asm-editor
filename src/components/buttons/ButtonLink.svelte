<script>
    export let href = ''
    export let target = ''
    export let style = ''
    export let bg = 'rgb(219, 0, 97)'
    export let color = 'white'
</script>

<a {href} {target} style={`background-color:${bg}; color:${color}; ${style}`} class="btn">
    <slot/>
</a>

<style lang="scss">
	@import 'style.scss';
</style>