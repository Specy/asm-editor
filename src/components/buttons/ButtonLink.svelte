<script>
	export let disabled = false
    export let href
	export let color = 'var(--accent-text)'
	export let style = ''
	export let bg = 'var(--accent)'	
	export let hasIcon = false

	export let cssVar = ''
	let finalColor = ''
	$: finalColor = cssVar 
		? `background-color: var(--${cssVar}); color: var(--${cssVar}-text);` 
		: `background-color: ${bg}; color: ${color};`
</script>

<a
	class="link-button"
	class:hasIcon
    {href}
	style={`${finalColor} ${style}; `}
	{disabled}
	on:click
>
	<slot />
</a>

<style lang="scss">
		.link-button {
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		color: var(--accent-text);
		text-align: center;
		display: flex;
		transition: all 0.2s;
		font-size: 1rem;
		justify-content: center;
		border: none;
		width: fit-content;
		cursor: pointer;
	}
	.link-button:hover {
		filter: brightness(1.2);
	}
	.link-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.link-button:disabled:hover {
		filter: none !important;
	}
	.hasIcon {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.8rem;
	}
</style>