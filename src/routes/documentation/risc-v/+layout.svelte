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
    import MenuLink from '../m68k/instruction/MenuLink.svelte'
    import InstructionsMenu from '../m68k/InstructionsMenu.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import { DEFAULT_THEME, ThemeStore, type ThemeKeys } from '$stores/themeStore.svelte'
    import { onDestroy, onMount, untrack } from 'svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { riscvInstructionNames, riscvInstructionMap} from '$lib/languages/RISC-V/RISC-V-documentation'
    import Sidebar from '$cmp/shared/layout/Sidebar.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let oldTheme = ThemeStore.getChosenTheme()

    onMount(() => {
        if (ThemeStore.meta.id !== DEFAULT_THEME.id) return //prefer the user's theme
        ThemeStore.select(LANGUAGE_THEMES['RISC-V'], true)
        return () => ThemeStore.select(oldTheme, true)
    })

    let { children }: Props = $props()

    let instructionNames = Array.from(riscvInstructionNames).sort((a, b) => a.localeCompare(b))
    let instructions = instructionNames.map(name => riscvInstructionMap.get(name)[0])
    let menuOpen = $state(false)
    let search = $state('')
    const searcher = new FuzzySearch(instructions, ['name', 'description'], {
        sort: true
    })
    let currentInstructionName = $derived($page.params.instructionName ?? '')
    let filteredInstructions = $derived([...new Set(searcher.search(search.toLowerCase()).map(i => i.name))])
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
            <div class="hidden-very-small">
                <SparklesIcon />
            </div>
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

<Sidebar bind:menuOpen>
    <Column gap="1rem" padding="0 1rem">
        <MenuLink href="/documentation/risc-v" title="RISC-V" onClick={() => (menuOpen = false)} />
        <MenuLink
            href="/documentation/risc-v/directive"
            title="Directives"
            onClick={() => (menuOpen = false)}
        />
        <MenuLink
            href="/documentation/risc-v/syscall"
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
            <h2 style="font-size: 1rem; font-weight: normal; margin-left: -0.1rem">Instructions</h2>
        {/snippet}
        <input bind:value={search} placeholder="Search" class="instruction-search" />
        <InstructionsMenu
            hrefBase="/documentation/risc-v/instruction"
            instructions={filteredInstructions}
            onClick={() => (menuOpen = false)}
            {currentInstructionName}
        />
    </TogglableSection>

    {#snippet content()}
        <Column flex1 style="padding-top: 4rem;">
            {@render children?.()}
        </Column>
    {/snippet}
</Sidebar>

<style lang="scss">
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

    .ai {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--accent);
        padding: 0.3rem 0.8rem;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
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
            font-size: 0.9rem;
            margin-left: unset;
            margin-right: auto;
        }
        .icon {
            font-size: 0.9rem;
        }
    }

    .hidden-very-small {
        display: flex;
    }
    @media (max-width: 370px) {
        .hidden-very-small {
            display: none;
        }
    }
</style>
