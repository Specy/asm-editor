<script lang="ts">
	export let disabled = false
	export let color = 'var(--accent-text)'
	export let style = ''
	export let bg = 'var(--accent)'	
	export let hasIcon = false
	export let cssVar = ''
	export let active = false
	let finalColor = ''
	$: finalColor = cssVar 
		? `background-color: var(--${cssVar}); color: var(--${cssVar}-text);` 
		: `background-color: ${bg}; color: ${color};`

</script>

<button
	type="button"
	class="btn"
	class:hasIcon
	style={`${finalColor} ${style}; `}
	{disabled}
	on:click
	class:active
>
	<slot />
</button>

<style lang="scss">
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		color: var(--accent-text);
		text-align: center;
		display: flex;
		transition: all 0.2s;
		font-size: 1rem;
		align-items: center;
		justify-content: center;
		border: none;
		width: fit-content;
		user-select: none;
		cursor: pointer;
	}
	.active{
		background-color: var(--accent) !important;
		color: var(--accent-text) !important;
	}
	.btn:hover {
		filter: brightness(1.2);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn:disabled:hover {
		filter: none !important;
	}
	.hasIcon {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.8rem;
	}
</style>
