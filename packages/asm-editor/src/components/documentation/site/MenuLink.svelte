<script lang="ts">
    import { page } from '$app/state'
    import type { ResolvedPathname } from '$app/types'
    import SidebarLink from '#cmp/content/SidebarLink.svelte'
    interface Props {
        href: ResolvedPathname
        title: string
        onClick?: (e: MouseEvent) => void
    }

    let { href, title, onClick }: Props = $props()
    // the page the reader is on, marked as the sidebar's current row (design-system.md, D4)
    const current = $derived(page.url.pathname.replace(/\/$/, '') === href.replace(/\/$/, ''))
</script>

<!-- one of the documentation sidebar's pages, as its instructions are -->
<SidebarLink {href} {current} {onClick}>
    <span class="dot" aria-hidden="true"></span>
    {title}
</SidebarLink>

<style>
    /* a page's bullet, a dot rather than an icon, where the row's text would start: the row's
       0.8rem gap puts the title 1.2rem further in, under the instructions' names (2.2rem, against
       the pages' 1rem `--row-indent`, DocumentationLayout) */
    .dot {
        flex: none;
        width: 0.4rem;
        height: 0.4rem;
        border-radius: var(--r-pill);
        background-color: var(--accent);
    }
</style>
