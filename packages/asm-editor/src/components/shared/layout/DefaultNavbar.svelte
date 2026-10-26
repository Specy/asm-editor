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

    interface Props {
        children?: import('svelte').Snippet
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
        exclude,
        includeEmbed = true,
        aiToggle,
        menuOpen = $bindable(),
        style
    }: Props = $props()

    const hasMenu = $derived(menuOpen !== undefined)
</script>

<Navbar {style}>
    <MainNavigationLinks {includeEmbed} />
    <!-- labels fold away before their buttons do, and the icons read on their own; the folded words
         stay for screen readers -->
    <div class="actions" class:with-embed={includeEmbed} class:with-menu={hasMenu}>
        <div class="pill donate">
            <ButtonLink
                cssVar="secondary"
                href={resolve('/donate')}
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
                {@attach tooltip('Star the project on github')}
            >
                <Icon>
                    <FaStar />
                </Icon>
                <span class="label">Star on github</span>
            </ButtonLink>
        </div>
        {@render children?.()}
        {#if aiToggle}
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
        {:else if !exclude?.includes('ai-chat')}
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
        padding: 0 1rem;
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
