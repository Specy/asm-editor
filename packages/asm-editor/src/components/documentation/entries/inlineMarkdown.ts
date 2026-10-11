/**
 * One line of markdown as HTML, for the short values of an entry's fields (a syscall's arguments,
 * a port's read side): code, emphasis and links only. A full MarkdownRenderer per field would boot
 * Carta dozens of times on a Chapter page for text that never has more than this.
 *
 * Everything is escaped first, so only the markup built here reaches the page, and a link may only
 * point at our own pages, an anchor or the web.
 */

const ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

function safeHref(href: string): string | null {
    return /^(\/|#|https?:\/\/)/.test(href) ? href : null
}

/** Marks where a code span was taken out: a private-use character no text here contains. */
const SLOT = '\uE000'

export function inlineMarkdown(markdown: string): string {
    const codes: string[] = []
    // Code first, so nothing inside it is read as emphasis or a link.
    let html = escape(markdown).replace(/`([^`]+)`/g, (_, code: string) => {
        codes.push(`<code>${code}</code>`)
        return `${SLOT}${codes.length - 1}${SLOT}`
    })
    html = html
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, href: string) => {
            const safe = safeHref(href.replace(/&amp;/g, '&'))
            return safe ? `<a href="${escape(safe)}">${text}</a>` : text
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
    return html.replace(
        new RegExp(`${SLOT}(\\d+)${SLOT}`, 'g'),
        (_, index: string) => codes[Number(index)]
    )
}
