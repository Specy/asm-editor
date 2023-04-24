<script lang="ts">
	export let style=""
</script>
<div class="navbar" {style}>
    <slot />
</div>

<style lang="scss">
	.navbar {
		position: absolute;
		top: 0rem;
		padding: 0.5rem;
		width: 100%;
		gap: 0.8rem;
		border-radius: 0.6rem;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		display: flex;
		justify-content: space-between;
		background-color: rgba(var(--RGB-secondary), 0.5);
		backdrop-filter: blur(0.4rem);
		z-index: 4;
	}
</style>
