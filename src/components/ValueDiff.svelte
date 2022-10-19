<script lang="ts">
	export let diff: string | number
	export let style: string = ''
	export let value: string | number
	export let hoverValue: string | number = ''
	export let monospaced = false
</script>

<span class:modified={diff !== value} class="tooltip-base" class:monospaced {style}>
	{value}
	<div class="hover-element">
		{#if hoverValue !== ''}
			<div class:monospaced>
				{hoverValue}
			</div>
		{/if}
		{#if diff === value}
			<div class="old-value" class:monospaced>
				{diff}
			</div>
		{/if}
	</div>
</span>

<style lang="scss">
	span {
		display: flex;
		align-items: center;
		border-radius: 0.2rem;
		text-align: center;
		justify-content: center;
	}
	.tooltip-base {
		position: relative;
	}
	.hover-element {
		display: none;
		flex-direction: column;
		background-color: var(--secondary);
		color: var(--secondary-text);
		border-radius: 0.2rem;
		position: absolute;
		cursor: default;
		top: -1rem;
		padding: 0.2rem;
	}
	.old-value{
		color: var(--accent);
	}
	.monospaced {
		font-family: monospace;
	}
	span:hover {
		filter: brightness(1.1);
	}
	span:hover .hover-element {
		display: flex;
	}
	.modified {
		background-color: var(--accent);
		color: var(--accent-text);
		cursor: pointer;
	}
</style>
