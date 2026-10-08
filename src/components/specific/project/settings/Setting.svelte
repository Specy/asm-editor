<script lang="ts">
    import type { PreferenceValue } from '$stores/preferencesStore.svelte'
    import Switch from '$cmp/shared/input/Switch.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
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
        {#if entry.type === 'choice' && entry.options}
            <Select
                options={entry.options.map((option) => ({
                    key: option.label,
                    value: option.value
                }))}
                {value}
                ariaLabel={entry.name}
                onChange={(value) => dispatcher('changeValue', value)}
                style="padding: 0.4rem 0.6rem; background: var(--tertiary); color: var(--tertiary-text)"
                wrapperStyle="min-width: 9rem; max-width: 12rem"
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
    /* the height and padding of a Project Setting's row, so the two kinds read as one list */
    .settings-value {
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        min-height: calc(2rem + 0.4rem);
        padding: 0.2rem 0.4rem;
        font-size: 0.9rem;
    }
    .number {
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        width: 7rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
