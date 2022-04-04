<script>
	export let disabled = false
	export let value = ''
	export let color = 'white'
	export let bg = 'rgb(219, 0, 97)'
</script>

<input
	type="submit"
	class="btn"
	style={`background-color: ${bg}; color: ${color}`}
	{disabled}
	{value}
    on:click
/>

<style lang="scss">
	@import 'style.scss';
</style>