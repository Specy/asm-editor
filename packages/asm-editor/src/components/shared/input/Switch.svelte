<script lang="ts">
    /**
     * An on/off control that slides rather than ticks: the track takes the accent color and the
     * knob crosses it. A button with the switch role, so it is focusable and toggles with Space and
     * Enter like a native checkbox, and the label around it stays free to be plain text. Its
     * `size` is the room it sits in: `md`, a form's or a Settings row's; `sm`, a Popover's rows
     * (the share menu); `xs`, a side panel's dense rows (the Search panel's Look in).
     */
    import type { HTMLButtonAttributes } from 'svelte/elements'

    /** The rest goes to the button, an attachment such as a Tooltip among them. */
    interface Props extends Omit<HTMLButtonAttributes, 'disabled' | 'style' | 'onchange'> {
        checked: boolean
        disabled?: boolean
        size?: 'xs' | 'sm' | 'md'
        style?: string
        onChange?: (checked: boolean) => void
    }

    let {
        checked = $bindable(false),
        disabled = false,
        size = 'md',
        style = '',
        onChange,
        ...rest
    }: Props = $props()

    function toggle() {
        if (disabled) return
        checked = !checked
        onChange?.(checked)
    }
</script>

<button
    type="button"
    {...rest}
    role="switch"
    aria-checked={checked}
    class="switch {size}"
    class:on={checked}
    {disabled}
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
            background-color var(--dur-fast) ease,
            border-color var(--dur-fast) ease;
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
    .switch.sm {
        --switch-width: 2.2rem;
        --switch-height: 1.2rem;
    }
    .switch.xs {
        --switch-width: 1.9rem;
        --switch-height: 1.05rem;
        --switch-padding: 0.15rem;
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
            transform var(--dur-fast) cubic-bezier(0.4, 0, 0.2, 1),
            background-color var(--dur-fast) ease;
    }
    .on {
        background-color: var(--accent);
        border-color: var(--accent);
        .knob {
            background-color: var(--accent-text);
            transform: translateX(calc(var(--switch-width) - var(--switch-height)));
        }
    }
</style>
