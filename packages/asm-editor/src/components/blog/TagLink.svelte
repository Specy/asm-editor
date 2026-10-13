<script lang="ts">
    import { BLOG_TAGS, type BlogTagId } from '#lib/blog/tags.ts'
    let { id }: { id: BlogTagId } = $props()
</script>

<a class="blog-tag" href={`/blog/tags/${id}`}>{BLOG_TAGS[id].label}</a>
