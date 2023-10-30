<script lang="ts">
	import type { InstructionDocumentation } from '$lib/languages/M68K-documentation'
	export let currentInstructionName = ''
	export let instructions: InstructionDocumentation[]
</script>

<div class="column">
	{#each instructions as ins}
		<a 
			href="/documentation/m68k/instruction/{ins.name}" 
			class="instruction-link" 
			class:current-instruction={ins.name === currentInstructionName}
			on:click
		>
			<div class="instruction-link-inner">
				{ins.name}
			</div>
		</a>
	{/each}
</div>

<style lang="scss">
	a {
		padding: 0.4rem 0.6rem;
		border-radius: 0.2rem;
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
		border-left: solid 0.2rem transparent;
	}

	a:hover {
		background-color: var(--tertiary);
		color: var(--tertiary-text);
		border-left-color: var(--accent);
	}
	.current-instruction{
		border-left-color: var(--accent2);
		background-color: rgba(var(--RGB-tertiary), 0.5);
	}
	.instruction-link-inner{
		transition: transform 0.1s;
	}
	a:hover > .instruction-link-inner {
		transform: translateX(0.2rem);
	}
</style>
