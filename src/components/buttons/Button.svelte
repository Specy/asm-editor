<script>
	export let disabled = false
	export let color = 'var(--accent-text)'
	export let style = ''
	export let bg = 'var(--accent)'	
	export let hasIcon = false
</script>

<button
	type="button"
	class="btn"
	class:hasIcon
	style={`background-color: ${bg}; color: ${color}; ${style}`}
	{disabled}
	on:click
>
	<slot />
</button>

<style lang="scss">
	@import 'style.scss';
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		color: var(--accent-text);
		background-color: var(--accent);
		text-align: center;
		display: flex;
		transition: all 0.2s;
		font-size: 1rem;
		justify-content: center;
		border: none;
		width: fit-content;
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
