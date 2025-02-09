<script lang="ts">
    import { run } from 'svelte/legacy'

    import type { SettingValue } from '$stores/settingsStore.svelte'
    import { createEventDispatcher } from 'svelte'
    type T = $$Generic

    interface Props {
        entry: SettingValue<T>
    }

    let { entry }: Props = $props()
    let prev = $state(entry.value)
    $effect(() => {
        prev = entry.value
    })
    let value = $state(entry.value)
    $effect(() => {
        value = prev
    })
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
                onchange={() => {
                    dispatcher('changeValue', value)
                }}
            />
        {/if}
        {#if entry.type === 'number'}
            <input
                class="number"
                type="number"
                bind:value
                onchange={() => {
                    dispatcher('changeValue', value)
                }}
            />
        {/if}
    </div>
</div>

<style lang="scss">
    .settings-value {
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem;
    }
    .number {
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        width: 7rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
