<script lang="ts">
    interface Props {
        value?: string
        style?: string
        placeholder?: string
        label?: string
    }

    let { value = $bindable(''), style = '', placeholder = '', label = '' }: Props = $props()
</script>

<div class="input-row" {style}>
    {#if label}
        <div class="label">
            {label}
        </div>
    {/if}
    <input bind:value class="form-input" class:no-label={!label} {placeholder} />
</div>

<style lang="scss">
    .input-row {
        display: flex;
        border-radius: 0.4rem;
        padding: 0.4rem 0.8rem;
        align-items: center;
        font-size: 0.9rem;
        background-color: var(--secondary);
        color: var(--secondary-text);

        > input {
            width: 100%;
            padding: 0.3rem 0.8rem;
            font-size: 1rem;
            font-family: monospace;
            color: var(--secondary-text);
        }
        > input.no-label {
            padding: 0.3rem 0;
        }
    }

    .label {
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0.3rem 0.8rem 0.3rem 0;
        border-right: solid 1px gray;
    }
    .form-input {
        display: flex;
        flex: 1;
        border: none;
        background-color: transparent;
    }
    input::placeholder {
        color: rgb(116, 116, 116);
        font-size: 0.8rem;
    }
</style>
