<script lang="ts">
	import { navigationStore } from "$stores/navigationStore"
	import { fly } from "svelte/transition"
	export let cropped = false
	export let style = ""
	export let contentStyle = ""
</script>

<main class="content" {style} in:fly|global={{ x: $navigationStore.direction === "back" ? 30 : -30, duration: 500 }}>
	<div class="column" style="max-width: {cropped ? '60rem' : 'unset'}; width:100%;height: 100%; {contentStyle}">
		<slot />
	</div>
</main>

<style lang="scss">
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		position: relative;
		flex: 1;
	}

</style>
