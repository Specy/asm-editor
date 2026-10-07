<script lang="ts">
    import { onMount } from 'svelte'
    import SearchLauncher from '$cmp/search/SearchLauncher.svelte'
    import SearchPalette from '$cmp/search/SearchPalette.svelte'
    import { languageScope } from '$lib/search/scope'
    import { searchClient } from '$lib/search/searchClient.svelte'
    import Navbar from '$cmp/shared/layout/Navbar.svelte'
    import TogglableSection from '$cmp/shared/layout/TogglableSection.svelte'
    import { page } from '$app/stores'
    import FaBars from '~icons/fa-solid/bars'

    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import Row from '$cmp/shared/layout/Row.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MenuLink from '$cmp/documentation/site/MenuLink.svelte'
    import InstructionsMenu from '$cmp/documentation/site/InstructionsMenu.svelte'
    import { LANGUAGE_THEMES } from '$lib/Config'
    import ThemeScope from '$cmp/shared/providers/ThemeScope.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { x86DocumentedInstructions } from '$lib/languages/X86/X86-documentation'
    import Sidebar from '$cmp/shared/layout/Sidebar.svelte'
    import { resolve } from '$app/paths'
    import ButtonLink from '$cmp/shared/button/ButtonLink.svelte'
    import { ProjectStore } from '$stores/projectsStore.svelte'
    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    // The sidebar lists the integer instruction set, the same set that has pages. Search matches
    // the one line summary as well as the name, so typing "rotate" finds `rol` and `rcl`.
    let instructions = x86DocumentedInstructions.map((instruction) => ({
        name: instruction.name,
        description: instruction.summary
    }))
    let menuOpen = $state(false)
    let currentInstructionName = $derived($page.params.instructionName ?? '')
    const instructionNames = [...new Set(instructions.map((instruction) => instruction.name))]

    // The palette, its two boxes and Ctrl+K: this language's Documentation, its Course and the
    // General course ([the design record](../../../../docs/design/documentation-search.md))
    const scope = languageScope('x86')
    onMount(() => searchClient.preload(scope))
</script>

<ThemeScope theme={LANGUAGE_THEMES.X86}>
    <Navbar style="border-bottom-left-radius: 0;">
        <Row gap="0.6rem" align="center" flex1>
            <a class="icon" href={resolve('/', {})} title="Go to the home">
                <img src="/favicon.png" alt="logo" />
            </a>
            <a class="icon" href={resolve('/projects', {})} title="Go to your projects">
                Projects
            </a>

            <a href={resolve('/documentation', {})}> Docs </a>
            <a href={resolve('/learn/courses', {})}> Learn </a>
            <a class="icon ai" href={resolve('/chat', {})} title="AI Chat">
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
        <Column gap="1rem" style="overflow-y: auto;">
            <Column gap="1rem" padding="0 1rem">
                <SearchLauncher placeholder="Search the x86 docs and courses" />
                <MenuLink
                    href="/documentation/x86"
                    title="x86"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href="/documentation/x86/directive"
                    title="Directives"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href="/documentation/x86/registers"
                    title="Registers & Flags"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href="/documentation/x86/syscall"
                    title="Syscalls"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href="/documentation/x86/using-c"
                    title="Using C and C++"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href="/documentation/x86/all"
                    title="Complete documentation"
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
                <InstructionsMenu
                    hrefBase="/documentation/x86/instruction"
                    instructions={instructionNames}
                    onClick={() => (menuOpen = false)}
                    {currentInstructionName}
                />
            </TogglableSection>
        </Column>

        <Column style="margin-top: auto;" padding="0.5rem">
            <ButtonLink
                style="width: 100%;"
                href={ProjectStore.projects.length > 0 ? '/projects' : '/projects/create'}
                title="Open the editor"
            >
                {#if ProjectStore.projects.length > 0}
                    Go to your projects
                {:else}
                    Create your first project
                {/if}
            </ButtonLink>
        </Column>

        {#snippet content()}
            <Column flex1 style="padding-top: 4rem;">
                {@render children?.()}
            </Column>
        {/snippet}
    </Sidebar>
    <SearchPalette {scope} placeholder="Search the x86 docs and courses" />
</ThemeScope>

<style lang="scss">
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
