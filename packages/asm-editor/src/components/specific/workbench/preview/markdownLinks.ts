import { previewSignature } from '#lib/fileKinds.ts'
import { fileHead, type ProjectFile } from '#lib/projectFiles.ts'

/**
 * Where a link or an image of a Markdown File's Preview points: somewhere on the web, a heading of
 * the same document, a File of the Project, or nowhere it could go.
 */
export type MarkdownTarget =
    | { to: 'web' }
    | { to: 'heading'; slug: string }
    | { to: 'file'; path: string; slug?: string }
    | { to: 'nothing' }

const decode = (text: string) => {
    try {
        return decodeURIComponent(text)
    } catch {
        return text
    }
}

/**
 * What `reference`, a link's `href` or an image's `src` in the Markdown File at `from`, points at.
 * A URL with a scheme of its own (`https:`, `mailto:`, `data:`) or a host is the web's; any other
 * is a path in the Project, as on GitHub: from the File's folder, or with a leading slash from the
 * Project's root, never above it. The page's own address is never one, so nothing reaches it.
 */
export function markdownTarget(from: string, reference: string): MarkdownTarget {
    const trimmed = reference.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return { to: 'web' }
    const hash = trimmed.indexOf('#')
    const location = hash < 0 ? trimmed : trimmed.slice(0, hash)
    const slug = hash < 0 ? undefined : decode(trimmed.slice(hash + 1)) || undefined
    const pathPart = decode(location.split('?')[0])
    if (!pathPart) return slug ? { to: 'heading', slug } : { to: 'nothing' }
    const parts = pathPart.startsWith('/') ? [] : from.split('/').slice(0, -1)
    for (const segment of pathPart.split('/')) {
        if (segment === '' || segment === '.') continue
        if (segment !== '..') parts.push(segment)
        else if (!parts.pop()) return { to: 'nothing' }
    }
    if (!parts.length) return { to: 'nothing' }
    return { to: 'file', path: parts.join('/'), ...(slug ? { slug } : {}) }
}

/**
 * The type an image File is shown as in a Markdown Preview: what its first bytes say, as for its
 * own Preview, or an SVG written as text, which an `<img>` shows without running its scripts.
 */
export function markdownImageType(path: string, file: ProjectFile): string | undefined {
    if (file.encoding === 'plain')
        return /\.svg$/i.test(path) && /<svg[\s>]/i.test(file.content) ? 'image/svg+xml' : undefined
    let head: Uint8Array
    try {
        head = fileHead(file, 4096)
    } catch {
        return undefined
    }
    const kind = previewSignature(head)
    return kind?.preview === 'image' ? kind.mime : undefined
}
