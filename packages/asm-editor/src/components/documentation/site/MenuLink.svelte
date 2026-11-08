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

<a
    {href}
    class="menu-link row"
    class:current
    aria-current={current ? 'page' : undefined}
    onclick={onClick}
>
    <span class="dot" aria-hidden="true"></span>
    <span class="menu-title">{title}</span>
</a>

<style lang="scss">
    @use '../../../styles/rows.scss';

    /* the sidebar's bullet, a dot rather than an icon */
    .dot {
        flex: none;
        width: 0.4rem;
        height: 0.4rem;
        border-radius: var(--r-pill);
        background-color: var(--accent);
    }
    .menu-title {
        font-size: var(--fs-body);
        font-weight: 400;
    }
    /* a row's box round the link, reaching out over the room around it so the text stays put */
    .menu-link {
        gap: 0.9rem;
        align-items: center;
        padding: 0.2rem 0.5rem;
        margin: -0.2rem -0.5rem;
        border-radius: 0 0.2rem 0.2rem 0;
    }
    /* the row under the pointer, and the page you are on */
    .menu-link:hover:not(.current) {
        background-color: var(--hover-bg);
    }
    .current {
        @include rows.selected;
    }
</style>
