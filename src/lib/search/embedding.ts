import { SEARCH_MODEL, VECTOR_DIMS } from './model'

/**
 * Embedding with `mdbr-leaf-ir` ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)),
 * the same way in the build, the tests and the browser: only the ONNX Runtime session behind
 * `EmbeddingRunner` differs (`onnxruntime-node` or the WebAssembly `onnxruntime-web`).
 *
 * The model's ONNX graph already ends in its mean pooling and its 384 to 768 projection, so its
 * `sentence_embedding` output is the vector. Queries carry the model's query prompt and documents
 * carry none. A vector keeps its first 256 dimensions, renormalised, and is stored as int8.
 */

export type EmbeddingKind = 'query' | 'document'

/** What `@huggingface/tokenizers`' `Tokenizer` offers that embedding needs. */
export interface TokenizerLike {
    encode(text: string): { ids: number[] }
    token_to_id(token: string): number | undefined
}

export type EmbeddingBatch = {
    inputIds: BigInt64Array
    attentionMask: BigInt64Array
    tokenTypeIds: BigInt64Array
    /** Texts in the batch. */
    size: number
    /** Tokens per text, after padding. */
    length: number
}

/** Runs the model on one padded batch: `size` rows of `width` floats, row after row. */
export type EmbeddingRunner = (
    batch: EmbeddingBatch
) => Promise<{ data: Float32Array; width: number }>

/** Texts run together; documents are sorted by length first, so a batch pads little. */
const BATCH_SIZE = 16

/** Cuts a token sequence to the model's limit, keeping the closing `[SEP]`. */
export function truncateTokens(ids: number[], max: number, sep: number): number[] {
    if (ids.length <= max) return ids
    return [...ids.slice(0, max - 1), sep]
}

/** The first `dims` values of a vector, scaled to length 1. */
export function shorten(vector: Float32Array, dims = VECTOR_DIMS): Float32Array {
    const out = vector.slice(0, dims)
    let sum = 0
    for (let i = 0; i < out.length; i++) sum += out[i] * out[i]
    const length = Math.sqrt(sum) || 1
    for (let i = 0; i < out.length; i++) out[i] /= length
    return out
}

export class Embedder {
    private readonly sep: number

    constructor(
        private readonly tokenizer: TokenizerLike,
        private readonly run: EmbeddingRunner
    ) {
        this.sep = tokenizer.token_to_id('[SEP]') ?? 102
    }

    /** One vector per text, in order: `VECTOR_DIMS` floats of length 1. */
    async embed(texts: string[], kind: EmbeddingKind): Promise<Float32Array[]> {
        const prefix = kind === 'query' ? SEARCH_MODEL.queryPrompt : ''
        const encoded = texts.map((text, index) => ({
            index,
            ids: truncateTokens(
                this.tokenizer.encode(prefix + text).ids,
                SEARCH_MODEL.maxTokens,
                this.sep
            )
        }))
        encoded.sort((a, b) => a.ids.length - b.ids.length)
        const out: Float32Array[] = new Array(texts.length)
        for (let start = 0; start < encoded.length; start += BATCH_SIZE) {
            const batch = encoded.slice(start, start + BATCH_SIZE)
            const length = Math.max(1, ...batch.map((item) => item.ids.length))
            const inputIds = new BigInt64Array(batch.length * length)
            const attentionMask = new BigInt64Array(batch.length * length)
            batch.forEach((item, row) => {
                item.ids.forEach((id, column) => {
                    inputIds[row * length + column] = BigInt(id)
                    attentionMask[row * length + column] = 1n
                })
            })
            const { data, width } = await this.run({
                inputIds,
                attentionMask,
                tokenTypeIds: new BigInt64Array(batch.length * length),
                size: batch.length,
                length
            })
            batch.forEach((item, row) => {
                out[item.index] = shorten(data.subarray(row * width, (row + 1) * width))
            })
        }
        return out
    }
}

/**
 * The model card's int8 calibration: values are taken to lie in ±0.3. A vector of length 1 over 256
 * dimensions has values around ±0.06, so 0.3 keeps the rare large ones and still leaves 127 steps.
 */
export const QUANTIZATION_RANGE = 0.3

const SCALE = 127 / QUANTIZATION_RANGE

export function quantize(vectors: Float32Array[], dims = VECTOR_DIMS): Int8Array {
    const out = new Int8Array(vectors.length * dims)
    vectors.forEach((vector, row) => {
        for (let i = 0; i < dims; i++) {
            out[row * dims + i] = Math.max(-127, Math.min(127, Math.round(vector[i] * SCALE)))
        }
    })
    return out
}

export function dequantize(bytes: Int8Array, dims = VECTOR_DIMS): Float32Array[] {
    const count = Math.floor(bytes.length / dims)
    const out: Float32Array[] = []
    for (let row = 0; row < count; row++) {
        const vector = new Float32Array(dims)
        for (let i = 0; i < dims; i++) vector[i] = bytes[row * dims + i] / SCALE
        out.push(vector)
    }
    return out
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    }
    return dot / (Math.sqrt(na * nb) || 1)
}

/** Base64 in the browser and under node alike, in chunks so a large array does not overflow. */
export function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
    const binary = atob(text)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
}
