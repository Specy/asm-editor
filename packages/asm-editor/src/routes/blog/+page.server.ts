import { blogCatalog } from '#lib/blog/catalog.server.ts'

export const load = () => ({
    featured: blogCatalog.featured,
    recent: blogCatalog.recent,
    tags: blogCatalog.tags,
    socialImage: {
        src: '/images/blog/getting-started/workbench.webp',
        alt: 'A MIPS assembly project in ASM Editor'
    }
})
