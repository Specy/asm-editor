<script lang="ts">
	import type { InstructionDocumentation } from '$lib/languages/M68K-documentation'
  import Column from '$cmp/shared/layout/Column.svelte'
	export let currentInstructionName = ''
	export let instructions: InstructionDocumentation[]
</script>

<Column>
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
</Column>

<style lang="scss">
	a {
		padding: 0.4rem 0.6rem;
		border-radius: 0 0.2rem 0.2rem 0 ;
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
