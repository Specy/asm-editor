/// <reference lib="webworker" />
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { Embedder } from './embedding'
import { SearchEngine, type SearchResult } from './engine'
import { SEARCH_MODEL, type SearchModelUrls } from './model'
import { isPayload } from './payload'
import type { SearchScope, ShardId } from './scope'

/**
 * Search, off the main thread ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)):
 * the Orama database of every shard loaded so far, and the model that turns a query into a vector.
 * ONNX Runtime is the CPU-only WebAssembly build, one thread unless the page is cross-origin
 * isolated; the WebGPU one is a 27 MiB file Cloudflare Pages cannot serve.
 */

export type WorkerRequest =
    | { id: number; type: 'load-shards'; shards: { shard: ShardId; url: string }[] }
    | { id: number; type: 'load-model'; urls: SearchModelUrls }
    | { id: number; type: 'search'; scope: SearchScope; query: string; limit: number }

export type SearchAnswer = { results: SearchResult[]; mode: 'text' | 'hybrid' }

export type WorkerResponse =
    { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string }

const engine = SearchEngine.create()
let embedder: Embedder | null = null
const loading = new Map<ShardId, Promise<void>>()

async function loadShard(shard: ShardId, url: string): Promise<void> {
    if (engine.has(shard)) return
    let pending = loading.get(shard)
    if (!pending) {
        pending = (async () => {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
            const payload: unknown = await response.json()
            if (!isPayload(payload)) throw new Error(`${url} is not a search shard`)
            await engine.add(payload)
        })()
        loading.set(shard, pending)
        pending.catch(() => loading.delete(shard))
    }
    return pending
}

async function fetchBytes(url: string): Promise<Uint8Array> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
}

async function loadModel(urls: SearchModelUrls): Promise<void> {
    if (embedder) return
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
    ort.env.wasm.numThreads = self.crossOriginIsolated ? 2 : 1
    const [model, weights, tokenizerJson, tokenizerConfig] = await Promise.all([
        fetchBytes(urls.model),
        fetchBytes(urls.weights),
        fetch(urls.tokenizer).then((response) => response.json()),
        fetch(urls.tokenizerConfig).then((response) => response.json())
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

async function search(scope: SearchScope, query: string, limit: number): Promise<SearchAnswer> {
    const vector =
        embedder && engine.hasVectors(scope) && query.trim()
            ? (await embedder.embed([query], 'query'))[0]
            : null
    const results = await engine.search(query, { scope, vector, limit })
    return { results, mode: vector ? 'hybrid' : 'text' }
}

async function handle(request: WorkerRequest): Promise<unknown> {
    switch (request.type) {
        case 'load-shards':
            await Promise.all(request.shards.map(({ shard, url }) => loadShard(shard, url)))
            return null
        case 'load-model':
            await loadModel(request.urls)
            return null
        case 'search':
            return search(request.scope, request.query, request.limit)
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
                error: error instanceof Error ? error.message : String(error)
            } satisfies WorkerResponse)
    )
}
