<script>
	export let disabled = false
	export let color = 'white'
	export let style = ''
	export let bg = 'rgb(219, 0, 97)'

</script>

<button
	type="button"
	class="btn"
	style={`background-color: ${bg}; color: ${color}; ${style}`}
	{disabled}
    on:click
>
	<slot/>
</button>

<style lang="scss">
	@import 'style.scss';
</style>