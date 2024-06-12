<script lang="ts" context="module">
	const flags = ['X', 'N', 'Z', 'V', 'C']
</script>

<script lang="ts">
	import Icon from '$cmp/shared/layout/Icon.svelte'
  import { ccrToFlagsArray, type ExecutionStep } from '@specy/s68k'
	import { createEventDispatcher } from 'svelte'
	import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
	export let step: ExecutionStep
	let ccr = []

	function parseCcr(value: number) {
		ccr = ccrToFlagsArray(value).reverse()
	}

	$: parseCcr(step.new_ccr.bits)
	const dispatcher = createEventDispatcher<{
		undo: void
		highlight: number
	}>()
</script>

<div class="column step">
	<div class="step-header column">
		<button
			class="undo-to-here"
			on:click={() => {
				dispatcher('undo')
			}}
		>
			<Icon size={1}>
				<FaUndo />
			</Icon>
		</button>
		<div class="row space-between">
			<span> PC </span>
			<span class="pc">
				{step.pc}
				<button
					class="go-to-line"
					on:click={() => {
						dispatcher('highlight', step.line)
					}}
				>
					go
				</button>
			</span>
		</div>
		<div class="row space-between">
			<span> CCR </span>
			<span>
				<div class="row flags">
					{#each flags as flag, i}
						<div class="flag" class:flag-active={ccr[i]}>
							{flag}
						</div>
					{/each}
				</div>
			</span>
		</div>
	</div>

	{#if step.mutations.length !== 0}
		<div class="column mutations">
			{#each step.mutations as mutation}
				<div>
					{#if mutation.type === 'WriteRegister'}
						Wrote
						{mutation.value.size}
						to
						{mutation.value.register.type[0]}{mutation.value.register.value}
					{:else if mutation.type === 'WriteMemory'}
						Wrote {mutation.value.size} to ${mutation.value.address.toString(16).toUpperCase()}
					{:else if mutation.type === 'WriteMemoryBytes'}
						Wrote {mutation.value.old.length} bytes to ${mutation.value.address
							.toString(16)
							.toUpperCase()}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.undo-to-here {
		position: absolute;
		top: 0;
		left: 0rem;
		width: 2.4rem;
		padding: 0.2rem 0.4rem;
		height: 100%;
		border: none;
		background-color: var(--accent);
		color: var(--accent-text);
		display: flex;
		opacity: 0;
		pointer-events: none;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		transition: all 0.2s;
		font-family: Orienta;
		border-radius: 0.2rem;
	}

	.go-to-line {
		position: absolute;
		top: 0;
		right: 0;
		border: none;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		background-color: var(--accent);
		color: var(--accent-text);
		font-size: 0.8rem;
		font-family: Orienta;
		border-radius: 0.2rem;
		opacity: 0;
	}
	.pc {
		position: relative;
		&:hover {
			.go-to-line {
				opacity: 1;
			}
		}
	}
	.step-header {
		position: relative;
		&:hover {
			.undo-to-here {
				opacity: 1;
				cursor: pointer;
				pointer-events: all;
			}
		}
	}

	.step {
		border-radius: 0.4rem;
		padding: 0.4rem;
		background-color: var(--secondary);
		color: var(--secondary-text);
	}
	.flags {
		gap: 0.3rem;
	}
	.flag {
		border-radius: 0.2rem;
		opacity: 0.3;
		&.flag-active {
			opacity: 1;
			font-weight: bold;
			color: var(--accent);
		}
	}
	.mutations {
		gap: 0.2rem;
		margin-top: 0.3rem;
		padding: 0 0.3rem;
		padding-top: 0.3rem;
		font-size: 0.9rem;
		border-top: var(--tertiary) solid 2px;
	}
</style>
