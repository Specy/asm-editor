import { error } from '@sveltejs/kit'
import { blogCatalog } from '#lib/blog/catalog.server.ts'
import type { EntryGenerator, PageServerLoad } from './$types'

export const prerender = blogCatalog.posts.length > 0
export const entries: EntryGenerator = () => blogCatalog.posts.map(({ slug }) => ({ slug }))
export const load: PageServerLoad = ({ params }) => {
    const post = blogCatalog.getPost(params.slug)
    if (!post) error(404, 'Article not found')
    return { post, socialImage: post.image }
}
