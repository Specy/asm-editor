<script lang="ts">
    import { resolve } from '$app/paths'
    import type { BlogPostSummary } from '#lib/blog/catalog.ts'
    import { formatBlogDate } from '#lib/blog/date.ts'
    import TagLink from './TagLink.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import { responsiveImage } from '#lib/images/responsive.ts'
    interface Props {
        post: BlogPostSummary
        /**
         * The first card of a page, whose picture is the largest thing on screen when the page
         * opens: loaded at once and first, where the others wait until they are near the view.
         */
        priority?: boolean
    }
    let { post, priority = false }: Props = $props()
    const picture = $derived(post.image ? responsiveImage(post.image.src) : undefined)
</script>

<!-- a Card whose title's link covers it, its tags above that link -->
<Card element="article" class="blog-card" hoverTint={false}>
    {#if post.image}<div class="blog-card-image">
            <img
                src={post.image.src}
                srcset={picture?.srcset}
                sizes="(max-width: 650px) 100vw, 540px"
                alt=""
                loading={priority ? 'eager' : 'lazy'}
                fetchpriority={priority ? 'high' : undefined}
                width="1440"
                height="1000"
            />
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
