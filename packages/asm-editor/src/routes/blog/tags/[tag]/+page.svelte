<script lang="ts">
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import PostCard from '#cmp/blog/PostCard.svelte'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import type { PageData } from './$types'
    let { data }: { data: PageData } = $props()
</script>

<PageMeta
    title={`${data.tag.label} guides and articles | ASM Editor`}
    description={data.tag.description}
/>
<header class="blog-intro">
    <a href="/blog" class="blog-back">
        <span class="blog-link-icon" aria-hidden="true"><FaArrowLeft /></span>
        All articles
    </a>
    <h1>{data.tag.label}</h1>
    <p class="blog-lead">{data.tag.description}</p>
</header>
<div class="blog-grid">
    {#each data.posts as post (post.slug)}<PostCard {post} />{/each}
</div>
