<script lang="ts">
    /**
     * A link in SiteSidebarLayout's sidebar (a documentation page, an instruction, a lecture), one
     * of the outline's rows (styles/outline.scss), as the exam builder draws its parts: from the
     * sidebar's leading edge, edge to edge with no gap, their padding the rhythm, rounded on the
     * far side, the one under the pointer in the hover tint and the page you are on in the current
     * item's look (design-system.md, D4); the keyboard's ring inside the row, which may sit against
     * a clipping edge. Its text starts at `--row-indent`, which a sticky TogglableSection sets for
     * the rows under its heading, and the row's own padding otherwise.
     */
    import type { Snippet } from 'svelte'
    import type { ResolvedPathname } from '$app/types'

    interface Props {
        href: ResolvedPathname
        /** The page the reader is on, marked as the sidebar's current row. */
        current?: boolean
        onClick?: (e: MouseEvent) => void
        children?: Snippet
    }

    let { href, current = false, onClick, children }: Props = $props()
</script>

<a {href} class="row" aria-current={current ? 'page' : undefined} onclick={onClick}>
    {@render children?.()}
</a>

<style lang="scss">
    @use '../../styles/outline.scss';
    @use '../../styles/focus.scss' as *;

    /* what the row holds 0.8rem apart, as a documentation page's dot and its title */
    .row {
        @include outline.row('[aria-current="page"]');
        @include outline.row-padding;
        @include focus-ring($inset: true);
        gap: 0.8rem;
        padding-left: var(--row-indent, 0.75rem);
        font-size: var(--fs-body);
        font-weight: 400;
    }
</style>
