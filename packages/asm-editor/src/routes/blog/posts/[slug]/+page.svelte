<script lang="ts">
    import { resolve } from '$app/paths'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import TagLink from '#cmp/blog/TagLink.svelte'
    import ArticleOutline from '#cmp/blog/ArticleOutline.svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import { AUTHOR, blogPostingLd, breadcrumbLd } from '#lib/seo.ts'
    import { formatBlogDate } from '#lib/blog/date.ts'
    import type { PageData } from './$types'
    let { data }: { data: PageData } = $props()
    const post = $derived(data.post)
    let articleElement: HTMLElement | undefined = $state()
</script>

<PageMeta
    title={`${post.title} - ASM Editor`}
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

<!-- a reading page: its title, body and outline a step larger (design-system.md, D11) -->
<div class="blog-post-layout reading">
    <ArticleOutline sections={data.sections} article={articleElement} />
    <article class="blog-article" bind:this={articleElement}>
        <header class="blog-article-header">
            <a href={resolve('/blog')} class="blog-back">
                <span class="blog-link-icon" aria-hidden="true"><FaArrowLeft /></span>
                All articles
            </a>
            {#if post.draft}<span class="blog-draft">Draft: shown by the dev server only</span>{/if}
            <Header>{post.title}</Header>
            <p class="blog-lead">{post.description}</p>
            <div class="blog-byline">
                <a href={AUTHOR.url} rel="external">{AUTHOR.alternateName}</a>
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
            <a href={resolve('/blog')}>
                All articles
                <span class="blog-link-icon" aria-hidden="true"><FaArrowRight /></span>
            </a>
        </footer>
    </article>
</div>
