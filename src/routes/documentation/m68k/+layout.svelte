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
