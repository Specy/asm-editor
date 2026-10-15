<script lang="ts">
    import type { BlogPostSummary } from '#lib/blog/catalog.ts'
    import { formatBlogDate } from '#lib/blog/date.ts'
    import TagLink from './TagLink.svelte'
    let { post }: { post: BlogPostSummary } = $props()
</script>

<article class="blog-card">
    {#if post.image}<div class="blog-card-image">
            <img src={post.image.src} alt="" loading="lazy" width="1440" height="1000" />
        </div>{/if}
    <div class="blog-card-body">
        <time class="blog-date" datetime={post.datePublished}
            >{formatBlogDate(post.datePublished)}</time
        >
        <h3><a href={post.pathname}>{post.title}</a></h3>
        <p>{post.description}</p>
        <div class="blog-tags">
            {#each post.tags as id (id)}<TagLink {id} />{/each}
        </div>
    </div>
</article>
