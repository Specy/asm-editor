<script lang="ts">
    import { resolve } from '$app/paths'

    let { includeEmbed = false }: { includeEmbed?: boolean } = $props()
</script>

<nav class="main-links" aria-label="Main navigation">
    <a class="link logo" href={resolve('/')} title="Go to the home">
        <img src="/favicon.png" alt="ASM Editor home" />
    </a>
    <a class="link" href={resolve('/projects')} title="Go to your projects">Projects</a>
    <a class="link" href={resolve('/documentation')} title="Go to the docs">Docs</a>
    <a class="link" href={resolve('/learn/courses')} title="Learn assembly">Learn</a>
    <a class="link blog" href={resolve('/blog')} title="Guides and use cases">Blog</a>
    {#if includeEmbed}
        <a class="link embed" href={resolve('/embed')} title="Embed the website">Embed</a>
    {/if}
</nav>

<style>
    .main-links {
        container: main-links / inline-size;
        display: flex;
        flex: 1;
        min-width: 0;
        align-items: center;
        gap: 0.6rem;
    }

    .link {
        display: flex;
        flex: none;
        align-items: center;
        height: 2.2rem;
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

    @container main-links (max-width: 20rem) {
        .embed {
            display: none;
        }
    }

    @container main-links (max-width: 16rem) {
        .blog {
            display: none;
        }
    }

    @media (max-width: 600px) {
        .main-links {
            gap: 0.4rem;
        }

        .link {
            font-size: 0.9rem;
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
