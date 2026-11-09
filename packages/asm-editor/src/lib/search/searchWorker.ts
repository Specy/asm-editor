/// <reference lib="webworker" />
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { Embedder } from './embedding'
import { prepareSearch, SearchEngine, type SearchResult } from './engine'
import { SEARCH_MODEL, type SearchModelUrls } from './model'
import { OutdatedIndexError } from './outdatedIndex'
import { isOtherFormat, isPayload } from './payload'
import type { SearchScope, ShardId } from './scope'

/**
 * Search, off the main thread ([ADR 0026](../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)):
 * the Orama database of every shard loaded so far, and the model that turns a query into a vector.
 * ONNX Runtime is the CPU-only WebAssembly build, one thread unless the page is cross-origin
 * isolated; the WebGPU one is a 27 MiB file Cloudflare Pages cannot serve.
 *
 * The index is fetched at high priority and the model's files at low, so that over HTTP/2 and
 * HTTP/3 a shard asked for while the model downloads still comes first: the words are what a
 * search needs at once, the model only improves the order later. Each shard is a request of its
 * own, answered when it is in, so a search can start from the shards already there.
 */

export type WorkerRequest =
    | { id: number; type: 'load-shard'; shard: ShardId; url: string }
    | { id: number; type: 'load-model'; urls: SearchModelUrls }
    | {
          id: number
          type: 'search'
          scope: SearchScope
          query: string
          limit: number
          /** The names the Workbench's Documentation panel favours (`SearchEngine.search`). */
          favour?: string[]
      }

export type SearchAnswer = { results: SearchResult[]; mode: 'text' | 'hybrid' }

export type WorkerResponse =
    /**
     * The worker's first message, once its listener exists: a request posted before it has
     * nothing listening for it yet, so the client holds requests until it arrives.
     */
    | { type: 'ready' }
    | { id: number; ok: true; value: unknown }
    /** `outdated`: a shard of another format, which only a reload of the page fixes. */
    | { id: number; ok: false; error: string; outdated?: boolean }

const engine = SearchEngine.create()
let embedder: Embedder | null = null
const loading = new Map<ShardId, Promise<void>>()

async function loadShard(shard: ShardId, url: string): Promise<void> {
    if (engine.has(shard)) return
    let pending = loading.get(shard)
    if (!pending) {
        pending = (async () => {
            const response = await fetch(url, { priority: 'high' })
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
            const payload: unknown = await response.json()
            if (isOtherFormat(payload)) throw new OutdatedIndexError()
            if (!isPayload(payload)) throw new Error(`${url} is not a search shard`)
            await engine.add(payload)
        })()
        loading.set(shard, pending)
        pending.catch(() => loading.delete(shard))
    }
    return pending
}

/** One of the model's files, behind any shard asked for meanwhile. */
async function fetchModelFile(url: string): Promise<Response> {
    const response = await fetch(url, { priority: 'low' })
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return response
}

async function fetchBytes(url: string): Promise<Uint8Array> {
    return new Uint8Array(await (await fetchModelFile(url)).arrayBuffer())
}

async function loadModel(urls: SearchModelUrls): Promise<void> {
    if (embedder) return
    // ONNX Runtime fetches its WebAssembly itself, streamed, which is the only way Chrome keeps the
    // compiled code for the next visit; handed over as bytes, it would be compiled every time
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
    ort.env.wasm.numThreads = self.crossOriginIsolated ? 2 : 1
    const [model, weights, tokenizerJson, tokenizerConfig] = await Promise.all([
        fetchBytes(urls.model),
        fetchBytes(urls.weights),
        fetchModelFile(urls.tokenizer).then((response) => response.json()),
        fetchModelFile(urls.tokenizerConfig).then((response) => response.json())
    ])
    const session = await ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
        // The graph names its weights by the file name it was exported with, not our hashed URL.
        externalData: [{ path: SEARCH_MODEL.files.weights.path.split('/').pop()!, data: weights }]
    })
    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig)
    embedder = new Embedder(tokenizer, async (batch) => {
        const shape = [batch.size, batch.length]
        const output = await session.run({
            input_ids: new ort.Tensor('int64', batch.inputIds, shape),
            attention_mask: new ort.Tensor('int64', batch.attentionMask, shape),
            token_type_ids: new ort.Tensor('int64', batch.tokenTypeIds, shape)
        })
        const embedding = output.sentence_embedding
        return { data: embedding.data as Float32Array, width: embedding.dims[1] }
    })
}

async function search(
    scope: SearchScope,
    query: string,
    limit: number,
    favour: string[] | undefined
): Promise<SearchAnswer> {
    // the golden queries prepare a query the same way, so they test what this does
    const { embed, options } = prepareSearch(engine, query, scope)
    const vector =
        embedder && engine.hasVectors(scope) && embed.trim()
            ? (await embedder.embed([embed], 'query'))[0]
            : null
    const results = await engine.search(query, { ...options, vector, limit, favour })
    return { results, mode: vector ? 'hybrid' : 'text' }
}

async function handle(request: WorkerRequest): Promise<unknown> {
    switch (request.type) {
        case 'load-shard':
            await loadShard(request.shard, request.url)
            return null
        case 'load-model':
            await loadModel(request.urls)
            return null
        case 'search':
            return search(request.scope, request.query, request.limit, request.favour)
    }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data
    handle(request).then(
        (value) => self.postMessage({ id: request.id, ok: true, value } satisfies WorkerResponse),
        (error: unknown) =>
            self.postMessage({
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
                outdated: error instanceof OutdatedIndexError
            } satisfies WorkerResponse)
    )
}

self.postMessage({ type: 'ready' } satisfies WorkerResponse)
