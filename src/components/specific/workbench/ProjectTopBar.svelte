<script lang="ts">
    import { resolve } from '$app/paths'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaBars from '~icons/fa-solid/bars'
    import FaHeart from '~icons/fa-solid/heart'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import './workbench.css'

    interface Props {
        phone?: boolean
        drawerOpen?: boolean
        onToggleMenu?: () => void
        onHome: () => void
        onBack: () => void
        onDonate: () => void
        onShare: () => void
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
            title={drawerOpen ? 'Close the menu' : 'Open the menu'}
            aria-label={drawerOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={drawerOpen}
            onclick={onToggleMenu}
        >
            <Icon size={1.2}><FaBars /></Icon>
        </button>
    {:else}
        <a
            class="action brand"
            href={resolve('/', {})}
            title="Go to the home page"
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
        <Icon size={0.8}><FaAngleLeft /></Icon>
        <span class="label">Go back to your projects</span>
    </button>
    <button type="button" class="action donate" onclick={onDonate}>
        <Icon size={0.7}><FaHeart /></Icon>
        Donate
    </button>
    <button type="button" class="action share" onclick={onShare}>
        <Icon size={0.75}><FaShareAlt /></Icon>
        Share
    </button>
</nav>

<style>
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
        width: 2.5rem;
    }

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
        transition:
            background-color 0.15s ease,
            color 0.15s ease;
    }

    .brand {
        flex: none;
        justify-content: center;
        width: 2rem;
        padding: 0;
        text-decoration: none;
    }

    .action:hover {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    .action:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
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

    @media (prefers-reduced-motion: reduce) {
        .action {
            transition: none;
        }
    }
</style>
