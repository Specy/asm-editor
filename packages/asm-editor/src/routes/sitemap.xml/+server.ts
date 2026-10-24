import { NOINDEX_PAGES, SITE_URL } from '#lib/seo.ts'
import { blogCatalog } from '#lib/blog/catalog.server.ts'
import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { mipsInstructionMap } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'
import { z80InstructionMap } from '#lib/languages/Z80/Z80-documentation.ts'

export const prerender = true

/**
 * Routes that exist but do not belong in an index: app surfaces that hold the reader's
 * own state, and the embed target, which is meant to be framed by another page rather
 * than landed on from a search result. The pages that also carry a robots noindex come
 * from the same list the hook writes it for.
 */
const EXCLUDED = new Set([...NOINDEX_PAGES.keys(), '/embed', '/projects', '/projects/create'])

/** Discovered rather than hand-listed, so a new page is in the sitemap the moment it
 *  exists. Parameterised routes are filtered out here and expanded below. */
function staticRoutes() {
    const modules = import.meta.glob('/src/routes/**/+page.svelte')
    return Object.keys(modules)
        .map((file) => file.replace('/src/routes', '').replace('/+page.svelte', '') || '/')
        .filter((route) => !route.includes('['))
        .filter((route) => !EXCLUDED.has(route))
        .sort()
}

/**
 * The assembly course lectures. Their routes come from the same content globs the pages
 * themselves load, so the two cannot disagree: `#content/<course>/<module>/<lecture>`.
 */
function courseRoutes() {
    const courses = Object.keys(import.meta.glob('/src/content/*/meta.json')).map((path) => {
        const parts = path.split('/')
        return `/learn/courses/${parts[parts.length - 2]}`
    })
    const lectures = Object.keys(import.meta.glob('/src/content/*/*/*/meta.json')).map((path) => {
        const [, , , course, module_, lecture] = path.split('/')
        return `/learn/courses/${course}/${module_}/${lecture}`
    })
    return [...courses, ...lectures]
}

/** One entry per documented instruction, from the same maps the pages themselves load,
 *  so the sitemap cannot list a page that does not exist or miss one that does. */
function instructionRoutes() {
    const instructions = [
        ['m68k', M68KUncompoundedInstructions],
        ['mips', mipsInstructionMap],
        ['risc-v', riscvInstructionMap],
        ['z80', z80InstructionMap]
    ].flatMap(([arch, map]) =>
        Array.from((map as Map<string, unknown>).keys()).map(
            (name) => `/documentation/${arch}/instruction/${name}`
        )
    )
    // x86 has a page per documented instruction rather than per accepted mnemonic: the vector and
    // system extensions are listed on the complete documentation page instead of getting one each.
    const x86 = x86DocumentedNames.map((name) => `/documentation/x86/instruction/${name}`)
    return [...instructions, ...x86]
}

function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

export const GET = async () => {
    const buildDate = new Date().toISOString().slice(0, 10)
    const routes = [...staticRoutes(), ...courseRoutes(), ...instructionRoutes()]
    const blogDates = new Map(
        blogCatalog.posts.map((post) => [post.pathname, post.dateUpdated ?? post.datePublished])
    )
    for (const tag of blogCatalog.tags) {
        const dates = blogCatalog
            .forTag(tag.id)
            .map((post) => post.dateUpdated ?? post.datePublished)
            .sort()
        blogDates.set(`/blog/tags/${tag.id}`, dates.at(-1)!)
    }
    const latestBlogDate = [...blogDates.values()].sort().at(-1)
    if (latestBlogDate) blogDates.set('/blog', latestBlogDate)
    routes.push(...blogDates.keys())

    const entries = [...new Set(routes)].map(
        (route) => `    <url>
        <loc>${escapeXml(SITE_URL + route)}</loc>
        ${route === '/blog' && !latestBlogDate ? '' : `<lastmod>${blogDates.get(route) ?? buildDate}</lastmod>`}
    </url>`
    )

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`

    return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
