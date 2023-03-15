<script lang="ts">
	import type { StatusRegister } from '$lib/languages/M68KEmulator'

	export let statusCodes: StatusRegister[]
	export let style = ''
</script>

<div class="status-codes" {style}>
	{#each statusCodes as el, i (i)}
		<div class="column">
			<div>
				{el.name}
			</div>
			<div>
				{el.value}
			</div>
		</div>
	{/each}
</div>

<style lang="scss">
	.status-codes {
		display: flex;
		background-color: var(--secondary);
		color: var(--secondary-text);
		gap: 0.3rem;
		margin-bottom: 0.5rem;
		justify-content: space-around;
		padding: 0.3rem;
		border-radius: 0.4rem;
	}
</style>
