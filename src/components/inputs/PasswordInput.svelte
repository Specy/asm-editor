<script lang="ts">
	import FaExclamationCircle from 'svelte-icons/fa/FaExclamationCircle.svelte'
	import FaCheckCircle from 'svelte-icons/fa/FaCheckCircle.svelte'
	import FaEye from 'svelte-icons/fa/FaEye.svelte'
	import FaEyeSlash from 'svelte-icons/fa/FaEyeSlash.svelte'
	import checkStrenght from '../../lib/checkPassword'
	type statusType = '' | 'correct' | 'wrong'

	export let title = ''
	export let value = ''
	export let status: statusType = ''
	export let hideStatus = false
	export let passwordToCheck = ''
	let element = null
	let passwordShown = false
	let passwordStatus = checkStrenght(value)

	function togglePassword() {
		if (element === null) return
		passwordShown = !passwordShown
		element.type = passwordShown ? 'text' : 'password'
	}
	$: {
		if (value === '') status = ''
		passwordStatus = checkStrenght(value)
		status = passwordStatus.id > 0 ? 'correct' : 'wrong'
		if (passwordToCheck !== '') status = passwordToCheck === value ? 'correct' : 'wrong'
	}
</script>

<div class="input-wrapper">
	<div>{title}</div>
	<div class="input-row">
		<input
			bind:value
			class="form-input"
			type="password"
			bind:this={element}
			placeholder={title.toUpperCase()}
			style={value === '' ? 'border: none' : ''}
		/>
		{#if value !== ''}
			<div class="show-password" on:click={togglePassword}>
				{#if passwordShown}
					<FaEyeSlash />
				{:else}
					<FaEye />
				{/if}
			</div>

			{#if !hideStatus}
				<div class={status + ' icon-wrapper'}>
					{#if status !== 'correct'}
						<FaExclamationCircle />
					{:else}
						<FaCheckCircle />
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<div class="password-strength">
		{#if !hideStatus}
			{#if passwordToCheck === ''}
				{passwordStatus.status}
			{:else if passwordToCheck === value}
				Passwords match
			{:else}
				Passwords don't match
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	@import '../../variables.scss';
	.password-strength {
		width: 100%;
		text-align: right;
		margin-top: 0.5rem;
	}
	.input-row {
		display: flex;
		align-items: center;
		border-radius: 0.4rem;
		padding: 0.2rem;
		margin-top: 0.2rem;
		background-color: rgba(47, 51, 53, 0.5);
		> input {
			color: #bfbfbf;
		}
	}
	.input-wrapper {
		display: flex;
		flex-direction: column;
	}
	.icon-wrapper,
	.show-password {
		height: 1.2rem;
		width: 1.2rem;
		margin: 0 0.5rem;
		display: flex;
		align-items: center;
		color: transparent;
		cursor: pointer;
	}
	.show-password {
		color: gray;
	}
	.show-password:hover {
		color: $accent;
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
