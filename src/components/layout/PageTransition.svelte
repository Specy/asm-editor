<script>
	import { fly } from 'svelte/transition'
	export let refresh = ''

	let status = ''
	let timeout = setTimeout(() =>{}, 0)
	function handleProgress(s){
		if(s === 'started') status = 'progress-70'
		if(s === 'ended'){
			status = 'progress-finish'
			clearTimeout(timeout)
			timeout = setTimeout(() => {
				status = ''
			},200)
		}
	}
</script>

<svelte:window
    on:sveltekit:navigation-start={() => handleProgress('started')}
    on:sveltekit:navigation-end={() => handleProgress('ended')}
/>
{#key refresh}
	<div class={`progress ${status}`}>

	</div>
	<div in:fly={{ x: -50, duration: 500 }} class="page">
		<slot />
	</div>
{/key}

<style lang="scss">
    @import "../../variables.scss";

	.page {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	.progress{
		height: 4px;
		width: 0%;
		background-color: $accent;
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
