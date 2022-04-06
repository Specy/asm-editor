<script>
import { afterNavigate, beforeNavigate } from '$app/navigation';

	import { fly } from 'svelte/transition'
	export let refresh = ''

	let status = ''
	let timeout = setTimeout(() =>{}, 0)
	let timeout2 = setTimeout(() =>{}, 0)
	function handleProgress(s){
		if(s === 'started'){
			status = 'progress-70'
			clearTimeout(timeout2)
			timeout2 = setTimeout(() => {
				status = ''
			},5000)
		}
		if(s === 'ended'){
			status = 'progress-finish'
			clearTimeout(timeout)
			timeout = setTimeout(() => {
				status = ''
			},200)
		}
	}
	beforeNavigate(() => {
		handleProgress('started')
	})
	afterNavigate(() => {
		handleProgress('ended')
	})
</script>

{#key refresh}
	<div class={`progress ${status}`} ></div>

	<div in:fly={{ x: -50, duration: 500 }} class="page">
		<slot />
	</div>
{/key}

<style lang="scss">

	.page {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		max-height: 100%;
	}
	.progress{
		height: 4px;
		width: 0%;
		background-color: var(--accent);
		position: absolute;
		z-index: 1000;
	}
	.progress-70{
		width: 70%;
		transition: all 1s;
	}
	.progress-finish{
		transition: all 0.2s;
		width: 100%;
		background-color: transparent;
	}
</style>
