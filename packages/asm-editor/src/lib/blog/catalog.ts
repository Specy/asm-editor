import { z } from 'zod'
import { BLOG_TAG_IDS, BLOG_TAGS, type BlogTagId } from './tags.ts'

const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
        const parsed = new Date(value)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, 'Use a valid calendar date in YYYY-MM-DD form')

const metadataSchema = z
    .object({
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        tags: z
            .array(z.enum(BLOG_TAG_IDS))
            .min(1)
            .refine((tags) => new Set(tags).size === tags.length, 'Duplicate tag'),
        status: z.enum(['draft', 'published']),
        datePublished: date.optional(),
        dateUpdated: date.optional(),
        image: z
            .object({
                src: z.string().regex(/^\/images\/blog\/[a-z0-9/-]+\.(?:webp|png|jpg|svg)$/),
                alt: z.string().trim().min(1)
            })
            .strict()
            .optional()
    })
    .strict()
    .superRefine((meta, context) => {
        if (meta.status === 'published' && !meta.datePublished) {
            context.addIssue({
                code: 'custom',
                path: ['datePublished'],
                message: 'Published posts need a publication date'
            })
        }
        if (meta.dateUpdated && (!meta.datePublished || meta.dateUpdated < meta.datePublished)) {
            context.addIssue({
                code: 'custom',
                path: ['dateUpdated'],
                message: 'An update cannot precede publication'
            })
        }
    })

export type BlogPost = Omit<z.infer<typeof metadataSchema>, 'status' | 'datePublished'> & {
    slug: string
    pathname: string
    datePublished: string
    content: string
}
export type BlogPostSummary = Omit<BlogPost, 'content'>
export type BlogSource = { slug: string; path: string; metadata: unknown; content?: string }

export function summarizePost({ content: _content, ...summary }: BlogPost): BlogPostSummary {
    return summary
}

/** The only public view of the sources. Draft text never leaves this catalog. */
export function createBlogCatalog(sources: BlogSource[], startHere: readonly string[] = []) {
    const seen = new Set<string>()
    const posts: BlogPost[] = []
    for (const source of sources) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.slug) || seen.has(source.slug)) {
            throw new Error(`${source.path}: invalid or duplicate post slug ${source.slug}`)
        }
        seen.add(source.slug)
        const result = metadataSchema.safeParse(source.metadata)
        if (!result.success) throw new Error(`${source.path}: ${result.error.message}`)
        const { status, ...metadata } = result.data
        if (status === 'draft') continue
        if (!source.content?.trim())
            throw new Error(`${source.path}: published post has no content`)
        posts.push({
            ...metadata,
            datePublished: metadata.datePublished!,
            slug: source.slug,
            pathname: `/blog/posts/${source.slug}`,
            content: source.content
        })
    }
    for (const slug of startHere) {
        if (!seen.has(slug)) throw new Error(`Start Here references unknown post ${slug}`)
    }
    if (new Set(startHere).size !== startHere.length)
        throw new Error('Start Here contains duplicate posts')
    posts.sort(
        (a, b) => b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug)
    )
    const summaries = posts.map(summarizePost)
    const bySlug = new Map(posts.map((post) => [post.slug, post]))
    const featured = startHere.flatMap((slug) => {
        const post = bySlug.get(slug)
        return post ? [summarizePost(post)] : []
    })
    const featuredSlugs = new Set(featured.map((post) => post.slug))
    const tags = BLOG_TAG_IDS.filter((id) => posts.some((post) => post.tags.includes(id))).map(
        (id) => ({ id, ...BLOG_TAGS[id] })
    )
    return {
        posts: summaries,
        tags,
        featured,
        recent: summaries.filter((post) => !featuredSlugs.has(post.slug)),
        getPost: (slug: string) => bySlug.get(slug),
        forTag: (id: BlogTagId) => summaries.filter((post) => post.tags.includes(id))
    }
}
