<script lang="ts">
    import { resolve } from '$app/paths'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
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
        <span class="brand">
            <IconButton
                size="lg"
                label={drawerOpen ? 'Close the menu' : 'Open the menu'}
                {@attach tooltip(drawerOpen ? 'Close the menu' : 'Open the menu')}
                aria-expanded={drawerOpen}
                onClick={onToggleMenu}
            >
                <Icon size={1.2}><FaBars /></Icon>
            </IconButton>
        </span>
    {:else}
        <span class="brand">
            <a
                class="home"
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
        </span>
    {/if}
    <Button
        kind="ghost"
        size="sm"
        class="action back"
        title="Go back to your projects"
        onClick={onBack}
    >
        <Icon size={0.8}><FaAngleLeft /></Icon>
        <span class="label">Go back to your projects</span>
    </Button>
    <Button kind="ghost" size="sm" class="action donate" onClick={onDonate}>
        <Icon size={0.7}><FaHeart /></Icon>
        Donate
    </Button>
    <ShareMenu {onShare}>
        {#snippet trigger({ open, expanded })}
            <Button
                kind="ghost"
                size="sm"
                class="action share"
                onClick={open}
                aria-haspopup="dialog"
                aria-expanded={expanded}
            >
                <Icon size={0.75}><FaShareAlt /></Icon>
                Share
            </Button>
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
        padding-right: 0.15rem;
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

    /* the logo, or on a phone the menu: a cell of the bar, the rail's width, with the button in
       its middle, as the bar's other buttons are */
    .brand {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 2rem;
    }

    :global(.workbench[data-device='desktop']) .brand {
        width: calc(var(--wb-rail-width) + 2 * var(--wb-gap));
    }

    /* the home page's link, drawn as a medium IconButton is (a link, so not one) */
    .home {
        display: grid;
        place-items: center;
        width: 1.8rem;
        height: 1.8rem;
        border-radius: var(--r-control);
        color: inherit;
        text-decoration: none;
        transition: background-color var(--dur-fast);
        @include focus-ring($inset: true);

        &:hover {
            background-color: var(--hover-bg);
        }
    }

    /* the bar's own buttons, small ghosts (D5) in the middle of its height, in the bar's own size
       and weight of text and about its old room at their sides, which a phone's bar has just the
       room for */
    .project-top-bar :global(.action) {
        align-self: center;
        gap: 0.35rem;
        padding-inline: 0.55rem;
        font-size: inherit;
        font-weight: inherit;
    }

    .project-top-bar :global(.back),
    .label {
        min-width: 0;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .project-top-bar :global(.donate),
    .project-top-bar :global(.share) {
        flex: none;
    }

    .project-top-bar :global(.share) {
        margin-left: auto;
    }
</style>
