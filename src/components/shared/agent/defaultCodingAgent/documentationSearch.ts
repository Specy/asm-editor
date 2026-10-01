import type { SearchResult } from '$lib/search/engine'
import {
    documentationLanguageOf,
    scopeForAgent,
    type AgentSearchPlace,
    type SearchScope
} from '$lib/search/scope'
import type { DocumentationSearchAnswer, DocumentationSearchHit, SupportedLanguage } from './types'

/**
 * What the `search_documentation` tool runs in the browser: the page's search, in the Search scope
 * of the place the agent runs in ([the design record](../../../../../docs/design/documentation-search.md),
 * Settled while planning). Kept apart from `tools.ts`, which tests run under node with a fake.
 */

/** Characters of an entry's text, or a section's markdown, that a result carries. */
const TEXT_BUDGET = 1600

function describe(scope: SearchScope): string {
    if (scope.kind === 'courses') return 'every course'
    const name = scope.language.toUpperCase()
    return scope.lectures
        ? `the ${name} documentation, its course and the general course`
        : `the ${name} documentation`
}

function cut(text: string): string {
    return text.length <= TEXT_BUDGET ? text : `${text.slice(0, TEXT_BUDGET).trimEnd()}…`
}

function hitOf(result: SearchResult): DocumentationSearchHit {
    if (result.kind === 'entry') {
        const entry = result.entry
        return {
            kind: 'documentation',
            title: entry.signature ? `${entry.title} ${entry.signature}` : entry.title,
            where: `${entry.language.toUpperCase()} documentation › ${entry.chapterTitle}`,
            summary: entry.summary,
            text: cut(entry.text),
            href: entry.href
        }
    }
    const section = result.section
    return {
        kind: 'lecture',
        title: section.title,
        where: `${section.courseName} › ${section.lectureName}`,
        summary: result.excerpt,
        text: cut(section.markdown),
        href: section.href
    }
}

export async function searchForAgent(
    place: AgentSearchPlace,
    query: string,
    requested: SupportedLanguage | null,
    editor: SupportedLanguage | null,
    limit: number
): Promise<DocumentationSearchAnswer> {
    const scope = scopeForAgent(
        place,
        requested ? documentationLanguageOf(requested) : null,
        editor ? documentationLanguageOf(editor) : null
    )
    if (!scope) {
        throw new Error('This page has no language of its own: say which one to search.')
    }
    const { searchClient } = await import('$lib/search/searchClient.svelte')
    // An agent that searches once will search again: let the model load for the next query.
    void searchClient.loadModel()
    const answer = await searchClient.search(scope, query, limit)
    return { mode: answer.mode, searched: describe(scope), results: answer.results.map(hitOf) }
}
