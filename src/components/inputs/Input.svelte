<script lang="ts">
	import FaExclamationCircle from 'svelte-icons/fa/FaExclamationCircle.svelte'
	import FaCheckCircle from 'svelte-icons/fa/FaCheckCircle.svelte'
	import FaRegCircle from 'svelte-icons/fa/FaRegCircle.svelte'
	import { theme } from '$stores/theme';
	type statusType = '' | 'correct' | 'wrong'
	export let title = ''
	export let value = ''
	export let status: statusType = ''
	$: if (value === '') status = ''
	export let type = 'text'
	export let hideStatus = false
	const setType = (node) => {
		node.type = type
	}
</script>

<div class="input-wrapper">
	<div>{title}</div>
	<div class="input-row" class:dark={$theme === 'dark'}>
		<input
			bind:value
			class="form-input"
			use:setType
			placeholder={title.toUpperCase()}
			style={hideStatus ? 'border:none;' : '' + value === '' ? ' border: none;' : ''}
		/>
		{#if !hideStatus}
			<div class={status + ' icon-wrapper'}>
				{#if status === 'wrong'}
					<FaExclamationCircle />
				{:else if status === 'correct'}
					<FaCheckCircle />
				{:else}
					<FaRegCircle />
				{/if}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@import '../../variables.scss';
	.input-row {
		display: flex;
		align-items: center;
		border-radius: 0.4rem;
		background-color: rgba(214, 214, 214, 0.5);
		padding: 0.2rem;
		margin-top: 0.2rem;
	}
	.dark{
		background-color: rgba(47, 51, 53, 0.5);
		> input {
			color: #bfbfbf;
		}
	}
	.input-wrapper {
		display: flex;
		flex-direction: column;
	}
	.icon-wrapper {
		height: 1.2rem;
		width: 1.2rem;
		margin: 0 0.5rem;
		display: flex;
		align-items: center;
		color: transparent;
		cursor: pointer;
	}
	.correct {
		color: rgb(16, 185, 129);
	}
	.wrong {
		color: rgb(239, 68, 68);
	}
	.form-input {
		display: flex;
		flex: 1;
		border: none;
		border-right: solid 1px gray;
		background-color: transparent;
		padding: 0.6rem 1rem;
	}
	input::placeholder {
		color: rgb(116, 116, 116);
		font-size: 0.8rem;
	}
</style>
