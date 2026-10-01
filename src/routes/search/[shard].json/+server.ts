import { error } from '@sveltejs/kit'
import { ALL_SHARDS, isShardId } from '$lib/search/scope'
import type { EntryGenerator, RequestHandler } from './$types'

/**
 * One shard of the search index, written at build time as `/search/<shard>.json`
 * ([ADR 0026](../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
 * The build embeds every unit with the model in `.cache/`, reusing the vectors of text that has not
 * changed; on the dev server the same happens on the first request for a shard.
 */

export const prerender = true

export const entries: EntryGenerator = () => ALL_SHARDS.map((shard) => ({ shard }))

export const GET: RequestHandler = async ({ params }) => {
    if (!isShardId(params.shard)) error(404, 'No such shard')
    // Imported here, so that ONNX Runtime and the course reader load only for this route.
    const { buildShard } = await import('$lib/search/shards')
    const payload = await buildShard(params.shard)
    return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' }
    })
}
