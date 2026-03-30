<script lang="ts">
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import { M68KUncompoundedInstructions } from '$lib/languages/M68K/M68K-documentation'
    import InstructionsMenu from './InstructionsMenu.svelte'
    import { page } from '$app/stores'
    import FaBars from 'svelte-icons/fa/FaBars.svelte'

    import FuzzySearch from 'fuzzy-search'
    import MenuLink from './instruction/MenuLink.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Sidebar from '$cmp/shared/layout/Sidebar.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'

    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    let instructions = Array.from(M68KUncompoundedInstructions.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
    )
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

<Sidebar bind:menuOpen>
    <Column gap="1rem" padding="0 1rem">
        <MenuLink href="/documentation/m68k" title="M68K" onClick={() => (menuOpen = false)} />
        <MenuLink
            href="/documentation/m68k/addressing-mode"
            title="Addressing Modes"
            onClick={() => (menuOpen = false)}
        />
        <MenuLink
            href="/documentation/m68k/condition-codes"
            title="Condition Codes"
            onClick={() => (menuOpen = false)}
        />
        <MenuLink
            href="/documentation/m68k/shift-direction"
            title="Shifts & directions"
            onClick={() => (menuOpen = false)}
        />
        <MenuLink
            href="/documentation/m68k/directive"
            title="Directives"
            onClick={() => (menuOpen = false)}
        />
        <MenuLink
            href="/documentation/m68k/assembler-features"
            title="Assembler features"
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
            instructions={filteredInstructions.map((ins) => ins.name)}
            hrefBase="/documentation/m68k/instruction"
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
        .menu-open {
            transform: translateX(0);
        }
        .icon {
            font-size: 0.9rem;
        }
    }
</style>
