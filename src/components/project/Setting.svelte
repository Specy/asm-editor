<script lang="ts">
	import type { SettingValue } from '$stores/settingsStore'
	import { createEventDispatcher } from 'svelte'
	type T = $$Generic

	export let entry: SettingValue<T>
    let prev = entry.value
    $: prev = entry.value
	let value = entry.value
    $: value = prev
	const dispatcher = createEventDispatcher<{
		changeValue: T
	}>()
</script>

<div class="row settings-value">
	<div>
		{entry.name}
	</div>
	<div>
		{#if entry.type === 'boolean'}
			<input
				type="checkbox"
				bind:checked={value}
				on:change={() => {
					dispatcher('changeValue', value)
				}}
			/>
		{/if}
	</div>
</div>

<style lang="scss">
	.settings-value {
		justify-content: space-between;
        padding: 0.5rem;

	}
</style>
