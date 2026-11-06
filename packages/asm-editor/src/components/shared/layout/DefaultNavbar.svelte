<script lang="ts">
    import Navbar from '#cmp/shared/layout/Navbar.svelte'
    import MainNavigationLinks from './MainNavigationLinks.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import FaStar from '~icons/fa-solid/star'
    import FaHeart from '~icons/fa-solid/heart'
    import FaBars from '~icons/fa-solid/bars'
    import FaTimes from '~icons/fa-solid/times'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import SparklesIcon from '../agent/SparklesIcon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { resolve } from '$app/paths'
    import { AI_FEATURES_ENABLED } from '#lib/Config.ts'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import { untrack } from 'svelte'
    import { page } from '$app/state'
    import { searchPalette } from '#cmp/search/paletteState.svelte.ts'

    interface Props {
        children?: import('svelte').Snippet
        /** Page-specific controls alongside the site's navigation links. */
        toolbar?: import('svelte').Snippet
        /** Keeps Home, Projects and Docs to leave room for page controls. */
        compact?: boolean
        exclude?: 'ai-chat'[]
        includeEmbed?: boolean
        /** Takes the AI Chat link's place, like a lecture's Ask AI toggle */
        aiToggle?: { open: boolean; label: string; title: string; onclick: () => void }
        /** The Sidebar's menu on a page that has one: phones get a button to toggle it */
        menuOpen?: boolean
        style?: string
    }

    let {
        children,
        toolbar,
        compact = false,
        exclude,
        includeEmbed = true,
        aiToggle,
        menuOpen = $bindable(),
        style
    }: Props = $props()

    const hasMenu = $derived(menuOpen !== undefined)
    /** A language's Documentation and the Courses have a search of their own in the sidebar,
     *  scoped to them, so the navbar's would be a second box doing nearly the same. */
    const pageHasSearch = $derived(
        page.route.id?.startsWith('/documentation/') || page.route.id?.startsWith('/learn/courses')
    )

    // the root layout mounts the site's search palette while a navbar is on the page
    // (untracked: the count is read to be raised, which would otherwise run this again forever)
    $effect(() => {
        untrack(() => searchPalette.navbars++)
        return () => untrack(() => searchPalette.navbars--)
    })
    /** Donate and Star read as text, with a surface only under the pointer, so a page's own
     *  action, like the home page's Create project, is the one filled button. */
    const QUIET =
        '--btn-color: transparent; --btn-text: color-mix(in srgb, var(--background-text) 70%, transparent); font-weight: 400'
</script>

<Navbar style={toolbar ? `flex-wrap: wrap; ${style ?? ''}` : style}>
    <MainNavigationLinks {includeEmbed} {compact} />
    {#if !compact && !pageHasSearch}
        <!-- searches every language's Documentation and every Course, from any page; centred in
             the bar where there is room, beside the buttons where there is not -->
        <div class="search">
            <SearchLauncher site placeholder="Search docs" />
        </div>
    {/if}
    {@render toolbar?.()}
    <!-- labels fold away before their buttons do, and the icons read on their own; the folded words
         stay for screen readers -->
    {#if !compact || children || aiToggle || hasMenu}
        <div class="actions" class:with-embed={includeEmbed} class:with-menu={hasMenu}>
            {#if !compact}
                <div class="pill donate">
                    <ButtonLink
                        cssVar="secondary"
                        href={resolve('/donate')}
                        style={QUIET}
                        {@attach tooltip('Donate to the project')}
                    >
                        <Icon>
                            <FaHeart />
                        </Icon>
                        <span class="label">Donate</span>
                    </ButtonLink>
                </div>
                <div class="pill star">
                    <ButtonLink
                        cssVar="secondary"
                        href="https://github.com/Specy/asm-editor"
                        target="_blank"
                        style={QUIET}
                        {@attach tooltip('Star the project on github')}
                    >
                        <Icon>
                            <FaStar />
                        </Icon>
                        <span class="label">Star on github</span>
                    </ButtonLink>
                </div>
            {/if}
            {@render children?.()}
            {#if AI_FEATURES_ENABLED && aiToggle}
                <button
                    type="button"
                    class="icon ai"
                    onclick={aiToggle.onclick}
                    {@attach tooltip(aiToggle.title)}
                >
                    {#if aiToggle.open}
                        <!-- an unplugin icon fills its parent, so it needs the sized box `Icon` gives
                         it; `SparklesIcon` carries its own 1em size. -->
                        <Icon size={1}>
                            <FaTimes />
                        </Icon>
                    {:else}
                        <SparklesIcon />
                    {/if}
                    <span class="label">{aiToggle.label}</span>
                </button>
            {:else if AI_FEATURES_ENABLED && !compact && !exclude?.includes('ai-chat')}
                <a class="icon ai" href={resolve('/chat')} {@attach tooltip('AI Chat')}>
                    <SparklesIcon />
                    <span class="label">AI Chat</span>
                </a>
            {/if}
            {#if hasMenu}
                <div class="menu">
                    <Icon
                        onClick={() => (menuOpen = !menuOpen)}
                        label={menuOpen ? 'Close the menu' : 'Open the menu'}
                    >
                        {#if menuOpen}
                            <FaTimes />
                        {:else}
                            <FaBars />
                        {/if}
                    </Icon>
                </div>
            {/if}
        </div>
    {/if}
</Navbar>

<style lang="scss">
    /* a folded button shrinks to a square around its icon, and keeps its words for screen readers */
    @mixin square {
        width: 2.2rem;
        padding: 0;
    }

    @mixin folded-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    @mixin folded-pill {
        :global(.btn) {
            @include square;
        }

        .label {
            @include folded-label;
        }
    }

    @mixin folded-ai {
        @include square;
        font-size: 1.2rem;

        .label {
            @include folded-label;
        }
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        &:hover {
            color: var(--accent);
        }
    }

    .pill :global(.btn) {
        gap: 0.5rem;
        height: 2.2rem;
        padding: 0 0.7rem;
    }

    .search {
        flex: none;
        width: 13rem;
    }

    @media (min-width: 1200px) {
        .search {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 18rem;
            transform: translate(-50%, -50%);
        }
    }

    .search :global(.search-launcher) {
        height: 2.2rem;
    }

    /* folded to its icon, like the buttons beside it */
    @mixin folded-search {
        .search {
            width: 2.2rem;
        }

        .search :global(.search-launcher) {
            justify-content: center;
            padding: 0;
        }

        .search :global(.placeholder),
        .search :global(kbd) {
            @include folded-label;
        }
    }

    @media (max-width: 1000px) {
        .search {
            width: 9.5rem;
        }

        .search :global(kbd) {
            display: none;
        }
    }

    @media (max-width: 860px) {
        @include folded-search;
    }

    .donate :global(svg) {
        color: #f472b6;
    }

    .ai {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        color: var(--accent);
        padding: 0.3rem 0.8rem;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        background-color: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    /* A toggle takes the AI Chat link's place and has to read as the same control, so the <button>
       sheds the defaults the <a> never carried. */
    button.ai {
        font: inherit;
        border: none;
        cursor: pointer;
    }

    .menu {
        display: none;
    }

    /* Each step comes where the main links would otherwise start hiding Embed (wide screens) or
       Blog (phones), with the earlier steps already taken. Leaving Embed out gives the wide steps
       more room; the menu button takes some from the phone ones. */
    @media (max-width: 780px) {
        .with-embed .donate {
            @include folded-pill;
        }
    }

    @media (max-width: 700px) {
        .donate {
            @include folded-pill;
        }
    }

    @media (max-width: 690px) {
        .with-embed .star {
            @include folded-pill;
        }
    }

    @media (max-width: 620px) {
        .star {
            @include folded-pill;
        }
    }

    @media (max-width: 600px) {
        .actions {
            gap: 0.4rem;
        }

        .icon,
        .ai {
            font-size: 0.9rem;
        }

        .menu {
            display: flex;
        }
    }

    @media (max-width: 475px) {
        .with-menu .ai {
            @include folded-ai;
        }
    }

    @media (max-width: 450px) {
        .ai {
            @include folded-ai;
        }
    }

    @media (max-width: 399px) {
        .with-menu .star {
            display: none;
        }
    }

    @media (max-width: 374px) {
        .star {
            display: none;
        }
    }

    @media (max-width: 359px) {
        .with-menu .ai {
            display: none;
        }
    }

    @media (max-width: 340px) {
        .ai {
            display: none;
        }
    }
</style>
