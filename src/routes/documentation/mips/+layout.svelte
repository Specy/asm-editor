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
    <Row gap="1rem" align="center" flex1>
        <a class="icon" href="/" title="Go to the home">
            <img src="/favicon.png" alt="logo" />
        </a>
        <a class="icon" href="/projects" title="Go to your projects"> Projects </a>
        <a href="/documentation"> Docs </a>
        <a href="/learn/courses"> Learn </a>

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
    .side-menu {
        background-color: var(--secondary);
        color: var(--secondary-text);
        width: 15rem;
        gap: 1rem;
        top: 3.2rem;
        padding-top: 1rem;
        height: calc(100vh - 3.2rem);
        overflow-y: auto;
        position: sticky;
    }

    .mobile-only {
        display: none;
    }

    @media (max-width: 600px) {
        .side-menu {
            position: fixed;
            width: calc(100vw - 4rem);
            left: 0;
            z-index: 5;
            transition: transform 0.3s;
            background-color: rgba(var(--RGB-secondary), 0.9);
            transform: translateX(calc((100vw - 4rem) * -1));
        }
        .mobile-only {
            display: flex;
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

    .side-menu-underlay {
        position: fixed;
        top: 3.2rem;
        left: 0;
        width: 100vw;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        opacity: 0;
        pointer-events: none;
        cursor: pointer;
        z-index: 3;
        transition: opacity 0.3s;
        backdrop-filter: blur(0.2rem);
    }

    .side-menu-underlay-open {
        opacity: 1;
        pointer-events: all;
    }
</style>
