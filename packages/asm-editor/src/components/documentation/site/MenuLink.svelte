<script lang="ts">
    import { page } from '$app/state'
    import type { ResolvedPathname } from '$app/types'
    interface Props {
        href: ResolvedPathname
        title: string
        onClick?: (e: MouseEvent) => void
    }

    let { href, title, onClick }: Props = $props()
    // the page the reader is on, marked as the sidebar's current row (design-system.md, D4)
    const current = $derived(page.url.pathname.replace(/\/$/, '') === href.replace(/\/$/, ''))
</script>

<a {href} class="menu-link" aria-current={current ? 'page' : undefined} onclick={onClick}>
    <span class="dot" aria-hidden="true"></span>
    {title}
</a>

<style lang="scss">
    @use '../../../styles/outline.scss';
    @use '../../../styles/focus.scss' as *;

    /* one of the outline's rows (styles/outline.scss), as the course sidebar's lectures are: run
       out to the sidebar's left edge by the caller, edge to edge with no gap, their padding the
       rhythm, rounded on the far side, the one under the pointer in the hover tint and the page
       you are on in the current item's look; the keyboard's ring inside the row. The text starts
       at the caller's `--menu-link-indent`, the room the row's padding leaves otherwise. */
    .menu-link {
        @include outline.row('[aria-current="page"]');
        @include outline.row-padding;
        @include focus-ring($inset: true);
        gap: 0.8rem;
        padding-left: var(--menu-link-indent, 0.75rem);
        font-size: var(--fs-body);
        font-weight: 400;
    }

    /* a page's bullet, a dot rather than an icon, where the row's text would start: the 0.8rem
       gap puts the title 1.2rem further in, under the instructions' names (the documentation
       sidebar's `--instruction-indent`, 2.2rem, against its 1rem `--menu-link-indent`) */
    .dot {
        flex: none;
        width: 0.4rem;
        height: 0.4rem;
        border-radius: var(--r-pill);
        background-color: var(--accent);
    }
</style>
