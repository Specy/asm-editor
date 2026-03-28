<script lang="ts">
    interface Props {
        options?: any
        value?: string
        style?: string
        title?: string
        disabled?: any
        wrapperStyle?: string
        onChange?: (e: Event) => void
    }

    let {
        options = [],
        value = $bindable(''),
        style = '',
        title = '',
        wrapperStyle = '',
        disabled = [],
        onChange = () => {}
    }: Props = $props()
</script>

<div class="wrapper" style={wrapperStyle}>
    <div>{title}</div>
    <select
        onchange={onChange}
        bind:value
        style={style}
    >
        {#each options as option, i}
            <option value={option} disabled={disabled[i] !== undefined}>
                {option}
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
