<script lang="ts">
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import { page } from '$app/stores'
    import FaBars from 'svelte-icons/fa/FaBars.svelte'

    import FuzzySearch from 'fuzzy-search'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { mipsInstructionNames } from '$lib/languages/MIPS/MIPS-documentation'
    import MenuLink from '../m68k/instruction/MenuLink.svelte'
    import InstructionsMenu from '../m68k/InstructionsMenu.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import { DEFAULT_THEME, ThemeStore, type ThemeKeys } from '$stores/themeStore.svelte'
    import { onDestroy, onMount, untrack } from 'svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let oldTheme = ThemeStore.getChosenTheme()

    onMount(() => {
        if (ThemeStore.meta.id !== DEFAULT_THEME.id) return //prefer the user's theme
        ThemeStore.select(LANGUAGE_THEMES.MIPS, true)
        return () => ThemeStore.select(oldTheme, true)
    })

    let { children }: Props = $props()

    let instructions = Array.from(mipsInstructionNames).sort((a, b) => a.localeCompare(b))
    let menuOpen = $state(false)
    let search = $state('')
    const searcher = new FuzzySearch(instructions, ['name', 'description'], {
        sort: true
    })
    let currentInstructionName = $derived($page.params.instructionName ?? '')
    let filteredInstructions = $derived(searcher.search(search.toLowerCase()))
</script>

<Navbar style="border-bottom-left-radius: 0;">
    <Row gap="0.6rem" align="center" flex1>
        <a class="icon" href="/" title="Go to the home">
            <img src="/favicon.png" alt="logo" />
        </a>
        <a class="icon" href="/projects" title="Go to your projects"> Projects </a>
        <a href="/documentation"> Docs </a>
        <a href="/learn/courses"> Learn </a>

        <a class="icon ai" href="/chat" title="AI Chat">
            <SparklesIcon />
            AI Chat
        </a>
        <div class="mobile-only" style="margin-left: auto; margin-right: 0.5rem">
            <Icon onClick={() => (menuOpen = !menuOpen)}>
                {#if menuOpen}
                    <FaTimes />
                {:else}
                    <FaBars />
                {/if}
            </Icon>
        </div>
    </Row>
</Navbar>

<Row gap="1rem" flex1>
    <button
        class="side-menu-underlay"
        class:side-menu-underlay-open={menuOpen}
        onclick={() => (menuOpen = false)}
    >
    </button>
    <aside class="side-menu column" class:menu-open={menuOpen}>
        <Column gap="1rem" padding="0 1rem">
            <MenuLink href="/documentation/mips" title="MIPS" onClick={() => (menuOpen = false)} />
            <MenuLink
                href="/documentation/mips/directive"
                title="Directives"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href="/documentation/mips/syscall"
                title="Syscalls"
                onClick={() => (menuOpen = false)}
            />
        </Column>
        <TogglableSection
            open={true}
            sectionStyle="margin-left: 0; padding-left: 0.5rem;"
            style="padding: 0 0.5rem;"
        >
            {#snippet title()}
                <h2 style="font-size: 1rem; font-weight: normal; margin-left: -0.1rem">
                    Instructions
                </h2>
            {/snippet}
            <input bind:value={search} placeholder="Search" class="instruction-search" />
            <InstructionsMenu
                hrefBase="/documentation/mips/instruction"
                instructions={filteredInstructions}
                onClick={() => (menuOpen = false)}
                {currentInstructionName}
            />
        </TogglableSection>
    </aside>

    <Column flex1 style="padding-top: 4rem;">
        {@render children?.()}
    </Column>
</Row>

<style lang="scss">
    .ai {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--accent);
        padding: 0.3rem 0.8rem;
        border-radius: 0.4rem;
        background-color: color-mix(in srgb, var(--accent) 10%, transparent);
        margin-left: auto;
    }

    .mobile-only {
        display: none;
    }

    @media (max-width: 600px) {
        .mobile-only {
            display: flex;
        }
        .ai {
            margin-left: unset;
            margin-right: auto;
        }
        .menu-open {
            transform: translateX(0);
        }
    }

    .instruction-search {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        padding: 0.6rem;
        border-radius: 0.4rem;
    }

    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        img {
            height: 100%;
        }

        &:hover {
            color: var(--accent);
        }
    }

</style>
