<script>
	import { createEventDispatcher } from 'svelte'
	export let style = ''
	const dispatch = createEventDispatcher()
	function submit(e) {
		e.preventDefault()
		dispatch('submit', e)
	}
</script>

<form on:submit={submit} {style}>
    <slot/>
</form>

<style lang="scss">
	form {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
</style>
