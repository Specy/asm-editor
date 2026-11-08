<script lang="ts">
    import { resolve } from '$app/paths'
    import type { BlogPostSummary } from '#lib/blog/catalog.ts'
    import { formatBlogDate } from '#lib/blog/date.ts'
    import TagLink from './TagLink.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    let { post }: { post: BlogPostSummary } = $props()
</script>

<!-- a Card whose title's link covers it, its tags above that link -->
<Card element="article" class="blog-card" hoverTint={false}>
    {#if post.image}<div class="blog-card-image">
            <img src={post.image.src} alt="" loading="lazy" width="1440" height="1000" />
        </div>{/if}
    <div class="blog-card-body">
        {#if post.draft}<span class="blog-draft">Draft</span>{/if}
        <h3>
            <a class="card-cover" href={resolve('/blog/posts/[slug]', { slug: post.slug })}
                >{post.title}</a
            >
        </h3>
        <p>{post.description}</p>
        <div class="blog-tags blog-card-footer">
            {#each post.tags as id (id)}<TagLink {id} />{/each}
            <time class="blog-date" datetime={post.datePublished}
                >{formatBlogDate(post.datePublished)}</time
            >
        </div>
    </div>
</Card>
