<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'
    import {
        DEFAULT_BUTTON_VARIANT,
        dataColours,
        type ButtonKind,
        type ButtonSize,
        type ButtonVariant
    } from './buttonVariant.ts'

    /** The rest goes to the button, an attachment such as a Tooltip among them. */
    interface Props extends Omit<HTMLButtonAttributes, 'color' | 'style' | 'disabled'> {
        /** Its role (buttonVariant.ts): `primary` when left out. */
        kind?: ButtonKind
        size?: ButtonSize
        disabled?: boolean
        /** A fill that is data, a language's accent or a theme's colour, in place of the role's. */
        bg?: string
        /** The text on `bg`. */
        color?: string
        style?: string
        /** On, as a toggle that is pressed: filled with the accent, whatever its role. */
        active?: boolean
        /** Its look; the app-wide default when left out (buttonVariant.ts). */
        variant?: ButtonVariant
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
        variant = DEFAULT_BUTTON_VARIANT,
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
    class={['btn', variant, kind, size, className]}
    class:data-fill={bg !== undefined}
    class:data-text={color !== undefined}
    class:bordered
    class:active
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
