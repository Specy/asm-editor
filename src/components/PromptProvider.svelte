<script lang="ts">
	import { Prompt } from '$cmp/prompt'
	import { fade } from 'svelte/transition';


	import Button from './buttons/Button.svelte'
	import Input from './inputs/Input.svelte';
	const { question, cancellable, placeholder, promise, type,answer } = Prompt

	let value = ''
	$: if ($promise) value = ''
	
</script>

<slot />
{#if $promise}
	<div class="prompt-wrapper" out:fade={{duration: 150}}>
		<div class="prompt-text">
			{$question}
		</div>
		{#if $type === 'text'}
			<Input 
				bind:value
				hideStatus
				style="color: var(--primary-text); background-color: var(--primary);"
			/>
		{/if}

        <div class="prompt-row">
			{#if $type === 'text'}
				<Button bg="var(--secondary)" color="var(--secondary-text)" disabled={!$cancellable}>
					Cancel
				</Button>
				<Button on:click={() => answer(value)}>
					Ok
				</Button>
			{:else}
				<Button on:click={() => answer(false)} bg='var(--secondary)' color='var(--secondary-text)'>
					Cancel
				</Button>
				<Button on:click={() => answer(true)} bg='var(--red)' color='var(--red-text)'>
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
        padding: 0.4rem;
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

	.prompt-input {
		display: flex;
		width: 100%;
        height: 2rem;
        border-radius: 0.3rem;
		background-color: var(--primary);
	}
    .prompt-row{
        display: flex;
        margin-top: 0.5rem;
        justify-content: space-between;
    }
	.close-icon {
		color: var(--accent);
		width: 1.2rem;
		padding-top: 0.2rem;
		height: 1.2rem;
		cursor: pointer;
	}
	.close-icon:hover {
		color: var(--accent);
	}

	.prompt-title {
		width: 100%;
		display: flex;
		padding: 0.8rem;
		padding-top: 0.4rem;
		justify-content: space-between;
		flex-direction: row;
		font-size: 1.1rem;
		align-items: flex-start;
		padding-bottom: 0.2rem;
		margin-bottom: 0.2rem;
		border-bottom: solid 1px var(--accent);
	}
	.prompt-text {
		padding: 0.3rem;
		font-size: 0.9rem;
		display: flex;
		margin-top: auto;
	}
</style>
