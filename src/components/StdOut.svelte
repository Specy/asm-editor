<script lang="ts">
	import type { MonacoError } from '$lib/M68KEmulator'
	export let stdOut: string
	export let compilerErrors: MonacoError[] = []
	import FaExclamationTriangle from 'svelte-icons/fa/FaExclamationTriangle.svelte'
	import { fly } from 'svelte/transition'
	let areCompilerErrorsShown = false
</script>

<div class="std-out">
	{#if compilerErrors.length}
		<button
			class="floating-std-icon"
            in:fly={{duration: 300}}
            out:fly={{duration: 200}}
            class:compilerErrorsShown={areCompilerErrorsShown}
			on:click={() => (areCompilerErrorsShown = !areCompilerErrorsShown)}
		>
			<FaExclamationTriangle />
		</button>
	{/if}
	<div class="std-text">
		{#if areCompilerErrorsShown}
			{compilerErrors.map((e) => e.formatted).join('\n') + '\n'}
		{/if}
		{stdOut}
	</div>
</div>

<style lang="scss">
	.floating-std-icon {
		position: absolute;
		background-color: var(--red);
		color: white;
		padding: 0.2rem;
		right: 0.4rem;
		border-radius: 0.2rem;
		width: 1.4rem;
		height: 1.4rem;
		cursor: pointer;
        transition: all 0.3s;
		bottom: 0.4rem;
        &:hover{
            filter: brightness(1.2);
        }
	}

    .compilerErrorsShown{
        background-color: var(--accent2);
    }
	.std-out {
		display: flex;
		padding: 0.6rem;
		position: relative;
		border-radius: 0.5rem;
		flex: 1;
		overflow-y: auto;
		margin-top: 0.5rem;
		background-color: var(--secondary);
		@media screen and (max-width: 1000px) {
				min-height: 4rem;
				width: 100%;
			}
	}
</style>
