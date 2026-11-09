<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLAnchorAttributes } from 'svelte/elements'
    import {
        DEFAULT_BUTTON_VARIANT,
        dataColours,
        type ButtonKind,
        type ButtonSize
    } from './buttonVariant.ts'

    /**
     * A link drawn as a `Button`; the rest goes to the link, an attachment such as a Tooltip among
     * them. Disabled, it is a link without a destination, as a disabled button is out of reach: no
     * `href`, so the keyboard passes it by and no click opens it, and `aria-disabled` to say so.
     */
    interface Props extends Omit<HTMLAnchorAttributes, 'color' | 'style' | 'href' | 'target'> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        href: any
        target?: string
        /** Its role (buttonVariant.ts): `primary` when left out. */
        kind?: ButtonKind
        size?: ButtonSize
        /** Out of reach: drawn as a disabled Button and announced as a disabled link. */
        disabled?: boolean
        /** A fill that is data, a language's accent or a theme's colour, in place of the role's. */
        bg?: string
        /** The text on `bg`. */
        color?: string
        style?: string
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
        bordered = false,
        class: className,
        onClick,
        children,
        ...rest
    }: Props = $props()
</script>

<a
    {...rest}
    class={['btn', DEFAULT_BUTTON_VARIANT, kind, size, className]}
    class:data-fill={bg !== undefined}
    class:data-text={color !== undefined}
    class:bordered
    class:disabled
    href={disabled ? undefined : href}
    target={disabled ? undefined : target}
    role={disabled ? 'link' : undefined}
    aria-disabled={disabled ? 'true' : undefined}
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
