<script lang="ts">
    /**
     * A part of the site read with a sidebar beside it: a language's documentation
     * (DocumentationLayout) and a course (`learn/courses/[courseId]/+layout.svelte`). Its theme,
     * the navbar, and the sidebar: what heads it, its search box, its list of pages, and its foot
     * with Open the editor; on a phone the sidebar is a drawer the navbar's menu button opens. The
     * search box, the palette it opens and Ctrl+K search `scope`, whose word index the layout
     * loads as it comes in ([the design record](../../../../../docs/design/documentation-search.md)).
     */
    import type { Snippet } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import type { SearchScope } from '#lib/search/scope.ts'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MaskedScroll from '#cmp/shared/layout/MaskedScroll.svelte'
    import Sidebar from '#cmp/shared/layout/Sidebar.svelte'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import OpenEditorButton from '#cmp/shared/button/OpenEditorButton.svelte'

    interface Props {
        /** The id of the built-in theme the pages show (ThemeScope). */
        theme: string
        scope: SearchScope
        /** The search box's and the palette's placeholder. */
        placeholder: string
        /** The navbar's Embed link. */
        includeEmbed?: boolean
        /** Takes the navbar's AI Chat link's place (DefaultNavbar), like a lecture's Ask AI. */
        aiToggle?: { open: boolean; label: string; title: string; onclick: () => void }
        /**
         * What heads the sidebar, above its search box, 1rem apart: a course's name. `closeMenu`
         * closes the drawer on a phone, for a link to call as it is followed, as `nav`'s.
         */
        header?: Snippet<[closeMenu: () => void]>
        /**
         * The sidebar's pages, in the box that scrolls: SidebarLinks, and sticky TogglableSections
         * of them. `closeMenu` closes the drawer on a phone, for a link to call as it is followed.
         */
        nav: Snippet<[closeMenu: () => void]>
        /** The room between the parts of `nav`. */
        navGap?: string
        /** What stands above Open the editor at the sidebar's foot, 0.5rem apart. */
        footer?: Snippet
        /** The room above the page, under the navbar. */
        contentTop?: string
        children?: Snippet
    }

    let {
        theme,
        scope,
        placeholder,
        includeEmbed = true,
        aiToggle,
        header,
        nav,
        navGap = '0',
        footer,
        contentTop = 'var(--navbar-height)',
        children
    }: Props = $props()

    let menuOpen = $state(false)
    const closeMenu = () => (menuOpen = false)
</script>

<ThemeScope {theme}>
    <!-- square at the bottom left, where it meets the sidebar under it -->
    <DefaultNavbar {includeEmbed} {aiToggle} bind:menuOpen style="border-bottom-left-radius: 0;" />

    <Sidebar bind:menuOpen menuStyle="overflow-y: hidden;">
        <Column padding="0 1rem" gap="1rem">
            {@render header?.(closeMenu)}
            <SearchLauncher {placeholder} />
        </Column>

        <MaskedScroll gap={navGap}>
            {@render nav(closeMenu)}
        </MaskedScroll>

        <Column style="margin-top: auto;" padding="0.5rem" gap="0.5rem">
            {@render footer?.()}
            <OpenEditorButton />
        </Column>

        {#snippet content()}
            <Column flex1 style="padding-top: {contentTop};">
                {@render children?.()}
            </Column>
        {/snippet}
    </Sidebar>

    <SearchPalette {scope} {placeholder} />
</ThemeScope>
