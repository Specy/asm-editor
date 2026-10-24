<script lang="ts">
    import type { ThemeKeys } from '#stores/themeStore.svelte.ts'
    import { DEFAULT_BUTTON_VARIANT, isSurfaceButton, type ButtonVariant } from './buttonVariant.ts'

    interface Props {
        disabled?: boolean
        color?: string
        style?: string
        bg?: string
        hasIcon?: boolean
        cssVar?: ThemeKeys | 'unset'
        active?: boolean
        /** Its look; the app-wide default when left out (buttonVariant.ts). */
        variant?: ButtonVariant
        /** Whether the `workbench` look draws a card's edge around it. */
        bordered?: boolean
        title?: string
        children?: import('svelte').Snippet
        onClick?: (e: MouseEvent) => void
    }

    let {
        disabled = false,
        color = 'var(--accent-text)',
        style = '',
        bg = 'var(--accent)',
        hasIcon = false,
        cssVar = 'unset',
        active = false,
        variant = DEFAULT_BUTTON_VARIANT,
        bordered = false,
        title = '',
        onClick,
        children
    }: Props = $props()

    const surface = $derived(isSurfaceButton(cssVar, bg))
</script>

<button
    type="button"
    class="btn {variant}"
    class:surface
    class:bordered
    class:hasIcon
    {title}
    style={`--btn-color:var(--${cssVar},${bg}); --btn-text:var(--${cssVar}-text,${color});${style}; `}
    {disabled}
    onclick={onClick}
    class:active
>
    {@render children?.()}
</button>

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
        font-family: Rubik;
        position: relative;
        cursor: pointer;

        @include variants.workbench(':disabled');
    }

    .active {
        background-color: var(--accent);
        color: var(--accent-text);
    }

    .btn:hover {
        filter: brightness(1.2);
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn:disabled:hover {
        filter: none !important;
    }

    .hasIcon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.35rem 0.8rem;
    }
</style>
