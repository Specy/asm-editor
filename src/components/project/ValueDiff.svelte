<script lang="ts">
	export let diff: string | number
	export let style: string = ''
	export let value: string | number
	export let hasSoftDiff: boolean | undefined = undefined
	export let monospaced = false
	export let hoverElementOffset = '-1.1rem'
</script>

<div
	class:modified={diff !== value}
	class:softDiff={hasSoftDiff === true}
	class="tooltip-base"
	class:monospaced
	{style}
>
	{value}
	<div class="hover-element" style={`top: ${hoverElementOffset}`}>
		{#if $$slots.hoverValue}
			<div class:monospaced>
				<slot name="hoverValue" />
			</div>
		{/if}
		{#if diff !== value}
			<div class="old-value" class:monospaced>
				{diff}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.tooltip-base {
		display: flex;
		align-items: center;
		border-radius: 0.2rem;
		text-align: center;
		justify-content: center;
		cursor: default;
	}
	.softDiff {
		background-color: var(--primary);
		color: var(--primary-text);
	}
	.hover-element {
		display: none;
		flex-direction: column;
		min-width: 100%;
		background-color: var(--tertiary);
		color: var(--tertiary-text);
		border-radius: 0.2rem;
		position: absolute;
		cursor: text;
		box-shadow: rgba(0, 0, 0, 0.4) 0px 2px 2px;
		padding: 0.2rem;
	}
	.old-value {
		color: var(--accent);
	}
	.monospaced {
		font-family: monospace;
	}
	.tooltip-base:hover {
		filter: brightness(1.1);
	}
	.tooltip-base:hover .hover-element {
		display: flex;
	}
	.modified {
		background-color: var(--accent);
		color: var(--accent-text);
		cursor: pointer;
	}
</style>
