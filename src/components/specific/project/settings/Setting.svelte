<script lang="ts">
    import type { PreferenceValue } from '$stores/preferencesStore.svelte'
    import Switch from '$cmp/shared/input/Switch.svelte'
    import { createEventDispatcher } from 'svelte'

    interface Props {
        entry: PreferenceValue<unknown>
    }

    let { entry }: Props = $props()
    let value = $derived(entry.value)
    const dispatcher = createEventDispatcher<{
        changeValue: unknown
    }>()
</script>

<div class="row settings-value">
    <div>
        {entry.name}
    </div>
    <div>
        {#if entry.type === 'boolean'}
            <Switch
                bind:checked={value as boolean}
                title={entry.name}
                onChange={(checked) => {
                    dispatcher('changeValue', checked)
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
        padding: 0.4rem;
        padding-left: 1rem;
    }
    .number {
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        width: 7rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
