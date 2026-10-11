export const SITE_URL = 'https://asm-editor.specy.app'

/** The legal name is what a citation, an academic profile and a search engine can
 *  reconcile; `alternateName` keeps the handle the repo and the apps are known by, so
 *  the two identities resolve to one person instead of competing. */
export const AUTHOR = {
    '@type': 'Person',
    name: 'Specy',
    url: 'https://specy.app',
    sameAs: ['https://github.com/Specy']
} as const

/** The peer-reviewed description of this app. Emitted as the SoftwareApplication's
 *  `citation` so the tool and the paper are one connected entity to a crawler, rather
 *  than two artefacts that happen to share a name. */
export const PAPER = {
    '@type': 'ScholarlyArticle',
    name: 'ASM Editor: Understanding Language Abstractions Through Assembly Programming',
    author: [
        { '@type': 'Person', name: 'Enrico Menichelli' },
        { '@type': 'Person', name: 'Luca Forlizzi' }
    ],
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
            'Write, learn and run M68K, MIPS, RISC-V, X86 and Z80 assembly code in your browser. View registers and memory, step and undo the execution.',
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
        headline: `${opts.name.toUpperCase()} — ${opts.architecture} instruction`,
        description: toMetaDescription(opts.description, 300),
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: AUTHOR,
        publisher: AUTHOR,
        isPartOf: {
            '@type': 'TechArticle',
            name: `${opts.architecture} instruction set reference`,
            url: toAbsoluteUrl(opts.pathname.replace(/\/[^/]+$/, ''))
        },
        proficiencyLevel: 'Beginner'
    }
}
