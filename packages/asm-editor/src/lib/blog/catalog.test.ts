import { describe, it, expect } from 'vite-plus/test'
import { createBlogCatalog, type BlogSource } from './catalog.ts'

function post(slug: string, metadata: Record<string, unknown> = {}): BlogSource {
    return {
        slug,
        path: `${slug}/meta.json`,
        content: '## An example\nUseful content.',
        metadata: {
            title: slug,
            description: 'A practical guide.',
            tags: ['guide'],
            status: 'published',
            datePublished: '2026-10-12',
            ...metadata
        }
    }
}

describe('blog publication', () => {
    it('keeps draft bodies out of lookup, summaries, tags, and curated collections', () => {
        const catalog = createBlogCatalog(
            [post('public'), post('private', { status: 'draft', tags: ['x86'] })],
            ['private']
        )
        expect(catalog.getPost('private')).toBeUndefined()
        expect(catalog.posts.map((post) => post.slug)).toEqual(['public'])
        expect(catalog.posts[0]).not.toHaveProperty('content')
        expect(catalog.tags.map((tag) => tag.id)).toEqual(['guide'])
        expect(catalog.featured).toEqual([])
    })
    it('includes drafts, marked as such, only when asked to, as the dev server does', () => {
        const catalog = createBlogCatalog(
            [
                post('public'),
                post('dated', { status: 'draft', datePublished: '2026-09-30', tags: ['x86'] }),
                post('undated', { status: 'draft', datePublished: undefined }),
                { ...post('empty', { status: 'draft' }), content: '' }
            ],
            [],
            { includeDrafts: true }
        )
        expect(catalog.posts.map((post) => [post.slug, post.draft])).toEqual([
            ['undated', true],
            ['public', false],
            ['dated', true]
        ])
        expect(catalog.getPost('dated')?.content).toContain('Useful content.')
        expect(catalog.getPost('undated')?.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(catalog.getPost('empty')).toBeUndefined()
        expect(catalog.tags.map((tag) => tag.id)).toEqual(['guide', 'x86'])
    })
    it('sorts by editorial publication date and keeps curated order without repeated cards', () => {
        const catalog = createBlogCatalog(
            [
                post('old', { datePublished: '2026-09-01' }),
                post('new'),
                post('middle', { datePublished: '2026-10-01' })
            ],
            ['middle', 'old']
        )
        expect(catalog.posts.map((post) => post.slug)).toEqual(['new', 'middle', 'old'])
        expect(catalog.featured.map((post) => post.slug)).toEqual(['middle', 'old'])
        expect(catalog.recent.map((post) => post.slug)).toEqual(['new'])
    })
    it('allows overlapping purpose and subject tags', () => {
        const catalog = createBlogCatalog([post('mars', { tags: ['guide', 'use-case', 'mips'] })])
        expect(catalog.forTag('mips')[0].slug).toBe('mars')
        expect(catalog.forTag('use-case')[0].slug).toBe('mars')
        expect(catalog.forTag('x86')).toEqual([])
    })
    it.each([
        { datePublished: undefined },
        { datePublished: '2026-02-30' },
        { dateUpdated: '2026-10-01' },
        { tags: ['typo'] },
        { tags: ['guide', 'guide'] },
        { status: undefined },
        { image: { src: '/images/blog/example.webp', alt: '' } }
    ])('identifies the path for invalid metadata %j', (metadata) => {
        expect(() => createBlogCatalog([post('invalid', metadata)])).toThrow('invalid/meta.json')
    })
    it('rejects absent published content and invalid curated references', () => {
        expect(() => createBlogCatalog([{ ...post('empty'), content: '' }])).toThrow(
            'empty/meta.json'
        )
        expect(() => createBlogCatalog([post('valid')], ['missing'])).toThrow(
            'unknown post missing'
        )
        expect(() => createBlogCatalog([post('valid')], ['valid', 'valid'])).toThrow(
            'duplicate posts'
        )
    })
})
