<script lang="ts">
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { languageScope } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
    import InstructionsMenu from '#cmp/documentation/site/InstructionsMenu.svelte'
    import { page } from '$app/state'
    import MenuLink from '#cmp/documentation/site/MenuLink.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MaskedScroll from '#cmp/shared/layout/MaskedScroll.svelte'
    import Sidebar from '#cmp/shared/layout/Sidebar.svelte'
    import { resolve } from '$app/paths'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'

    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()
    // Every member of a family has its own page. Alphabetical: the sidebar is for finding a
    // mnemonic by name, and the Workbench's Documentation panel is what groups them by category.
    const instructionNames = [...new Set([...M68KUncompoundedInstructions.keys()])].sort((a, b) =>
        a.localeCompare(b)
    )
    let menuOpen = $state(false)
    let currentInstructionName = $derived(page.params.instructionName ?? '')

    // The palette, its two boxes and Ctrl+K: this language's Documentation, its Course and the
    // General course ([the design record](../../../../../../docs/design/documentation-search.md))
    const scope = languageScope('m68k')
    onMount(() => searchClient.preload(scope))
</script>

<DefaultNavbar includeEmbed={false} bind:menuOpen style="border-bottom-left-radius: 0;" />

<Sidebar bind:menuOpen menuStyle="overflow-y: hidden;">
    <Column padding="0 1rem">
        <SearchLauncher placeholder="Search the M68K docs and courses" />
    </Column>

    <MaskedScroll>
        <Column gap="1rem" padding="0 1rem">
            <MenuLink
                href={resolve('/documentation/m68k')}
                title="M68K"
                onClick={() => (menuOpen = false)}
            />

            <MenuLink
                href={resolve('/documentation/m68k/addressing-mode')}
                title="Addressing Modes"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/condition-codes')}
                title="Condition Codes"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/shift-direction')}
                title="Shifts & directions"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/traps')}
                title="Trap tasks"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/exceptions')}
                title="Exceptions"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/directive')}
                title="Directives"
                onClick={() => (menuOpen = false)}
            />
            <MenuLink
                href={resolve('/documentation/m68k/assembler-features')}
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
                <h2 style="font-size: 1rem; font-weight: normal; margin-left: -0.1rem">
                    Instructions
                </h2>
            {/snippet}
            <InstructionsMenu
                names={instructionNames}
                hrefOf={(instructionName) =>
                    resolve('/documentation/m68k/instruction/[instructionName]', {
                        instructionName
                    })}
                onClick={() => (menuOpen = false)}
                {currentInstructionName}
            />
        </TogglableSection>
    </MaskedScroll>

    <Column style="margin-top: auto;" padding="0.5rem">
        <ButtonLink
            style="width: 100%;"
            href={ProjectStore.projects.length > 0 ? '/projects' : '/projects/create'}
            {@attach tooltip('Open the editor')}
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

<SearchPalette {scope} placeholder="Search the M68K docs and courses" />
