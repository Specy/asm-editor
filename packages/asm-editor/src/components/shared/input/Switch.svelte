<script lang="ts">
    /**
     * An on/off control that slides rather than ticks: the track takes the accent color and the
     * knob crosses it. A button with the switch role, so it is focusable and toggles with Space and
     * Enter like a native checkbox, and the label around it stays free to be plain text.
     */
    interface Props {
        checked: boolean
        disabled?: boolean
        title?: string
        style?: string
        onChange?: (checked: boolean) => void
    }

    let {
        checked = $bindable(false),
        disabled = false,
        title = undefined,
        style = '',
        onChange
    }: Props = $props()

    function toggle() {
        if (disabled) return
        checked = !checked
        onChange?.(checked)
    }
</script>

<button
    type="button"
    role="switch"
    aria-checked={checked}
    class="switch"
    class:on={checked}
    {disabled}
    {title}
    {style}
    onclick={toggle}
>
    <span class="knob"></span>
</button>

<style lang="scss">
    /* a 1px edge, so that a switch that is off still reads as one against what it sits on */
    .switch {
        --switch-width: 2.8rem;
        --switch-height: 1.5rem;
        --switch-padding: 0.2rem;
        --switch-border: 1px;
        position: relative;
        flex: none;
        width: var(--switch-width);
        height: var(--switch-height);
        padding: var(--switch-padding);
        border: var(--switch-border) solid var(--tertiary);
        border-radius: var(--switch-height);
        background-color: var(--secondary);
        cursor: pointer;
        transition:
            background-color 0.2s ease,
            border-color 0.2s ease;
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
    /* exactly the room inside the padding and the edge, so it sits centred, and its travel when on,
       the width less the height, is the same as without the edge */
    .knob {
        display: block;
        width: calc(var(--switch-height) - 2 * var(--switch-padding) - 2 * var(--switch-border));
        height: calc(var(--switch-height) - 2 * var(--switch-padding) - 2 * var(--switch-border));
        border-radius: 50%;
        background-color: var(--secondary-text);
        transform: translateX(0);
        transition:
            transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
            background-color 0.2s ease;
    }
    .on {
        background-color: var(--accent);
        border-color: var(--accent);
        .knob {
            background-color: var(--accent-text);
            transform: translateX(calc(var(--switch-width) - var(--switch-height)));
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .switch,
        .knob {
            transition: none;
        }
    }
</style>
