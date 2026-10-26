<script lang="ts">
    import { onMount } from 'svelte'
    import type { FullAutoFill } from 'svelte/elements'

    interface Props {
        title?: string
        value: string
        style?: string
        wrapperStyle?: string
        type?: string
        placeholder?: string
        focus?: boolean
        el?: HTMLInputElement
        autoComplete?: FullAutoFill
        onkeydown?: (event: KeyboardEvent) => void
    }

    let {
        title = '',
        value = $bindable(),
        style = '',
        type = 'text',
        placeholder = '',
        focus = false,
        autoComplete,
        wrapperStyle,
        el = $bindable(),
        onkeydown
    }: Props = $props()
    onMount(() => {
        if (focus) el?.focus()
    })
</script>

<div class="input-wrapper" style={wrapperStyle}>
    {#if title}
        <div>{title}</div>
    {/if}
    <div class="input-row" {style}>
        <input
            spellcheck="false"
            autocomplete={autoComplete}
            bind:value
            class="form-input"
            {type}
            bind:this={el}
            {onkeydown}
            {placeholder}
        />
    </div>
</div>

<style lang="scss">
    .input-row {
        display: flex;
        align-items: center;
        border-radius: 0.4rem;
        padding: 0.2rem;
        background-color: var(--secondary);
        color: var(--secondary-text);

        > input {
            color: var(--secondary-text);
        }
    }
    .input-wrapper {
        display: flex;
        gap: 0.3rem;
        flex-direction: column;
    }
    .form-input {
        display: flex;
        flex: 1;
        border: none;
        background-color: transparent;
        color: inherit;
        padding: 0.6rem 1rem;
    }
    input::placeholder {
        color: rgb(116, 116, 116);
        font-size: 0.8rem;
    }
</style>
