<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import { capitalize } from '$lib/utils'
    import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
    import { riscvInstructionNames } from '$lib/languages/RISC-V/RISC-V-documentation'

    type Group = {
        letter: string
        instructions: string[]
    }
    const instructions = Array.from(riscvInstructionNames)
    const groups = new Array(26).fill(0).map((_, i) => {
        const letter = String.fromCharCode(65 + i)
        return {
            letter,
            instructions: instructions.filter((e) => e[0].toUpperCase() === letter)
        } satisfies Group
    })
</script>

<title> RISC-V Instructions </title>

<svelte:head>
	<meta
		name="description"
		content="Read the RISC-V Instructions documentation, including all the instructions with addressing modes and the assembler features"
	/>
	<meta
		property="og:description"
		content="Read the RISC-V Instructions documentation, including all the instructions with addressing modes and the assembler features"
	/>
</svelte:head>

<Page contentStyle="padding-top: 4rem; gap: 1rem; padding: 1rem">
	<h1>RISC-V Instructions</h1>
	{#each groups as group}
		{#if group.instructions.length}
			<a href="#{group.letter}" style="width: min-content; margin-top: 2rem;">
				<h2 class="letter-group" id={group.letter}>
					<div>
						{group.letter}
					</div>
				</h2>
			</a>
			<div class="instructions">
				{#each group.instructions as ins}
					<a class="instruction" href="/documentation/risc-v/instruction/{ins}">
						<div>
							{capitalize(ins)}
						</div>
						<div class="arrow">
							<FaArrowRight />
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/each}
</Page>

<style lang="scss">
  .instructions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .letter-group {
    background-color: var(--accent);
    color: var(--accent-text);
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 10rem;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .instruction {
    padding: 1rem 1rem 1rem 2rem;
    align-items: center;
    border-radius: 0.5rem;
    display: flex;
    width: 15rem;
    gap: 1rem;
    text-align: center;
    font-size: 1.2rem;
    justify-content: space-between;
    background-color: var(--secondary);
    color: var(--secondary-text);
    transition: all 0.2s;

    &:hover {
      background-color: var(--tertiary);
      color: var(--tertiary-text);
    }
  }

  @media (max-width: 600px) {
    .instructions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }
    .instruction {
      width: 100%;
      justify-content: center;
      padding-right: 2rem;
    }
    .arrow {
      display: none;
    }
  }

  .arrow {
    opacity: 0;
    height: 1.5rem;
    transition: all 0.2s;
    transform: translateX(-1rem);
  }

  .instruction:hover .arrow {
    opacity: 1;
    transform: translateX(0);
  }

  .icon {
    height: 2.2rem;
    display: flex;
    align-items: center;
    gap: 1rem;

    img {
      height: 100%;
    }
  }
</style>
