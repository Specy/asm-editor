<script lang="ts">
    /**
     * A whole number with − and + on either side of it, drawn as one control rather than a field
     * with the browser's own arrows. The field is still a number field, so the arrow keys step it
     * and a phone shows its number keys. What is typed is the value as it is typed, so a form can
     * say at once why it will not do; once it is committed, by leaving the field or Enter, and at
     * every press of − or +, it is brought within `min` and `max` and handed to `onchange`.
     */
    import FaMinus from '~icons/fa-solid/minus'
    import FaPlus from '~icons/fa-solid/plus'

    interface Props {
        value: number
        min?: number
        max?: number
        step?: number
        /** Names the number, its field's label, and its buttons' as "Less" and "More" of it. */
        ariaLabel: string
        title?: string
        disabled?: boolean
        /** Each value it settles on: a press of − or +, or what was typed once committed. */
        onchange?: (value: number) => void
        el?: HTMLInputElement
    }

    let {
        value = $bindable(),
        min = -Infinity,
        max = Infinity,
        step = 1,
        ariaLabel,
        title,
        disabled = false,
        onchange,
        el = $bindable()
    }: Props = $props()

    /** `next` as a whole number of steps within the limits; what was there for no number at all. */
    function within(next: number) {
        if (!Number.isFinite(next)) return value
        return Math.min(max, Math.max(min, Math.round(next / step) * step))
    }

    function settle(next: number) {
        const settled = within(next)
        value = settled
        //the field shows what it settled on, a number typed past the limits too
        if (el) el.value = String(settled)
        onchange?.(settled)
    }
</script>

<!-- the field first, so that a label around the stepper is its field's, and not −'s: a label's
     control is its first labelable element, which is hovered and clicked with the label; − is
     drawn before it all the same -->
<div class="stepper" class:disabled {title}>
    <input
        type="number"
        {min}
        {max}
        {step}
        aria-label={ariaLabel}
        {disabled}
        {value}
        bind:this={el}
        oninput={(event) => {
            const typed = event.currentTarget.valueAsNumber
            if (Number.isFinite(typed)) value = typed
        }}
        onchange={(event) => settle(event.currentTarget.valueAsNumber)}
    />
    <button
        type="button"
        class="step less"
        tabindex="-1"
        aria-label="Less {ariaLabel}"
        disabled={disabled || value <= min}
        onclick={() => settle(value - step)}><FaMinus /></button
    >
    <button
        type="button"
        class="step"
        tabindex="-1"
        aria-label="More {ariaLabel}"
        disabled={disabled || value >= max}
        onclick={() => settle(value + step)}><FaPlus /></button
    >
</div>

<style lang="scss">
    /* one control: the field and its buttons inside one rounded box, which a host whose own
       surface is --primary recolours to its fields' */
    .stepper {
        display: inline-flex;
        align-items: stretch;
        height: 1.75rem;
        border-radius: 0.35rem;
        background: var(--stepper-background, var(--primary));
        color: var(--stepper-text, var(--primary-text));
        overflow: hidden;

        /* ringed while the number is typed into, not after a press of − or + */
        &:has(input:focus-visible) {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        &.disabled {
            opacity: 0.5;
        }
    }
    .step {
        display: grid;
        place-items: center;
        width: 1.6rem;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;

        :global(svg) {
            width: 0.55rem;
            height: 0.55rem;
        }
        &:hover:not(:disabled) {
            background: color-mix(in srgb, currentColor 12%, transparent);
        }
        &:disabled {
            opacity: 0.35;
            cursor: default;
        }
    }
    .less {
        order: -1;
    }
    input {
        width: 3.2rem;
        min-width: 0;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        font-variant-numeric: tabular-nums;
        text-align: center;
        outline: none;
        /* without the browser's own arrows, which − and + stand in for */
        appearance: textfield;
        -moz-appearance: textfield;

        &::-webkit-inner-spin-button,
        &::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
    }
</style>
