<script lang="ts">
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
</script>

<nav class="main-links" class:compact aria-label="Main navigation">
    <a class="link logo" href={resolve('/')} {@attach tooltip('Go to the home')}>
        <img src="/favicon.png" alt="ASM Editor home" />
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
    .main-links {
        container: main-links / inline-size;
        display: flex;
        flex: 1;
        min-width: 0;
        align-items: center;
        gap: 0.9rem;
    }

    .link {
        display: flex;
        flex: none;
        align-items: center;
        height: 2.2rem;
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

    .link:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 0.2rem;
    }

    .logo {
        width: 2.2rem;
    }

    .logo img {
        width: 100%;
        height: 100%;
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
            gap: 0.55rem;
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
