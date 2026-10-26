<script lang="ts">
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { languageScope } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import { page } from '$app/state'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MaskedScroll from '#cmp/shared/layout/MaskedScroll.svelte'
    import MenuLink from '#cmp/documentation/site/MenuLink.svelte'
    import InstructionsMenu from '#cmp/documentation/site/InstructionsMenu.svelte'
    import { LANGUAGE_THEMES } from '#lib/Config.ts'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'
    import Sidebar from '#cmp/shared/layout/Sidebar.svelte'
    import { resolve } from '$app/paths'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { ProjectStore } from '#stores/projectsStore.svelte.ts'

    interface Props {
        children?: import('svelte').Snippet
    }

    let { children }: Props = $props()

    // The sidebar lists the integer instruction set, the same set that has pages, by category.
    // Alphabetical: the sidebar is for finding a mnemonic by name, and the Workbench's
    // Documentation panel is what groups them by category.
    const instructionNames = [...new Set(x86DocumentedNames)].sort((a, b) => a.localeCompare(b))

    let menuOpen = $state(false)
    let currentInstructionName = $derived(page.params.instructionName ?? '')

    // The palette, its two boxes and Ctrl+K: this language's Documentation, its Course and the
    // General course ([the design record](../../../../../../docs/design/documentation-search.md))
    const scope = languageScope('x86')
    onMount(() => searchClient.preload(scope))
</script>

<ThemeScope theme={LANGUAGE_THEMES.X86}>
    <DefaultNavbar includeEmbed={false} bind:menuOpen style="border-bottom-left-radius: 0;" />

    <Sidebar bind:menuOpen menuStyle="overflow-y: hidden;">
        <Column padding="0 1rem">
            <SearchLauncher placeholder="Search the x86-64 docs and courses" />
        </Column>

        <MaskedScroll>
            <Column gap="1rem" padding="0 1rem">
                <MenuLink
                    href={resolve('/documentation/x86')}
                    title="x86-64"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/directive')}
                    title="Directives"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/registers')}
                    title="Registers & Flags"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/vector-instructions')}
                    title="Vector instructions"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/syscall')}
                    title="Syscalls"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/using-c')}
                    title="Using C and C++"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/runtime-library')}
                    title="Runtime library"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/executables')}
                    title="Executables"
                    onClick={() => (menuOpen = false)}
                />
                <MenuLink
                    href={resolve('/documentation/x86/all')}
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
                    hrefOf={(instructionName) =>
                        resolve('/documentation/x86/instruction/[instructionName]', {
                            instructionName
                        })}
                    names={instructionNames}
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

    <SearchPalette {scope} placeholder="Search the x86-64 docs and courses" />
</ThemeScope>
