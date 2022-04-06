<script lang="ts">
	import { toast } from '$cmp/toast'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaTimes from 'svelte-icons/fa/FaTimes.svelte'

	const { title, duration, message, visible, closeToast, color } = toast
	let toastVisible = false  
	$: toastVisible = $visible
</script>

<slot />
<div class="toast-wrapper" class:toastVisible>
	<div class="toast-title">
		<div>
			{$title}
		</div>
		<Icon on:click={closeToast}>
			<FaTimes />
		</Icon>
	</div>
	<div class="toast-text">
		{$message}
	</div>
	<div class="toast-progress">
		<div
			class={$visible ? 'toast-progress-bar' : ''}
			style={`transition: all ${$duration}ms linear; background-color: ${$color}`}
		/>
	</div>
</div>

<style lang="scss">
	.toast-wrapper {
		display: flex;
		position: fixed;
		right: 1rem;
		top: 1rem;
		overflow: hidden;
		max-height: 10rem;
		width: 20rem;
		color: #bfbfbf;
		background-color: rgba(var(--RGB-secondary), 0.8);
		backdrop-filter: blur(3px);
		border-radius: 0.4rem;
		box-shadow: 1px 1px 5px rgba(69, 69, 89, 0.25);
		z-index: 20;
		transform: translateY(-13rem);
		transition: transform 0.3s ease-out;
		flex-direction: column;
	}
	.toastVisible {
		transform: translateY(0);
	}
	.toast-progress {
		width: 100%;
		height: 0.2rem;
	}
	.toast-progress div {
		width: 100%;
		height: 0.2rem;
		background-color: var(--accent);
	}
	.toast-progress-bar {
		width: 0% !important;
	}
	.close-icon {
		color: var(--secondary-text);
		width: 1.2rem;
		padding-top: 0.2rem;
		height: 1.2rem;
		cursor: pointer;
	}
	.close-icon:hover {
		color: var(--accent);
	}

	.toast-title {
		width: 100%;
		display: flex;
		padding: 0.4rem 0.4rem 0.4rem 0.6rem;

		justify-content: space-between;
		flex-direction: row;
		font-size: 1.1rem;
		align-items: flex-start;
		margin-bottom: 0.2rem;
		border-bottom: solid 1px var(--accent);
	}
	.toast-text {
		padding: 0.7rem;
		font-size: 0.9rem;
		display: flex;
		margin-top: auto;
	}
	@media (max-width: 480px) {
		.toast-wrapper {
			left: 0;
			transform: translateX(calc(50vw - 50%)) translateY(-13rem);
		}
		.toastVisible {
			transform: translateX(calc(50vw - 50%)) translateY(1rem);
		}
	}
</style>
