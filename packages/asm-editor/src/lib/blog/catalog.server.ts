import { createBlogCatalog } from './catalog.ts'

const metadata = import.meta.glob('/src/blog/*/meta.json', { eager: true, import: 'default' })
const content = import.meta.glob<string>('/src/blog/*/index.md', {
    eager: true,
    query: '?raw',
    import: 'default'
})

export const blogCatalog = createBlogCatalog(
    Object.entries(metadata).map(([path, meta]) => ({
        slug: path.split('/').at(-2)!,
        path,
        metadata: meta,
        content: content[path.replace(/meta\.json$/, 'index.md')]
    })),
    ['getting-started', 'mips-mars-browser', 'riscv-rars-browser']
)
