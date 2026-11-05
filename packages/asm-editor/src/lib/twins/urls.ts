import { SITE_URL } from '#lib/seo.ts'
import { COURSES, DOCUMENTATION_LANGUAGES, type DocumentationLanguage } from '#lib/search/scope.ts'
import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
import { retiredPages } from '#lib/content/redirects.ts'

/**
 * Where each page's **Markdown twin** is
 * ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)):
 * the page's URL with `.md` appended, and for a **Documentation entry** without a page of its own,
 * its Chapter page's URL followed by its anchor. Light enough for the root layout, which names the
 * twin in every page's head.
 */

export const TWIN_EXTENSION = '.md'

/** The pages under `/learn/courses` that only redirect, which have no twin. */
const RETIRED = new Set(retiredPages().map((slugs) => `/learn/courses/${slugs.join('/')}`))

/** Each language's Chapter page paths, `syscall`, `instruction`…, without the `/all` page. */
const CHAPTER_PAGES = new Map(
    DOCUMENTATION_LANGUAGES.map((language) => [
        language,
        new Set(
            DOCUMENTATION_SITES[language].pages
                .filter((page) => page.id !== 'all')
                .map((page) => page.href.split('/').at(-1)!)
        )
    ])
)

function isLanguage(value: string | undefined): value is DocumentationLanguage {
    return (DOCUMENTATION_LANGUAGES as (string | undefined)[]).includes(value)
}

/** Whether a page has a twin, by its pathname alone: every page these patterns match does. */
function hasTwin(pathname: string): boolean {
    const parts = pathname.split('/').filter(Boolean)
    const [first, second, third] = parts
    if (first === 'documentation') {
        if (parts.length === 1) return true
        if (!isLanguage(second)) return false
        if (parts.length === 2) return true
        if (parts.length === 3) return CHAPTER_PAGES.get(second)?.has(third) ?? false
        return parts.length === 4 && third === 'instruction'
    }
    if (first === 'learn' && second === 'courses') {
        if (RETIRED.has(pathname)) return false
        return parts.length === 2 || parts.length === 3 || parts.length === 5
    }
    if (first === 'blog') {
        if (parts.length === 1) return true
        return parts.length === 3 && (second === 'posts' || second === 'tags')
    }
    return parts.length === 1 && (first === 'examples' || first === 'changelog')
}

/** A pathname without its trailing slash, `/` aside. */
export function trimPathname(pathname: string): string {
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

/** The pathname of a page's twin, or undefined for a page that has none. */
export function twinPathname(pathname: string): string | undefined {
    const trimmed = trimPathname(pathname)
    return hasTwin(trimmed) ? `${trimmed}${TWIN_EXTENSION}` : undefined
}

/** The twin of an entry: its own page's, or one level below its Chapter page. */
export function entryTwinPathname(entry: { href: string; anchor: string }): string {
    const [path, hash] = entry.href.split('#')
    return hash === undefined
        ? `${path}${TWIN_EXTENSION}`
        : `${path}/${entry.anchor}${TWIN_EXTENSION}`
}

export function absoluteUrl(pathname: string): string {
    return `${SITE_URL}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

/** The agents' own files: the root index, and each search shard's whole text. */
export const LLMS_PATHNAME = '/llms.txt'
export const LLMS_FULL_FILE = 'llms-full.txt'

export function documentationFullPathname(language: DocumentationLanguage): string {
    return `/documentation/${language}/${LLMS_FULL_FILE}`
}

export function courseFullPathname(course: string): string {
    return `/learn/courses/${course}/${LLMS_FULL_FILE}`
}

/** Every Course a search shard holds, for the `llms-full.txt` files. */
export const FULL_TEXT_COURSES = COURSES
