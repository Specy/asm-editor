<script lang="ts">
	import { Prompt } from '$cmp/prompt'
	import { ThemeStore } from '$stores/themeStore'
	import Color from 'color'
import Button from './buttons/Button.svelte'
	const { question, cancellable, placeholder, promise } = Prompt

	let answer = ''
	$: {
		if ($promise) answer = ''
	}
	let primary = ThemeStore.get('secondary')

	let color = new Color($primary.color).fade(0.2).lighten(0.2)
	$: color = new Color($primary.color).fade(0.2).lighten(0.2)
</script>

<slot />
{#if true}
	<div class="prompt-wrapper" style={`background-color:${color.hex()};`}>
		<div class="prompt-text">
			{$question}sfdf
		</div>
		<input type="text" placeholder={$placeholder} bind:value={answer} class="prompt-input" />
        <div class="prompt-row">
            <Button>
                Cancel
            </Button>
            <Button>
                Ok
            </Button>
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
		color: #bfbfbf;
		backdrop-filter: blur(3px);
		border-radius: 0.5rem;
		box-shadow: 1px 1px 5px rgba(69, 69, 89, 0.25);
		z-index: 20;
        padding: 0.4rem;
		transition: transform 0.3s ease-out;
		flex-direction: column;
		animation: slideIn 0.4s ease-out;
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
        margin-top: 1rem;
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
		padding: 0.7rem;
		font-size: 0.9rem;
		display: flex;
		margin-top: auto;
	}
</style>
