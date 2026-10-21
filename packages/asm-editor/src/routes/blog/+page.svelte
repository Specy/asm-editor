<script lang="ts">
    import { resolve } from '$app/paths'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import PostCard from '#cmp/blog/PostCard.svelte'
    import TagLink from '#cmp/blog/TagLink.svelte'
    import type { PageData } from './$types'
    let { data }: { data: PageData } = $props()
</script>

<PageMeta
    title="ASM Editor guides and use cases"
    description="ASM Editor guides for MIPS/MARS, RISC-V/RARS, C/C++ compilation, teaching, and reverse engineering."
/>

<header class="blog-intro">
    <h1>ASM Editor blog</h1>
    <p class="blog-lead">
        Guides to running and debugging assembly, compiling C/C++, teaching, and reverse
        engineering.
    </p>
    <nav class="blog-tags" aria-label="Browse articles by tag">
        {#each data.tags as tag (tag.id)}<TagLink id={tag.id} />{/each}
    </nav>
</header>

{#if data.featured.length}
    <section aria-labelledby="start-here">
        <div class="blog-section-heading">
            <h2 id="start-here">Start here</h2>
        </div>
        <div class="blog-grid">
            {#each data.featured as post (post.slug)}<PostCard {post} />{/each}
        </div>
    </section>
{/if}
{#if data.recent.length}
    <section aria-labelledby="more-guides">
        <div class="blog-section-heading">
            <h2 id="more-guides">More guides</h2>
        </div>
        <div class="blog-grid">
            {#each data.recent as post (post.slug)}<PostCard {post} />{/each}
        </div>
    </section>
{/if}
{#if !data.featured.length && !data.recent.length}
    <p>
        No articles published yet. <a href={resolve('/learn/courses')}>Assembly courses</a>.
    </p>
{/if}
