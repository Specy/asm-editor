<script lang="ts">
	import { clamp, createDebouncer } from '$lib/utils'

	let ref: HTMLElement

	export let left = 300
	export let top = 16
	export let hiddenOnMobile = false
	export let clampPosition = true

	let moving = false
	let bounds: DOMRect = new DOMRect(0, 0, 0, 0)
	const [debouncer] = createDebouncer(100)
	let observer = new ResizeObserver(() =>
		debouncer(() => {
			if (!ref) return
			bounds = ref.getBoundingClientRect()
		})
	)
	$: {
		observer.disconnect()
		if (ref) observer.observe(ref)
	}
	function onMouseMove(e: PointerEvent) {
		if (moving) {
			left += e.movementX
			top += e.movementY
			if (clampPosition) {
				top = clamp(top, 6, window.innerHeight - bounds.height - 6)
				left = clamp(left, 6, window.innerWidth - bounds.width - 6)
			}
		}
	}
</script>

<div
	style={`left: ${left}px; top: ${top}px; --hidden-on-mobile: ${hiddenOnMobile ? 'none' : 'flex'}`}
	class="draggable"
	bind:this={ref}
>
	<div class="row" on:pointerdown={() => (moving = true)} style="cursor: move; user-select: none;">
		<slot name="header" />
	</div>
	<slot />
</div>

<svelte:window on:pointerup={() => (moving = false)} on:pointermove={onMouseMove} />

<style>
	.draggable {
		position: absolute;
		z-index: 10;
	}
	@media (hover: none) {
		.draggable {
			display: var(--hidden-on-mobile);
		}
	}
</style>
