import type { DocumentationEntry } from '#lib/documentation/entries.ts'
import type { EntryDocument } from '#lib/search/payload.ts'

/**
 * An entry the index knows but the panel's entries do not: shown from what the index holds, its
 * **Instruction category** included, so its search result row still names it.
 */
export function fromIndex(document: EntryDocument): DocumentationEntry {
    return {
        id: document.id,
        language: document.language,
        chapter: document.chapter,
        kind: document.entryKind,
        title: document.title,
        codeName: document.codeName,
        names: document.names,
        signature: document.signature || undefined,
        ...(document.category ? { category: document.category } : {}),
        summary: document.summary,
        href: document.href,
        anchor: document.id,
        view: { type: 'markdown', markdown: document.text },
        searchText: document.text
    }
}
