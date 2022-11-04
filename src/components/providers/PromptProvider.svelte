<script lang="ts">
	import { Prompt, PromptType } from '$stores/promptStore'
	import { fade } from 'svelte/transition';


	import Button from '../buttons/Button.svelte'
	import Input from '../inputs/Input.svelte';

	let value = ''
	$: if (!$Prompt.promise) value = ''
	
</script>

<slot />
{#if $Prompt.promise}
	<div class="prompt-wrapper" out:fade={{duration: 150}}>
		<div class="prompt-text">
			{$Prompt.question}
		</div>
		{#if $Prompt.type === PromptType.Text}
			<Input 
				bind:value
				hideStatus
				style="color: var(--primary-text); background-color: var(--primary);"
			/>
		{/if}

        <div class="prompt-row">
			{#if $Prompt.type === PromptType.Text}
				<Button cssVar='secondary' disabled={!$Prompt.cancellable}>
					Cancel
				</Button>
				<Button on:click={() => Prompt.answer(value)}>
					Ok
				</Button>
			{:else}
				<Button on:click={() => Prompt.answer((false))} cssVar='secondary'>
					Cancel
				</Button>
				<Button on:click={() => Prompt.answer((true))} cssVar='accent2'>
					Yes
				</Button>
			{/if}
        </div>

	</div>
{/if}

<style lang="scss">
	.prompt-wrapper {
		display: flex;
		position: fixed;
		top: 1rem;
		overflow: hidden;
		max-height: 10rem;
		width: 20rem;
		color: var(--primary-text);
		backdrop-filter: blur(3px);
		border-radius: 0.5rem;
		background-color: rgba(var(--RGB-secondary), 0.8);
		box-shadow: 0 3px 10px rgb(0 0 0 / 20%);
		z-index: 20;
        padding: 0.5rem;
		transition: transform 0.3s ease-out;
		flex-direction: column;
		animation: slideIn 0.25s ease-out;
		animation-fill-mode: forwards;
		transform: translateX(calc(50vw - 50%));
	}
	@keyframes slideIn {
		from {
			transform: translateY(-80%) translateX(calc(50vw - 50%)) scale(0.95);
			opacity: 0;
		}
		to {
			transform: translateY(0) translateX(calc(50vw - 50%)) scale(1);
			opacity: 1;
		}
	}
    .prompt-row{
        display: flex;
        margin-top: 0.5rem;
        justify-content: space-between;
    }
	.prompt-text {
		padding: 0.3rem;
		font-size: 0.9rem;
		display: flex;
		margin-top: auto;
	}
</style>
