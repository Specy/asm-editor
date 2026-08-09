<script lang="ts" generics="T">
    type SelectOption = {
        key: string | number
        value: T
        disabled?: boolean
    }

    interface Props {
        options: SelectOption[]
        value: T
        style?: string
        title?: string
        wrapperStyle?: string
        onChange?: (value: T) => void
    }

    let {
        options,
        value = $bindable(),
        style = '',
        title = '',
        wrapperStyle = '',
        onChange
    }: Props = $props()

    function handleChange(event: Event) {
        const select = event.currentTarget as HTMLSelectElement
        const selected = options[select.selectedIndex]
        if (!selected) return
        value = selected.value
        onChange?.(selected.value)
    }
</script>

<div class="wrapper" style={wrapperStyle}>
    <div>{title}</div>
    <select onchange={handleChange} bind:value {style}>
        {#each options as option (option.key)}
            <option value={option.value} disabled={option.disabled}>
                {option.key}
            </option>
        {/each}
    </select>
</div>

<style lang="scss">
    select {
        display: flex;
        align-items: center;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        padding: 0.7rem 1.4rem 0.7rem 1rem;
        -moz-appearance: none;
        -webkit-appearance: none;
        appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg fill='rgb(219, 219, 219)' height='28' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
        background-repeat: no-repeat;
        background-position-x: 100%;
        background-position-y: 5px;
    }
    .wrapper {
        display: flex;
        flex-direction: column;
    }
</style>
