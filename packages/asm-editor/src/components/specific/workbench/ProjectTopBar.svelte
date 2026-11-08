<script lang="ts">
    import { resolve } from '$app/paths'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaBars from '~icons/fa-solid/bars'
    import FaHeart from '~icons/fa-solid/heart'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import './workbench.css'
    import ShareMenu from '#cmp/shared/menu/ShareMenu.svelte'
    import type { ShareStartAction } from '#lib/shareStart.ts'

    interface Props {
        phone?: boolean
        drawerOpen?: boolean
        onToggleMenu?: () => void
        onHome: () => void
        onBack: () => void
        onDonate: () => void
        onShare: (action?: ShareStartAction) => void
    }

    let {
        phone = false,
        drawerOpen = false,
        onToggleMenu,
        onHome,
        onBack,
        onDonate,
        onShare
    }: Props = $props()
</script>

<nav class="project-top-bar" class:phone aria-label="Project actions">
    {#if phone}
        <button
            type="button"
            class="action brand"
            {@attach tooltip(drawerOpen ? 'Close the menu' : 'Open the menu')}
            aria-label={drawerOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={drawerOpen}
            onclick={onToggleMenu}
        >
            <Icon size="lead"><FaBars /></Icon>
        </button>
    {:else}
        <a
            class="action brand"
            href={resolve('/')}
            {@attach tooltip('Go to the home page')}
            aria-label="Go to the home page"
            onclick={(event) => {
                if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                )
                    return
                event.preventDefault()
                onHome()
            }}
        >
            <img class="logo" src="/favicon.png" alt="ASM Editor" width="20" height="20" />
        </a>
    {/if}
    <button type="button" class="action back" title="Go back to your projects" onclick={onBack}>
        <Icon size="small"><FaAngleLeft /></Icon>
        <span class="label">Go back to your projects</span>
    </button>
    <button type="button" class="action donate" onclick={onDonate}>
        <Icon size="caption"><FaHeart /></Icon>
        Donate
    </button>
    <ShareMenu {onShare}>
        {#snippet trigger({ open, expanded })}
            <button
                type="button"
                class="action share"
                onclick={open}
                aria-haspopup="dialog"
                aria-expanded={expanded}
            >
                <Icon size="caption"><FaShareAlt /></Icon>
                Share
            </button>
        {/snippet}
    </ShareMenu>
</nav>

<style lang="scss">
    @use '../../../styles/focus.scss' as *;

    .project-top-bar {
        display: flex;
        align-items: stretch;
        flex: none;
        height: 2rem;
        padding: 0;
        border-bottom: 1px solid var(--wb-line);
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-size: 0.8rem;
    }

    .logo {
        display: block;
        width: 1.25rem;
        height: 1.25rem;
        object-fit: contain;
    }

    .phone {
        height: 2.5rem;
    }

    .phone .brand {
        width: calc(var(--wb-rail-width) + var(--wb-card-inset));
        border-right: 1px solid var(--wb-line);
    }

    /* the bar's own buttons, the logo among them: square cells the bar's whole height, edge to
       edge, which take the hover tint (D4) as a whole */
    .action {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.65rem;
        border: none;
        border-radius: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color var(--dur-fast);
        @include focus-ring($inset: true);

        &:hover {
            background-color: var(--hover-bg);
        }
    }

    /* the logo, or on a phone the menu: as wide as the rail under it */
    .brand {
        flex: none;
        justify-content: center;
        width: 2rem;
        padding: 0;
        text-decoration: none;
    }

    :global(.workbench[data-device='desktop']) .brand {
        width: calc(var(--wb-rail-width) + 2 * var(--wb-gap));
    }

    .back,
    .label {
        min-width: 0;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .donate,
    .share {
        flex: none;
    }

    .share {
        margin-left: auto;
    }
</style>
