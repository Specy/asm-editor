import { describe, expect, it } from 'vitest'
import { SearchEngine, type SearchResult } from './engine'
import { hasModelFiles, nodeEmbedder } from './embeddingNode'
import {
    COURSES_SCOPE,
    languageScope,
    shardsOf,
    type DocumentationLanguage,
    type SearchScope
} from './scope'
import { buildShard } from './shards'

/**
 * Golden queries ([the plan](../../../docs/design/documentation-search-plan.md), phase 3): for each
 * Search scope, questions a reader asks and the entry or Lecture section that must answer them.
 * The scope is built the way the build builds it, so this searches exactly what the browser
 * downloads. Words-only expectations always run; the ones marked `meaning` need the model in
 * `.cache/` (`npm run search:model`), as every hybrid ranking does.
 */

type Golden = {
    scope: DocumentationLanguage | 'courses'
    queries: {
        query: string
        /** The id that must come first. */
        first?: string
        /** An id, or any of several, that must be within the first `top` results. */
        expect?: string | string[]
        top?: number
        /** Only expected of a search by meaning. */
        meaning?: boolean
    }[]
}

const goldens = import.meta.glob<Golden>('./golden/*.json', { eager: true, import: 'default' })
const withModel = hasModelFiles()

function idOf(result: SearchResult): string {
    return result.kind === 'entry' ? result.entry.id : result.section.id
}

describe.each(Object.entries(goldens))('golden queries %s', (_, golden) => {
    const scope: SearchScope =
        golden.scope === 'courses' ? COURSES_SCOPE : languageScope(golden.scope)
    let engine: SearchEngine

    it('builds the scope', { timeout: 600_000 }, async () => {
        engine = SearchEngine.create()
        for (const shard of shardsOf(scope)) await engine.add(await buildShard(shard))
        expect(engine.covers(scope)).toBe(true)
    })

    it.each(golden.queries.map((query) => [query.query, query] as const))(
        'answers %s',
        { timeout: 60_000 },
        async (_, query) => {
            if (query.meaning && !withModel) return
            const vector = withModel
                ? (await (await nodeEmbedder()).embed([query.query], 'query'))[0]
                : null
            const ids = (await engine.search(query.query, { scope, vector, limit: 10 })).map(idOf)
            if (query.first) expect(ids[0], ids.join('\n')).toBe(query.first)
            if (query.expect) {
                const wanted = Array.isArray(query.expect) ? query.expect : [query.expect]
                const top = ids.slice(0, query.top ?? 3)
                expect(
                    wanted.some((id) => top.includes(id)),
                    `${wanted.join(' or ')} in\n${top.join('\n')}`
                ).toBe(true)
            }
        }
    )
})
