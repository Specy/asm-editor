<script lang="ts">
	export let name: string
	export let content: string
</script>

<div class="row align-center args">
	<div class="op-index row align-center">
		{name}
	</div>
	<div class="op">
		{content}
	</div>
</div>

<style lang="scss">
	.args {
		font-size: 0.8rem;
		padding: 0.2rem;
		background-color: var(--secondary);
		border-radius: 0.4rem;
	}
	.op-index {
		height: 100%;
		padding:0 0.5rem;
		font-size: 1rem;
		font-family: Orienta;
	}
	.op {
		height: 100%;
		padding: 0.3rem 0.4rem;
		background-color: var(--tertiary);
		border-radius: 0.3rem;
	}
</style>
