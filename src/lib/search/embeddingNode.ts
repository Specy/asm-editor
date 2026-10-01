import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Tokenizer } from '@huggingface/tokenizers'
import { Embedder } from './embedding'
import { SEARCH_MODEL, SEARCH_MODEL_DIRECTORY } from './model'

/**
 * The model under node, for the build's index and the tests: `onnxruntime-node` over the files
 * `scripts/search-model.mjs` keeps in `.cache/`. Never imported by browser code; import it
 * dynamically, so that a page that only renders never loads ONNX Runtime.
 */

export function modelDirectory(): string {
    // The build and the tests both run from the repository root, as `getters.ts` assumes too.
    return join(process.cwd(), SEARCH_MODEL_DIRECTORY)
}

export function hasModelFiles(directory = modelDirectory()): boolean {
    return Object.values(SEARCH_MODEL.files).every((file) => existsSync(join(directory, file.path)))
}

let shared: Promise<Embedder> | null = null

/** One session per process: loading the model takes a moment and a fair amount of memory. */
export function nodeEmbedder(directory = modelDirectory()): Promise<Embedder> {
    shared ??= createNodeEmbedder(directory)
    return shared
}

async function createNodeEmbedder(directory: string): Promise<Embedder> {
    const ort = await import('onnxruntime-node')
    const read = (path: string) => JSON.parse(readFileSync(join(directory, path), 'utf8'))
    const tokenizer = new Tokenizer(
        read(SEARCH_MODEL.files.tokenizer.path),
        read(SEARCH_MODEL.files.tokenizerConfig.path)
    )
    // The graph names its weights file by a path relative to itself, which is where it is on disk.
    const session = await ort.InferenceSession.create(
        join(directory, SEARCH_MODEL.files.model.path)
    )
    return new Embedder(tokenizer, async (batch) => {
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
