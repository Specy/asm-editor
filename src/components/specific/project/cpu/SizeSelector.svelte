<script lang="ts">
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        style?: string
        selected?: RegisterSize
    }

    let { style = '', selected = $bindable(RegisterSize.Word) }: Props = $props()
</script>

<div class="row" {style}>
    <label for={`${RegisterSize.Long}`}>
        L
        <input
            type="radio"
            name="size"
            id={`${RegisterSize.Long}`}
            value={RegisterSize.Long}
            bind:group={selected}
        />
    </label>
    <label for={`${RegisterSize.Word}`}>
        W
        <input
            type="radio"
            name="size"
            id={`${RegisterSize.Word}`}
            value={RegisterSize.Word}
            bind:group={selected}
        />
    </label>
    <label for={`${RegisterSize.Byte}`}>
        B
        <input
            type="radio"
            name="size"
            id={`${RegisterSize.Byte}`}
            value={RegisterSize.Byte}
            bind:group={selected}
        />
    </label>
</div>

<style>
    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-around;
        height: 3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.4rem;
        min-width: 6rem;
        padding: 0.3rem;
    }
    input {
        appearance: none;
        border-radius: 2rem;
        border: 2px solid #666;
        background-color: var(--secondary-text);
        margin-bottom: 0.2rem;
        width: 0.8rem;
        height: 0.8rem;
        position: relative;
        cursor: pointer;
    }

    input:checked {
        border: 0.2rem solid;
        border-color: var(--accent);
        background-color: transparent;
    }
    label {
        display: flex;
        flex: 1;
        width: 100%;
        justify-content: space-between;
        align-items: center;
        flex-direction: column;
        cursor: pointer;
    }
</style>
