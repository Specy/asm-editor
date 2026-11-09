import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { prepareSearch, SearchEngine, type SearchResult } from './engine'
import { hasModelFiles, nodeEmbedder } from './embeddingNode'
import type { ShardPayload } from './payload'
import {
    ALL_SHARDS,
    COURSES_SCOPE,
    languageScope,
    shardsOf,
    SITE_SCOPE,
    type DocumentationLanguage,
    type SearchScope,
    type ShardId
} from './scope'
import { buildShard } from './shards'

/**
 * Golden queries ([the plan](../../../../../docs/design/documentation-search-plan.md), phase 3): for each
 * Search scope, questions a reader asks and the entry or Lecture section that must answer them.
 * The scope is built the way the build builds it, so this searches exactly what the browser
 * downloads. Words-only expectations always run; the ones marked `meaning` need the model in
 * `.cache/` (`pnpm run search:model`), as every hybrid ranking does.
 *
 * Each query is also searched in an engine holding every shard, loaded in another order, as the
 * browser's one worker holds what every search box has loaded: a scope's results must be the
 * same there, score for score.
 */

type Golden = {
    scope: DocumentationLanguage | 'courses' | 'site'
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

/** Each shard, built once for every scope that reads it. */
const built = new Map<ShardId, Promise<ShardPayload>>()

function shard(id: ShardId): Promise<ShardPayload> {
    let payload = built.get(id)
    if (!payload) built.set(id, (payload = buildShard(id)))
    return payload
}

let everyShard: SearchEngine

beforeAll(async () => {
    everyShard = SearchEngine.create()
    for (const id of [...ALL_SHARDS].reverse()) await everyShard.add(await shard(id))
}, 600_000)

describe.each(Object.entries(goldens))('golden queries %s', (_, golden) => {
    const scope: SearchScope =
        golden.scope === 'courses'
            ? COURSES_SCOPE
            : golden.scope === 'site'
              ? SITE_SCOPE
              : languageScope(golden.scope)
    let engine: SearchEngine

    it('builds the scope', { timeout: 600_000 }, async () => {
        engine = SearchEngine.create()
        for (const id of shardsOf(scope)) await engine.add(await shard(id))
        expect(engine.covers(scope)).toBe(true)
    })

    describe.each(withModel ? ['words', 'hybrid'] : ['words'])('%s', (mode) => {
        const hybrid = mode === 'hybrid'
        const queries = golden.queries.filter((query) => !query.meaning || hybrid)
        it.each(queries.map((query) => [query.query, query] as const))(
            'answers %s',
            { timeout: 60_000 },
            async (_, query) => {
                // prepared as the worker prepares it: modifiers read, the text the model reads
                const { embed, options } = prepareSearch(engine, query.query, scope)
                const vector = hybrid
                    ? (await (await nodeEmbedder()).embed([embed], 'query'))[0]
                    : null
                const results = await engine.search(query.query, { ...options, vector, limit: 10 })
                const ids = results.map(idOf)
                const elsewhere = await everyShard.search(query.query, {
                    ...prepareSearch(everyShard, query.query, scope).options,
                    vector,
                    limit: 10
                })
                const scored = (list: SearchResult[]) =>
                    list.map((result) => [idOf(result), result.score])
                expect(scored(elsewhere), 'the same with every shard loaded').toEqual(
                    scored(results)
                )
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
})
