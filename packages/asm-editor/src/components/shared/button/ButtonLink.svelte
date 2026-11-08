<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLAnchorAttributes } from 'svelte/elements'
    import {
        DEFAULT_BUTTON_VARIANT,
        dataColours,
        type ButtonKind,
        type ButtonSize,
        type ButtonVariant
    } from './buttonVariant.ts'

    /** A link drawn as a `Button`; the rest goes to the link, an attachment such as a Tooltip among them. */
    interface Props extends Omit<HTMLAnchorAttributes, 'color' | 'style' | 'href' | 'target'> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href: any
        target?: string
        /** Its role (buttonVariant.ts): `primary` when left out. */
        kind?: ButtonKind
        size?: ButtonSize
        disabled?: boolean
        /** A fill that is data, a language's accent or a theme's colour, in place of the role's. */
        bg?: string
        /** The text on `bg`. */
        color?: string
        style?: string
        /** Its look; the app-wide default when left out (buttonVariant.ts). */
        variant?: ButtonVariant
        /** A hairline edge round it, the `--line` of the surface it sits on. */
        bordered?: boolean
        children?: Snippet
        onClick?: (e: MouseEvent) => void
    }

    let {
        href,
        target = '',
        kind = 'primary',
        size = 'md',
        disabled = false,
        bg,
        color,
        style = '',
        variant = DEFAULT_BUTTON_VARIANT,
        bordered = false,
        class: className,
        onClick,
        children,
        ...rest
    }: Props = $props()
</script>

<a
    type="button"
    {...rest}
    class={['btn', variant, kind, size, className]}
    class:data-fill={bg !== undefined}
    class:data-text={color !== undefined}
    class:bordered
    class:disabled
    {href}
    {target}
    style={dataColours(bg, color, style)}
    onclick={(e) => {
        if (disabled) return e.preventDefault()
        if (onClick) onClick(e)
    }}
>
    {@render children?.()}
</a>

<style lang="scss">
    @use './variants.scss';

    .btn {
        @include variants.button('.disabled');
    }
</style>
