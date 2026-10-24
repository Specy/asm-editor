export const SITE_URL = 'https://asm-editor.specy.app'

/** The legal name is what a citation, an academic profile and a search engine can
 *  reconcile; `alternateName` keeps the handle the repo and the apps are known by, so
 *  the two identities resolve to one person instead of competing. The `@id` gives the
 *  person one node in the JSON-LD graph, so the PAPER's author entry can point at the
 *  same identity instead of describing a second person with the same name. */
export const PERSON_ID = 'https://specy.app/#person'

export const AUTHOR = {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: 'Enrico Menichelli',
    alternateName: 'Specy',
    url: 'https://specy.app',
    sameAs: ['https://github.com/Specy']
} as const

/** The peer-reviewed description of this app. Emitted as the SoftwareApplication's
 *  `citation` so the tool and the paper are one connected entity to a crawler, rather
 *  than two artefacts that happen to share a name. */
export const PAPER = {
    '@type': 'ScholarlyArticle',
    name: 'ASM Editor: Understanding Language Abstractions Through Assembly Programming',
    author: [{ '@id': PERSON_ID }, { '@type': 'Person', name: 'Luca Forlizzi' }],
    publisher: { '@type': 'Organization', name: 'IEEE' },
    datePublished: '2026-04-27',
    doi: '10.1109/EDUCON67543.2026.11574463',
    identifier: 'https://doi.org/10.1109/EDUCON67543.2026.11574463',
    url: 'https://doi.org/10.1109/EDUCON67543.2026.11574463',
    isPartOf: {
        '@type': 'PublicationEvent',
        name: '2026 IEEE Global Engineering Education Conference (EDUCON)',
        location: 'Cairo, Egypt',
        startDate: '2026-04-27',
        endDate: '2026-04-30'
    }
} as const

/**
 * App surfaces that are reachable and answer 200 but are not content anyone searches for: the AI
 * chat and the exam builder and session, which hold the reader's own state. `hooks.server.ts` writes
 * a robots noindex into their HTML and the sitemap leaves them out.
 *
 * They are prerendered as empty shells (`ssr = false`), so a `<svelte:head>` in the page never
 * reaches the HTML a crawler reads; `title` is what the hook writes for it there, the same one the
 * page sets once it runs. A page rendered on the server writes its own title and needs none here.
 */
export const NOINDEX_PAGES: ReadonlyMap<string, { title?: string }> = new Map([
    ['/chat', { title: 'AI Chat' }],
    ['/exam', { title: 'Exam Builder - Asm Editor' }],
    ['/exam/session', { title: 'Exam Session - Asm Editor' }]
])

export function toAbsoluteUrl(pathname: string) {
    return `${SITE_URL}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

/**
 * Instruction descriptions are authored as markdown and were being piped straight into
 * <meta name="description">, so search results showed raw `[MOVEA](/documentation/...)`
 * link syntax and hard line breaks. Meta descriptions are plain text: unwrap the links,
 * drop the inline markers and collapse the whitespace.
 */
export function toMetaDescription(markdown: string, maxLength = 160) {
    const text = markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images carry no meaning here
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep their label only
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replace(/^\s*#{1,6}\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (text.length <= maxLength) return text
    // Cut on a word boundary so the snippet does not end mid-word.
    const cut = text.slice(0, maxLength)
    const lastSpace = cut.lastIndexOf(' ')
    return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** `</script>` inside a JSON string would close the surrounding tag; escaping the three
 *  characters that can do that keeps it valid JSON but inert as markup. */
export function serializeJsonLd(value: unknown) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
}

/**
 * The complete <script type="application/ld+json"> element for a schema.org payload.
 *
 * Assembled here rather than in the component because a literal closing script tag inside
 * a Svelte template ends the component's own script block as far as the parser is
 * concerned - it builds, but eslint's svelte parser rejects the file. serializeJsonLd has
 * already escaped < > and &, so nothing in `value` can close the tag either.
 */
export function jsonLdScriptTag(value: unknown) {
    return `<script type="application/ld+json">${serializeJsonLd(value)}</` + `script>`
}

export function softwareApplicationLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Asm Editor',
        description:
            'Write, learn and run M68K, MIPS, RISC-V, x86-64 and Z80 assembly code in your browser. View registers and memory, step and undo the execution.',
        url: SITE_URL,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
        featureList: [
            'M68K assembler and interpreter',
            'MIPS assembler and interpreter',
            'RISC-V assembler and interpreter',
            'x86-64 emulator',
            'Z80 assembler and interpreter',
            'Step and undo execution',
            'Register and memory inspection',
            'Built-in instruction set documentation'
        ],
        author: AUTHOR,
        citation: PAPER,
        sameAs: ['https://github.com/Specy/asm-editor', PAPER.url]
    }
}

/** One instruction's reference page. `TechArticle` is the closest Schema.org type for
 *  developer documentation and is what surfaces these in answer engines. */
export function instructionLd(opts: {
    name: string
    architecture: string
    description: string
    pathname: string
}) {
    const url = toAbsoluteUrl(opts.pathname)
    return {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: `${opts.name.toUpperCase()} - ${opts.architecture} instruction`,
        description: toMetaDescription(opts.description, 300),
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: AUTHOR,
        publisher: AUTHOR,
        isPartOf: {
            '@type': 'TechArticle',
            name: `${opts.architecture} instruction set reference`,
            url: toAbsoluteUrl(opts.pathname.replace(/\/[^/]+$/, ''))
        }
    }
}

export type Crumb = { name: string; pathname: string }

/** A BreadcrumbList for a page reached through a chain of hubs, ending with the page
 *  itself. Every crumb carries an absolute URL, as Google requires for the trail. */
export function breadcrumbLd(trail: Crumb[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.name,
            item: toAbsoluteUrl(crumb.pathname)
        }))
    }
}

/** A documentation hub page (a syscall or trap reference, an architecture index):
 *  reference prose rather than a single instruction, so TechArticle without the
 *  instruction-only fields. */
export function documentationArticleLd(opts: {
    headline: string
    description: string
    pathname: string
    section: Crumb
}) {
    const url = toAbsoluteUrl(opts.pathname)
    return {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: opts.headline,
        description: toMetaDescription(opts.description, 300),
        url,
        inLanguage: 'en',
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: AUTHOR,
        publisher: AUTHOR,
        isPartOf: {
            '@type': 'CreativeWork',
            name: opts.section.name,
            url: toAbsoluteUrl(opts.section.pathname)
        }
    }
}

/** A course and the lectures it is made of. `provider` and `author` are the same
 *  Person as everywhere else, since the course content is written by them. */
export function courseLd(opts: {
    name: string
    description: string
    pathname: string
    lectures: { name: string; description: string; pathname: string }[]
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: opts.name,
        description: toMetaDescription(opts.description, 300),
        url: toAbsoluteUrl(opts.pathname),
        inLanguage: 'en',
        provider: AUTHOR,
        author: AUTHOR,
        hasPart: opts.lectures.map((lecture, index) => ({
            '@type': 'LearningResource',
            position: index + 1,
            name: lecture.name,
            description: toMetaDescription(lecture.description, 300),
            url: toAbsoluteUrl(lecture.pathname)
        }))
    }
}

/** One lecture of a course, a LearningResource that belongs to that course. */
export function lectureLd(opts: {
    name: string
    description: string
    pathname: string
    course: Crumb
}) {
    const url = toAbsoluteUrl(opts.pathname)
    return {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: opts.name,
        description: toMetaDescription(opts.description, 300),
        url,
        inLanguage: 'en',
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: AUTHOR,
        provider: AUTHOR,
        isPartOf: {
            '@type': 'Course',
            name: opts.course.name,
            url: toAbsoluteUrl(opts.course.pathname)
        }
    }
}

export function blogPostingLd(post: {
    title: string
    description: string
    pathname: string
    datePublished: string
    dateUpdated?: string
    tags: string[]
    image?: { src: string; alt: string }
}) {
    const url = toAbsoluteUrl(post.pathname)
    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        inLanguage: 'en',
        author: AUTHOR,
        publisher: AUTHOR,
        datePublished: post.datePublished,
        ...(post.dateUpdated ? { dateModified: post.dateUpdated } : {}),
        ...(post.image ? { image: toAbsoluteUrl(post.image.src) } : {}),
        keywords: post.tags.join(', '),
        isPartOf: { '@type': 'Blog', name: 'ASM Editor blog', url: toAbsoluteUrl('/blog') }
    }
}
