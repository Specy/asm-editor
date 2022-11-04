<script>
	export let disabled = false
    export let href
	export let color = 'var(--accent-text)'
	export let style = ''
	export let bg = 'var(--accent)'	
	export let hasIcon = false
	export let cssVar = 'unset'
</script>

<a	
	type="button"
	class="btn"
	class:hasIcon
    {href}
	style={`--btn-color:var(--${cssVar},${bg}); --btn-text:var(--${cssVar}-text,${color});${style}; `}
	{disabled}
	on:click
>
	<slot />
</a>

<style lang="scss">
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		color: var(--btn-text, --accent-text);
		background-color: var(--btn-color, --accent);
		text-align: center;
		display: flex;
		transition: all 0.3s;
		font-size: 1rem;
		align-items: center;
		justify-content: center;
		border: none;
		width: fit-content;
		user-select: none;
		position: relative;
		cursor: pointer;
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
