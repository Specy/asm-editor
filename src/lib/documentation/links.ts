import type { Chapter, DocumentationEntry } from './entries'

/**
 * Where a link inside the Documentation leads, among its own entries: the Documentation panel
 * follows such a link without leaving the page ([the design record](../../../docs/design/documentation-search.md),
 * Links between entries stay in the panel), which is also why it may follow one in an Exam.
 */
export type DocumentationTarget =
    { kind: 'entry'; entry: DocumentationEntry } | { kind: 'chapter'; chapter: Chapter }

export function resolveDocumentationLink(
    href: string,
    chapters: Chapter[],
    from?: DocumentationEntry
): DocumentationTarget | null {
    const [rawPath, hash = ''] = href.split('#')
    const path = rawPath.replace(/\/+$/, '')
    const anchor = decodeURIComponent(hash)
    if (!path) {
        // An anchor on the same page: an entry of the Chapter the link was written in.
        const chapter = chapters.find((chapter) => chapter.id === from?.chapter)
        const entry = chapter?.entries.find((entry) => entry.anchor === anchor)
        return entry ? { kind: 'entry', entry } : null
    }
    const instruction = /^\/documentation\/[^/]+\/instruction\/([^/]+)$/.exec(path)
    if (instruction) {
        const name = decodeURIComponent(instruction[1]).toLowerCase()
        for (const chapter of chapters) {
            const entry = chapter.entries.find(
                (entry) =>
                    entry.kind === 'instruction' &&
                    (entry.title.toLowerCase() === name || entry.names.includes(name))
            )
            if (entry) return { kind: 'entry', entry }
        }
        return null
    }
    const chapter = chapters.find((chapter) => chapter.href === path)
    if (!chapter) return null
    if (!anchor) return { kind: 'chapter', chapter }
    const entry = chapter.entries.find((entry) => entry.anchor === anchor)
    return entry ? { kind: 'entry', entry } : { kind: 'chapter', chapter }
}
