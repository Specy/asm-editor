<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'
    import {
        DEFAULT_BUTTON_VARIANT,
        dataColours,
        type ButtonKind,
        type ButtonSize
    } from './buttonVariant.ts'

    /**
     * The rest goes to the button, an attachment such as a Tooltip among them. An icon beside its
     * words takes the size's gap (`--btn-gap`, variants.scss) and, when it is the button's own
     * child rather than in an `<Icon>`, the size of the words.
     */
    interface Props extends Omit<
        HTMLButtonAttributes,
        'color' | 'style' | 'disabled' | 'aria-pressed'
    > {
        /** Its role (buttonVariant.ts): `primary` when left out. */
        kind?: ButtonKind
        size?: ButtonSize
        disabled?: boolean
        /** A fill that is data, a language's accent or a theme's colour, in place of the role's. */
        bg?: string
        /** The text on `bg`. */
        color?: string
        style?: string
        /**
         * Filled with the accent, whatever its role, for a state it shows rather than one it
         * toggles, such as the row being edited; `pressed` is a toggle's.
         */
        active?: boolean
        /**
         * A toggle, on or off: filled with the accent while on, as `active` is, and announced as
         * pressed or not (`aria-pressed`); left out, a plain button.
         */
        pressed?: boolean
        /** A hairline edge round it, the `--line` of the surface it sits on. */
        bordered?: boolean
        children?: Snippet
        onClick?: (e: MouseEvent) => void
    }

    let {
        kind = 'primary',
        size = 'md',
        disabled = false,
        bg,
        color,
        style = '',
        active = false,
        pressed,
        bordered = false,
        class: className,
        onClick,
        children,
        ...rest
    }: Props = $props()
</script>

<button
    type="button"
    {...rest}
    class={['btn', DEFAULT_BUTTON_VARIANT, kind, size, className]}
    class:data-fill={bg !== undefined}
    class:data-text={color !== undefined}
    class:bordered
    class:active={active || pressed}
    aria-pressed={pressed}
    style={dataColours(bg, color, style)}
    {disabled}
    onclick={onClick}
>
    {@render children?.()}
</button>

<style lang="scss">
    @use './variants.scss';

    .btn {
        font-family: var(--font-ui);
        @include variants.button(':disabled');
    }
</style>
