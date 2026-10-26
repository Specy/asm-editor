<script>
    import { DEFAULT_BUTTON_VARIANT, isSurfaceButton } from './buttonVariant.ts'

    /** The rest goes to the link, an attachment such as a Tooltip among them. */
    /** @type {{ target?: string, href: any, color?: string, style?: string, bg?: string, onClick?: (e: MouseEvent) => void , hasIcon?: boolean, cssVar?: string, disabled?: boolean, variant?: import('./buttonVariant.ts').ButtonVariant, bordered?: boolean, children?: import('svelte').Snippet} & Omit<import('svelte/elements').HTMLAnchorAttributes, 'color' | 'style' | 'href' | 'target'>} */
    let {
        href,
        disabled = false,
        color = 'var(--accent-text)',
        target = '',
        style = '',
        bg = 'var(--accent)',
        hasIcon = false,
        cssVar = 'unset',
        variant = DEFAULT_BUTTON_VARIANT,
        bordered = false,
        onClick,
        children,
        ...rest
    } = $props()

    const surface = $derived(isSurfaceButton(cssVar, bg))
</script>

<a
    type="button"
    {...rest}
    class="btn {variant}"
    class:surface
    class:bordered
    class:disabled
    class:hasIcon
    {href}
    {target}
    style={`--btn-color:var(--${cssVar},${bg}); --btn-text:var(--${cssVar}-text,${color});${style}; `}
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
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        color: var(--btn-text, --accent-text);
        background-color: var(--btn-color, --accent);
        text-align: center;
        display: flex;
        transition: all 0.3s;
        font-size: 1rem;
        align-items: center;
        justify-content: center;
        border: none;
        width: fit-content;
        user-select: none;
        position: relative;
        cursor: pointer;

        @include variants.workbench('.disabled');
    }

    .btn:hover {
        filter: brightness(1.2);
    }

    .disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .disabled:hover {
        filter: none !important;
    }

    .hasIcon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.35rem 0.8rem;
    }
</style>
