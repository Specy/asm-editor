<script lang="ts">
	import { toast } from '$cmp/toast'
	import { fly } from 'svelte/transition';
	import Icon from '$cmp/layout/Icon.svelte'
	import FaTimes from 'svelte-icons/fa/FaTimes.svelte'

</script>

<slot />
{#key $toast.id}
	<div class="toast-wrapper" class:toastVisible={$toast.visible} in:fly={{y: -100}}>
		<div 
			class="toast-title"
			style={`border-color:${$toast.color}`}
		>
			<div>
				{$toast.title}
			</div>
			<Icon on:click={toast.closeToast}>
				<FaTimes />
			</Icon>
		</div>
		<div class="toast-text">
			{$toast.message}
		</div>
		<div class="toast-progress">
			<div
				class='toast-progress-bar'
				style={`
					animation-duration: ${$toast.duration}ms; 
					background-color: ${$toast.color};
				`}
			/>
		</div>
	</div>
{/key}

<style lang="scss">
	.toast-wrapper {
		display: flex;
		position: fixed;
		right: 1rem;
		top: 1rem;
		max-height: 10rem;
		width: 20rem;
		color: #bfbfbf;
		background-color: rgba(var(--RGB-secondary), 0.85);
		backdrop-filter: blur(3px);
		border-radius: 0.4rem;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
		z-index: 20;
		transition: transform 0.3s ease-out;
		animation: animateIn 0.3s ease-out;
		transform: translateY(calc(-100% - 1rem));
		flex-direction: column;
		padding: 0.6rem;
		padding-top: 0.1rem;
	}

	.toastVisible {
		transform: translateY(0);
	}
	.toast-progress {
		width: 100%;
		height: 0.2rem;
		border-radius: 1rem;
		overflow: hidden;
	}
	.toast-progress-bar{
		animation-name: mergeToZero;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
		width: 100%;
		
		height: 0.2rem;

	}
	@keyframes mergeToZero{
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-100%);
		}
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
		padding: 0.4rem 0rem 0.4rem 0.6rem;

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
