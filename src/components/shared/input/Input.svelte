<script lang="ts">
    import { run, createBubbler } from 'svelte/legacy'

    const bubble = createBubbler()
    import FaExclamationCircle from 'svelte-icons/fa/FaExclamationCircle.svelte'
    import FaCheckCircle from 'svelte-icons/fa/FaCheckCircle.svelte'
    import FaRegCircle from 'svelte-icons/fa/FaRegCircle.svelte'
    import { onMount } from 'svelte'
    type statusType = '' | 'correct' | 'wrong'

    interface Props {
        title?: string
        value: any
        status?: statusType
        style?: string
        type?: string
        placeholder?: string
        focus?: boolean
        hideStatus?: boolean
        el?: HTMLInputElement
    }

    let {
        title = '',
        value = $bindable(),
        status = $bindable(''),
        style = '',
        type = 'text',
        placeholder = '',
        focus = false,
        hideStatus = true,
        el = $bindable()
    }: Props = $props()
    onMount(() => {
        if (focus) el?.focus()
    })
    const setType = (node) => {
        node.type = type
    }
    $effect(() => {
        if (value === '') status = ''
    })
</script>

<div class="input-wrapper">
    {#if title}
        <div>{title}</div>
    {/if}
    <div class="input-row" {style}>
        <input
            spellcheck="false"
            bind:value
            class="form-input"
            use:setType
            onchange={bubble('change')}
            bind:this={el}
            onblur={bubble('blur')}
            placeholder={placeholder ?? title.toUpperCase()}
            style={hideStatus ? 'border:none;' : '' + value === '' ? ' border: none;' : ''}
        />
        {#if !hideStatus}
            <div class={status + ' icon-wrapper'}>
                {#if status === 'wrong'}
                    <FaExclamationCircle />
                {:else if status === 'correct'}
                    <FaCheckCircle />
                {:else}
                    <FaRegCircle />
                {/if}
            </div>
        {/if}
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
    .icon-wrapper {
        height: 1.2rem;
        width: 1.2rem;
        margin: 0 0.5rem;
        display: flex;
        align-items: center;
        color: transparent;
        cursor: pointer;
    }
    .correct {
        color: rgb(16, 185, 129);
    }
    .wrong {
        color: rgb(239, 68, 68);
    }
    .form-input {
        display: flex;
        flex: 1;
        border: none;
        border-right: solid 1px gray;
        background-color: transparent;
        padding: 0.6rem 1rem;
    }
    input::placeholder {
        color: rgb(116, 116, 116);
        font-size: 0.8rem;
    }
</style>
