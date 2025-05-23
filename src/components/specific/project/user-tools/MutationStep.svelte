<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { ccrToFlagsArray } from '@specy/s68k'
    import { createEventDispatcher } from 'svelte'
    import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
    import type { ExecutionStep } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        step: ExecutionStep
        flags: string[]
    }

    let { step, flags }: Props = $props()
    let ccr = $derived(ccrToFlagsArray(step.new_ccr.bits).reverse())

    const sizeMap = {
        1: 'Byte',
        2: 'Word',
        4: 'Long'
    }
    const dispatcher = createEventDispatcher<{
        undo: void
        highlight: number
    }>()
</script>

<div class="column step">
	<div class="step-header column">
		<button
			class="undo-to-here"
			onclick={() => {
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
                0x{step.pc.toString().toUpperCase()}
				<button
					class="go-to-line"
					onclick={() => {
                        dispatcher('highlight', step.line)
                    }}
				>
                    go
                </button>
            </span>
		</div>
		{#if flags.length !== 0}
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
		{/if}
	</div>

	{#if step.mutations.length !== 0}
		<div class="column mutations">
			{#each step.mutations as mutation}
				<div>
					{#if mutation.type === 'WriteRegister'}
						Wrote
						{sizeMap[mutation.value.size]}
						to
						{mutation.value.register}
					{:else if mutation.type === 'WriteMemory'}
						Wrote {sizeMap[mutation.value.size] ?? mutation.value.size} to ${mutation.value.address
						.toString(16)
						.toUpperCase()}
					{:else if mutation.type === 'WriteMemoryBytes'}
						Wrote {mutation.value.old.length} bytes to ${mutation.value.address
						.toString(16)
						.toUpperCase()}
					{:else if mutation.type === 'PopCallStack'}
						Popped call from {mutation.value.from.toString(16).toUpperCase()} to
						{mutation.value.to.toString(16).toUpperCase()}
					{:else if mutation.type === 'PushCallStack'}
						Pushed call from {mutation.value.from.toString(16).toUpperCase()} to
						{mutation.value.to.toString(16).toUpperCase()}
					{:else if mutation.type === 'Other'}
						{mutation.value}
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
    font-family: Rubik;
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
    font-family: Rubik;
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
    min-height: 2rem;
    justify-content: center;
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
