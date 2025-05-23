<script lang="ts">
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        style?: string
        selected?: RegisterSize
        maxSize: RegisterSize
    }

    let { maxSize, style = '', selected = $bindable(RegisterSize.Word) }: Props = $props()

    const sizes = $derived([RegisterSize.Byte, RegisterSize.Word, RegisterSize.Long, RegisterSize.Double].filter(v => v <= maxSize))
    const sizeMap = {
        [RegisterSize.Byte]: 'B',
        [RegisterSize.Word]: 'W',
        [RegisterSize.Long]: 'L',
        [RegisterSize.Double]: 'D'
    } satisfies Record<RegisterSize, string>
</script>

<div class="size-selector-2" {style}>
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
        background-color: rgba(var(--RGB-accent2), 0.3);
    }

    .size-selector-2-button:active {
        background-color: var(--accent2);
        color: var(--accent2-text);
    }

    .size-selector-2-button-selected {
        transition: background-color 0s;
        background-color: var(--accent2);
        color: var(--accent2-text);
    }
</style>
