<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import TagLink from '#cmp/blog/TagLink.svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import { AUTHOR, blogPostingLd, breadcrumbLd } from '#lib/seo.ts'
    import { formatBlogDate } from '#lib/blog/date.ts'
    import type { PageData } from './$types'
    let { data }: { data: PageData } = $props()
    const post = $derived(data.post)
</script>

<PageMeta
    title={`${post.title} | ASM Editor`}
    description={post.description}
    type="article"
    jsonLd={[
        blogPostingLd(post),
        breadcrumbLd([
            { name: 'Blog', pathname: '/blog' },
            { name: post.title, pathname: post.pathname }
        ])
    ]}
/>
<svelte:head>
    <meta property="article:published_time" content={post.datePublished} />
    {#if post.dateUpdated}<meta property="article:modified_time" content={post.dateUpdated} />{/if}
    <meta property="article:author" content={AUTHOR.url} />
    {#each post.tags as tag (tag)}<meta property="article:tag" content={tag} />{/each}
</svelte:head>

<article class="blog-article">
    <header class="blog-article-header">
        <a href="/blog" class="blog-back">
            <span class="blog-link-icon" aria-hidden="true"><FaArrowLeft /></span>
            All articles
        </a>
        <h1>{post.title}</h1>
        <p class="blog-lead">{post.description}</p>
        <div class="blog-byline">
            <a href={AUTHOR.url}>{AUTHOR.alternateName}</a><span aria-hidden="true">·</span>
            <time datetime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
            {#if post.dateUpdated}<span
                    >Updated <time datetime={post.dateUpdated}
                        >{formatBlogDate(post.dateUpdated)}</time
                    ></span
                >{/if}
        </div>
        <nav class="blog-tags" aria-label="Article tags">
            {#each post.tags as id (id)}<TagLink {id} />{/each}
        </nav>
    </header>
    <MarkdownRenderer source={post.content} headingIds />
    <footer class="blog-article-footer">
        <a href="/blog">
            All articles
            <span class="blog-link-icon" aria-hidden="true"><FaArrowRight /></span>
        </a>
    </footer>
</article>
