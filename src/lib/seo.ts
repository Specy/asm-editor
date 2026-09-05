export const SITE_URL = 'https://asm-editor.specy.app'

export const AUTHOR = {
    '@type': 'Person',
    name: 'Specy',
    url: 'https://specy.app',
    sameAs: ['https://github.com/Specy']
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
        sameAs: ['https://github.com/Specy/asm-editor']
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
