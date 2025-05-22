<script lang="ts">
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        style?: string
        selected?: RegisterSize
    }

    let { style = '', selected = $bindable(RegisterSize.Word) }: Props = $props()

    const sizes = [
        RegisterSize.Byte,
        RegisterSize.Word,
        RegisterSize.Long
    ]
    const sizeMap = {
        [RegisterSize.Byte]: 'B',
        [RegisterSize.Word]: 'W',
        [RegisterSize.Long]: 'L',
        [RegisterSize.Double]: 'D'
    } satisfies Record<RegisterSize, string>
</script>


<div class='size-selector-2'>
	{#each sizes as size}
		<button
			onclick={() => {
				selected = size
			}}
			class="size-selector-2-button"
			class:size-selector-2-button-selected={selected === size}
		>
			{sizeMap[size]}
		</button>
	{/each}
</div>

<style>

    .size-selector-2 {
        border-radius: 0.4rem;
        overflow: hidden;
        display: flex;
        height: fit-content;
    }

    .size-selector-2-button {
        display: flex;
        justify-content: center;
        cursor: pointer;
        align-items: center;
        font-family: Rubik;
        padding: 0.25rem 0.5rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        transition: background-color 0.2s;
    }

    .size-selector-2-button:hover:not(.size-selector-2-button-selected):not(:active) {
        background-color: rgba(var(--RGB-accent), 0.3);
    }

    .size-selector-2-button:active {
        background-color: var(--accent);
        color: var(--accent-text);
    }

    .size-selector-2-button-selected {
        transition: background-color 0s;
        background-color: var(--accent);
        color: var(--accent-text);
    }

</style>
