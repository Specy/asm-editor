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
        /** Its field's id, for a `<label for>` beside it. */
        id?: string
        title?: string
        disabled?: boolean
        /**
         * Brings a number typed, or stepped to with − or +, onto the values the field takes; a
         * whole number of `step`s when left out. What is not a number puts the field back.
         */
        snap?: (next: number) => number
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
        id,
        title,
        disabled = false,
        snap = (next: number) => Math.round(next / step) * step,
        onchange,
        el = $bindable()
    }: Props = $props()

    /** `next` snapped and within the limits; what was there for no number at all. */
    function within(next: number) {
        const snapped = Number.isFinite(next) ? snap(next) : Number.NaN
        if (!Number.isFinite(snapped)) return value
        return Math.min(max, Math.max(min, snapped))
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
        {id}
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
            //a number its snap refuses is never the value, so leaving the field puts back the last
            if (Number.isFinite(typed) && Number.isFinite(snap(typed))) value = typed
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
            width: var(--fs-micro);
            height: var(--fs-micro);
        }
        &:hover:not(:disabled) {
            background: color-mix(in srgb, currentColor 12%, transparent);
        }
        &:disabled {
            opacity: 0.5;
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
