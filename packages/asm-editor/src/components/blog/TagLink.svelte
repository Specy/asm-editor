<script lang="ts">
    import { resolve } from '$app/paths'
    import { BLOG_TAGS, type BlogTagId } from '#lib/blog/tags.ts'
    let { id }: { id: BlogTagId } = $props()
</script>

<a class="blog-tag" href={resolve('/blog/tags/[tag]', { tag: id })}>{BLOG_TAGS[id].label}</a>
