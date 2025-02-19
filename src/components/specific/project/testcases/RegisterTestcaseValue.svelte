<script lang="ts">
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import FaEquals from 'svelte-icons/fa/FaEquals.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { createEventDispatcher } from 'svelte'

    const dispatcher = createEventDispatcher<{
        'change-key': { old: string; new: string }
        delete: void
    }>()

    interface Props {
        name: string
        canDelete?: boolean
        registersNames: string[]
        value: number
        style?: string
    }

    let {
        name,
        canDelete = true,
        registersNames,
        value = $bindable(),
        style = ''
    }: Props = $props()
</script>

<div class="register-testcase" {style}>
    <select
        value={name}
        onchange={(e) =>
            dispatcher('change-key', {
                old: name,
                //@ts-expect-error .value
                new: e.target.value
            })}
    >
        {#each registersNames as registerName}
            <option value={registerName}>{registerName}</option>
        {/each}
    </select>
    <div class="hide-on-hover" style={!canDelete ? 'display: flex' : ''}>
        <Icon size={0.8}>
            <FaEquals />
        </Icon>
    </div>
    {#if canDelete}
        <button class="show-on-hover" onclick={() => dispatcher('delete')}>
            <Icon size={0.8}>
                <FaTimes />
            </Icon>
        </button>
    {/if}

    <input type="number" bind:value />
</div>

<style>
    .register-testcase {
        background-color: var(--secondary);
        display: flex;
        align-items: center;
        border-radius: 0.3rem;
        overflow: hidden;
    }

    .show-on-hover,
    .hide-on-hover {
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
        justify-content: center;
    }

    .show-on-hover {
        display: none;
        cursor: pointer;
        background-color: var(--red);
        color: var(--red-text);
    }

    .register-testcase:hover .hide-on-hover {
        display: none;
    }

    .register-testcase:hover .show-on-hover {
        display: flex;
    }

    select {
        height: 100%;
        background-color: var(--secondary);
        color: var(--secondary-text);
        padding: 0.3rem;
        border-right: solid 0.1rem var(--primary);
    }

    input {
        padding: 0.2rem 0.5rem;
        appearance: none;
        border-left: solid 0.1rem var(--primary);
        height: 100%;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    /* Firefox */
    input[type='number'] {
        -moz-appearance: textfield;
    }
</style>
