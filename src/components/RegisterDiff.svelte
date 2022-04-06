<script lang="ts">
	export let diff: string | number
	export let value: string | number
	export let monospaced = false
</script>

<code class:modified={diff !== value} class="tooltip-base" class:monospaced>
	{value}
	{#if diff !== value}
		<code class="old-value">
			{diff}
		</code>
	{/if}
</code>

<style lang="scss">
	code {
		display: flex;
		align-items: center;
		border-radius: 0.2rem;
		padding: 0 0.1rem;
        width: 100%;
	}
	.tooltip-base {
		position: relative;
	}
	.old-value {
		display: none;
		background-color: var(--secondary);
		color: var(--secondary-text);
		border-radius: 0.2rem;
	}
	.monospaced {
		font-family: 'Lucida Console', 'Menlo', 'Monaco', 'Courier', monospace;
	}
	code:hover {
		filter: brightness(1.1);
	}
	code:hover .old-value {
		display: flex;
		position: absolute;
		top: -1rem;
        width: 100%;
		right: 0;
	}
	.modified {
		background-color: var(--accent);
		color: var(--accent-text);
		cursor: pointer;
	}
</style>
