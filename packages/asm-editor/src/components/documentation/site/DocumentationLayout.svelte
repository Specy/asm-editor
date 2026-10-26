<script lang="ts">
    /**
     * A language's documentation pages around their content: its theme, the navbar, and a sidebar
     * with the search box, a link to every page in its `DOCUMENTATION_SITES` table and its
     * instructions. The language's own layout passes in its instruction names, so no page loads
     * another language's lists.
     */
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { languageScope, type DocumentationLanguage } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import { page } from '$app/state'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MaskedScroll from '#cmp/shared/layout/MaskedScroll.svelte'
    import MenuLink from './MenuLink.svelte'
    import InstructionsMenu from './InstructionsMenu.svelte'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import Sidebar from '#cmp/shared/layout/Sidebar.svelte'
    import OpenEditorButton from '#cmp/shared/button/OpenEditorButton.svelte'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        language: DocumentationLanguage
        /** The mnemonics that have a page under `/documentation/<language>/instruction`. */
        names: string[]
        children?: import('svelte').Snippet
    }

    let { language, names, children }: Props = $props()
    let menuOpen = $state(false)
    let currentInstructionName = $derived(page.params.instructionName ?? '')

    const site = $derived(DOCUMENTATION_SITES[language])
    const placeholder = $derived(`Search the ${site.label} docs and courses`)
    // The Instructions Chapter is the list under its own heading below the other pages.
    const links = $derived(site.pages.filter((link) => link.id !== 'instructions'))

    // Alphabetical: the sidebar is for finding a mnemonic by name, and the Workbench's
    // Documentation panel is what groups them by category.
    const instructionNames = $derived([...new Set(names)].sort((a, b) => a.localeCompare(b)))

    // The palette, its two boxes and Ctrl+K: this language's Documentation, its Course and the
    // General course ([the design record](../../../../../../docs/design/documentation-search.md))
    const scope = $derived(languageScope(language))
    onMount(() => searchClient.preload(scope))
</script>

<ThemeScope theme={site.theme}>
    <DefaultNavbar includeEmbed={false} bind:menuOpen style="border-bottom-left-radius: 0;" />

    <Sidebar bind:menuOpen menuStyle="overflow-y: hidden;">
        <Column padding="0 1rem">
            <SearchLauncher {placeholder} />
        </Column>

        <MaskedScroll>
            <Column gap="1rem" padding="0 1rem">
                <MenuLink
                    href={resolveHref(`/documentation/${language}`)}
                    title={site.label}
                    onClick={() => (menuOpen = false)}
                />
                {#each links as link (link.id)}
                    <MenuLink
                        href={resolveHref(link.href)}
                        title={link.title}
                        onClick={() => (menuOpen = false)}
                    />
                {/each}
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
                        resolveHref(`/documentation/${language}/instruction/${instructionName}`)}
                    names={instructionNames}
                    onClick={() => (menuOpen = false)}
                    {currentInstructionName}
                />
            </TogglableSection>
        </MaskedScroll>

        <Column style="margin-top: auto;" padding="0.5rem">
            <OpenEditorButton />
        </Column>

        {#snippet content()}
            <Column flex1 style="padding-top: 4rem;">
                {@render children?.()}
            </Column>
        {/snippet}
    </Sidebar>

    <SearchPalette {scope} {placeholder} />
</ThemeScope>
