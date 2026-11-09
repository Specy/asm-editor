<script lang="ts">
    /**
     * A language's documentation pages around their content, in SiteSidebarLayout: its theme, and
     * a sidebar with the search box, a link to every page in its `DOCUMENTATION_SITES` table and
     * its instructions. The language's own layout passes in its instruction names, so no page loads
     * another language's lists.
     */
    import { page } from '$app/state'
    import SiteSidebarLayout from '#cmp/content/SiteSidebarLayout.svelte'
    import { languageScope, type DocumentationLanguage } from '#lib/search/scope.ts'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MenuLink from './MenuLink.svelte'
    import InstructionsMenu from './InstructionsMenu.svelte'
    import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
    import { resolveHref } from '#lib/hrefs.ts'

    interface Props {
        language: DocumentationLanguage
        /** The mnemonics that have a page under `/documentation/<language>/instruction`. */
        names: string[]
        children?: import('svelte').Snippet
    }

    let { language, names, children }: Props = $props()
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
</script>

<SiteSidebarLayout
    theme={site.theme}
    {scope}
    {placeholder}
    includeEmbed={false}
    navGap="0.5rem"
    contentTop="4rem"
>
    {#snippet nav(closeMenu)}
        <!-- the pages, then the instructions under their heading, as the course sidebar draws its
             lectures: the pages' text starts where the search box does, the instructions' under
             their heading's name, as the lectures' do under their chapter's -->
        <Column padding="0 0.5rem 0 0" style="--row-indent: 1rem;">
            <MenuLink
                href={resolveHref(`/documentation/${language}`)}
                title={site.label}
                onClick={closeMenu}
            />
            {#each links as link (link.id)}
                <MenuLink href={resolveHref(link.href)} title={link.title} onClick={closeMenu} />
            {/each}
        </Column>
        <!-- the sidebar's one heading, an h2 as the course sidebar's name is: an h3 here would
             stand under no h2 -->
        <TogglableSection open={true} level={2} sticky>
            {#snippet title()}Instructions{/snippet}
            <InstructionsMenu
                hrefOf={(instructionName) =>
                    resolveHref(`/documentation/${language}/instruction/${instructionName}`)}
                names={instructionNames}
                onClick={closeMenu}
                {currentInstructionName}
            />
        </TogglableSection>
    {/snippet}

    {@render children?.()}
</SiteSidebarLayout>
