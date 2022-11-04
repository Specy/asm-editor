<script lang="ts">
	export let errors: string[] = []
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import Icon from '../layout/Icon.svelte'
	let index = 0
	$: if (errors) index = 0
</script>

<div class="error">
	<div class="error-body">
		{errors[index] || ''}
	</div>
	<div class="error-buttons">
		<div class="icon-wrapper" class:iconHidden={index <= 0}>
			<Icon
				size={2}
				style="width:1rem"
				on:click={() => {
					if (index > 0) index--
				}}
			>
				<FaAngleLeft />
			</Icon>
		</div>
		<div class="icon-wrapper" class:iconHidden={index >= errors.length - 1}>
			<Icon
				size={2}
				style="width:1rem"
				on:click={() => {
					if (index < errors.length - 1) index++
				}}
			>
				<FaAngleRight />
			</Icon>
		</div>
	</div>
</div>

<style lang="scss">
	.error {
		display: flex;
		background-color: var(--secondary);
		border-radius: 0.4rem;
		justify-content: space-between;
		padding: 0.2rem;
		position: relative;
		.error-body {
			padding: 0.4rem;
		}
		.error-index {
			font-size: 0.8rem;
			position: absolute;
			bottom: 0.2rem;
			right: 0.2rem;
		}
		.error-buttons {
			display: flex;
		}
	}
	.icon-wrapper {
		width: 1rem;
	}
	.iconHidden {
		visibility: hidden;
		pointer-events: none;
	}
</style>
