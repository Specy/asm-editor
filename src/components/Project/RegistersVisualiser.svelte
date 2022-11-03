<script lang="ts">
	import ValueDiff from '$cmp/project/ValueDiff.svelte'
	import type { Register } from '$lib/languages/M68KEmulator'
	export let registers: Register[] = []
	import { settingsStore } from '$stores/settingsStore'
	import { createEventDispatcher } from 'svelte'
	const dispatcher = createEventDispatcher<{
		registerClick: Register
	}>()
	let usesHex = !$settingsStore.values.useDecimalAsDefault.value
	$: usesHex = !$settingsStore.values.useDecimalAsDefault.value
</script>

<div class="registers">
	{#each registers as register (register.name)}
		<div class="register-wrapper">
			<div class="hover-register-value">
				{#if usesHex}
					{register.value}
				{:else}
					{register.value.toString(16).padStart(8, '0')}
				{/if}
			</div>
			<button class="register-name" on:click={() => dispatcher('registerClick', register)}>
				{register.name}
			</button>
		</div>
		<div class="register-hex">
			{#each register.hex as hex, i}
				<ValueDiff
					style={'padding:0.2rem; '}
					value={usesHex ? hex : parseInt(hex, 16).toString().padStart(5, '0')}
					hoverValue={usesHex ? parseInt(hex, 16) : hex}
					diff={usesHex
						? register.diff.hex[i]
						: parseInt(register.diff.hex[i], 16).toString().padStart(5, '0')}
					monospaced
				/>
			{/each}
		</div>
	{/each}
</div>

<style lang="scss">
	.registers {
		display: grid;
		background-color: var(--secondary);
		padding: 0.5rem;
		border-radius: 0.5rem;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto;
		flex-direction: column;
		gap: 0.2rem;
		align-items: center;
		font-size: 1rem;
		flex: 1;
		@media screen and (max-width: 1000px) {
			width: unset;
		}
	}

	.hover-register-value {
		display: none;
		min-width: 100%;
		background-color: var(--tertiary);
		color: var(--tertiary-text);
		border-radius: 0.2rem;
		position: absolute;
		cursor: text;
		user-select: all;
		font-family: monospace;
		font-size: 1rem;
		box-shadow: rgba(0, 0, 0, 0.4) 0px 0px 6px;
		left: 1.6rem;
		z-index: 2;
		top: 0;
		height: 100%;
		padding: 0 0.7rem;
		align-items: center;
		font-weight: normal;
	}
	.register-wrapper {
		position: relative;
		&:hover .hover-register-value {
			display: flex;
		}
	}
	.register-name {
		font-weight: bold;
		padding: 0.2rem;
		border-radius: 0.2rem;
		border: none;
		width: 1.6rem;
		background: transparent;
		color: var(--secondary-text);
		cursor: pointer;
		&:hover {
			background-color: var(--accent2);
		}
	}
	.register-hex {
		display: flex;
		justify-content: space-between;
		padding-left: 0.2rem;
		gap: 0.1rem;
		border-left: solid 0.1rem var(--tertiary);
	}
</style>
