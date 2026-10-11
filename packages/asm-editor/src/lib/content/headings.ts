/**
 * The ids of a Lecture's headings. The renderer puts them on the page and the search index links
 * to them (a **Lecture section** opens at its heading), so both slug the headings here, in the
 * same order: every second- and third-level heading, top to bottom.
 */

/**
 * Names DOMPurify strips from an `id` with its default `SANITIZE_DOM`, because the browser would
 * expose an element with that id as a property of `document` or of a form ("DOM clobbering"):
 * every lowercase property of both, as jsdom lists them, and the ones browsers add. A heading
 * slugged to one of these keeps a suffix instead of losing its id.
 */
const CLOBBERING_NAMES = new Set([
    // From jsdom, 2026-10-01.
    ...'action after anchors append applets attributes before blur body charset children clear click close closest constructor contains cookie dataset dir doctype draggable elements embeds enctype evaluate focus forms head hidden id images implementation lang length links location matches method name nonce normalize open plugins prefix prepend referrer remove reset role scripts slot style submit target title translate write writeln'.split(
        ' '
    ),
    // Lowercase properties that browsers have and jsdom does not.
    ...'all autocomplete autofocus domain encoding fonts fullscreen inert popover spellcheck timeline'.split(
        ' '
    )
])

/** Event handler properties (`onclick`, `onload`…), which are all clobbering names too. */
function isHandlerName(slug: string): boolean {
    return /^on[a-z]+$/.test(slug)
}

/** A heading's text as an id: lowercase, inline code kept as text, punctuation dropped. */
export function headingSlug(text: string): string {
    const slug = text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    if (!slug) return 'section'
    if (CLOBBERING_NAMES.has(slug) || isHandlerName(slug)) return `${slug}-section`
    return slug
}

/** Slugs one document's headings, in order, numbering a repeat: `exercises`, `exercises-2`. */
export class HeadingSlugger {
    private readonly seen = new Map<string, number>()

    slug(text: string): string {
        const base = headingSlug(text)
        const count = this.seen.get(base) ?? 0
        this.seen.set(base, count + 1)
        if (count === 0) return base
        let candidate = `${base}-${count + 1}`
        while (this.seen.has(candidate)) candidate = `${candidate}-1`
        this.seen.set(candidate, 1)
        return candidate
    }
}
