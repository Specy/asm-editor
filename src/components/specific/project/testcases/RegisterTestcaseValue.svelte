<script lang="ts">
    import FaArrowRight from 'svelte-icons/fa/FaArrowRight.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'

    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { createEventDispatcher } from 'svelte'

    export let name: string
    export let canDelete: boolean = true
    const dispatcher = createEventDispatcher<{
        'change-key': { old: string, new: string }
        'delete': void
    }>()
    export let registersNames: string[]
    export let value: number

    export let style = ''
</script>

<div class="register-testcase" {style}>
	<select
		value={name}
		on:change={(e) => dispatcher('change-key', {
			old: name,
			new: e.target.value
		})}
	>
		{#each registersNames as registerName}
			<option value={registerName}>{registerName}</option>
		{/each}
	</select>
	<div class="hide-on-hover" style={!canDelete ? "display: flex" : ''}>
		<Icon size={0.8}>
			<FaArrowRight />
		</Icon>
	</div>
	{#if canDelete}
		<button
			class="show-on-hover"
			on:click={() => dispatcher('delete')}
		>
			<Icon size={0.8}>
				<FaTimes />
			</Icon>
		</button>
	{/if}

	<input type="number" bind:value>
</div>


<style>
    .register-testcase {
        background-color: var(--secondary);
        display: flex;
        align-items: center;
        border-radius: 0.3rem;
        overflow: hidden;
    }

    .show-on-hover, .hide-on-hover {
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
        width: 4rem;
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
    input[type=number] {
        -moz-appearance: textfield;
    }
</style>