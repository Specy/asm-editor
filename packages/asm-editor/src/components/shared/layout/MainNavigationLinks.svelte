<script lang="ts">
    import { responsiveImage } from '#lib/images/responsive.ts'
    import { resolve } from '$app/paths'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { page } from '$app/state'

    let { includeEmbed = false, compact = false }: { includeEmbed?: boolean; compact?: boolean } =
        $props()

    /** The section the page is in: its link is drawn in full, the others muted. */
    function current(section: string): 'page' | 'true' | undefined {
        const path = page.url.pathname
        if (path === section) return 'page'
        return path.startsWith(section + '/') ? 'true' : undefined
    }

    /** The logo's smaller copies: the original is 512 pixels wide, drawn 35. */
    const LOGO = responsiveImage('/favicon.png')
</script>

<nav class="main-links" class:compact aria-label="Main navigation">
    <a class="link logo" href={resolve('/')} {@attach tooltip('Go to the home')}>
        <img src="/favicon.png" srcset={LOGO.srcset} sizes="36px" alt="ASM Editor home" />
    </a>
    <a
        class="link"
        href={resolve('/projects')}
        aria-current={current(resolve('/projects'))}
        title="Go to your projects">Projects</a
    >
    <a
        class="link"
        href={resolve('/documentation')}
        aria-current={current(resolve('/documentation'))}
        title="Go to the docs">Docs</a
    >
    {#if !compact}
        <a
            class="link"
            href={resolve('/learn/courses')}
            aria-current={current(`${resolve('/')}learn`)}
            title="Learn assembly">Learn</a
        >
        <a
            class="link blog"
            href={resolve('/blog')}
            aria-current={current(resolve('/blog'))}
            title="Guides and use cases">Blog</a
        >
        {#if includeEmbed}
            <a
                class="link embed"
                href={resolve('/embed')}
                aria-current={current(resolve('/embed'))}
                title="Embed the website">Embed</a
            >
        {/if}
    {/if}
</nav>

<style>
    /* The links run the navbar's full height, its padding included, so each is easy to hit, and
       the space between two of them is their own padding rather than a gap no click reaches. The
       negative margins give back the navbar's padding above, below and at the logo's left, so
       nothing moves on screen. */
    .main-links {
        --link-pad: 0.45rem;
        container: main-links / inline-size;
        display: flex;
        flex: 1;
        min-width: 0;
        align-self: stretch;
        align-items: stretch;
        margin-block: -0.5rem;
        margin-left: calc(-1 * var(--link-pad));
    }

    .link {
        display: flex;
        flex: none;
        align-items: center;
        padding-inline: var(--link-pad);
        font-size: var(--fs-body);
        color: var(--text-muted);
    }

    .link[aria-current] {
        color: var(--background-text);
    }

    .compact {
        flex: none;
        container-type: normal;
    }

    .link:hover {
        color: var(--accent);
    }

    /* inside the link, which reaches the navbar's edges */
    .link:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
        border-radius: 0.2rem;
    }

    .logo img {
        width: 2.2rem;
        height: 2.2rem;
    }

    @container main-links (max-width: 21rem) {
        .embed {
            display: none;
        }
    }

    @container main-links (max-width: 17rem) {
        .blog {
            display: none;
        }
    }

    @media (max-width: 600px) {
        .main-links {
            --link-pad: 0.275rem;
        }

        .link {
            font-size: var(--fs-small);
        }

        .embed {
            display: none;
        }

        .blog {
            display: flex;
        }

        @container main-links (max-width: 14rem) {
            .blog {
                display: none;
            }
        }
    }
</style>
