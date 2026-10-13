import { error } from '@sveltejs/kit'
import { blogCatalog } from '#lib/blog/catalog.server.ts'
import { BLOG_TAGS, isBlogTag } from '#lib/blog/tags.ts'
import type { EntryGenerator, PageServerLoad } from './$types'

export const prerender = blogCatalog.tags.length > 0
export const entries: EntryGenerator = () => blogCatalog.tags.map(({ id }) => ({ tag: id }))
export const load: PageServerLoad = ({ params }) => {
    if (!isBlogTag(params.tag)) error(404, 'Tag not found')
    const posts = blogCatalog.forTag(params.tag)
    if (!posts.length) error(404, 'Tag not found')
    return {
        tag: { id: params.tag, ...BLOG_TAGS[params.tag] },
        posts,
        socialImage: posts.find((post) => post.image)?.image
    }
}
