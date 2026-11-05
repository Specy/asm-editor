import { describe, expect, it } from 'vite-plus/test'
import { versions } from './versions.ts'

const metadata = import.meta.glob<{ status: string }>('/src/blog/*/meta.json', {
    eager: true,
    import: 'default'
})

describe('changelog versions', () => {
    it.each(versions.filter((version) => version.blogPost))(
        '$version links to a published blog post',
        (version) => {
            expect(metadata[`/src/blog/${version.blogPost}/meta.json`]?.status).toBe('published')
        }
    )
})
