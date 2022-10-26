<script lang="ts">
	import { onMount } from "svelte"


    let ref: HTMLElement

	export let left = 100
	export let top = 16
	export let hiddenOnMobile = false
	let moving = false


    onMount(() => {
        left = window.innerWidth / 1.4 - ref.offsetWidth / 2
    })
	function onMouseMove(e: PointerEvent) {
		if (moving) {
			left += e.movementX
			top += e.movementY
		}
	}

</script>

<div style={`left: {left}px; top: {top}px; --hidden-on-mobile: ${hiddenOnMobile ? "none": "flex"}`} class="draggable" bind:this={ref}>
	<div class="row" on:pointerdown={() => (moving = true)} style="cursor: move;">
		<slot name="header" />
	</div>
	<slot />
</div>

<svelte:window on:pointerup={() => (moving = false)} on:pointermove={onMouseMove} />

<style>
	.draggable {
		user-select: none;
		position: absolute;
        z-index: 10;
	}
	@media screen and (max-width:400px){
		.draggable{
			display: var(--hidden-on-mobile);
		}
	}
</style>
