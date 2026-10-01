import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dequantize, quantize } from './embedding'
import { hasModelFiles, nodeEmbedder } from './embeddingNode'
import { SEARCH_MODEL } from './model'

/**
 * Every document's vector, kept in `.cache/search-vectors/<revision>/` under a hash of the text it
 * was made from ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)),
 * so a build only embeds what changed since the last one. CI keeps the directory between runs.
 * Node only: the build's endpoint and the tests import it, never a page.
 */

export function vectorCacheDirectory(): string {
    return join(process.cwd(), '.cache', 'search-vectors', SEARCH_MODEL.revision)
}

function keyOf(text: string): string {
    return createHash('sha256').update('document\0').update(text).digest('hex')
}

/**
 * The vectors of these document texts, in order, or `null` when the model files are not in
 * `.cache/` (a dev server or a test run without the network): the shard then has words only.
 */
export async function documentVectors(texts: string[]): Promise<Float32Array[] | null> {
    if (texts.length === 0) return []
    if (!hasModelFiles()) return null
    const directory = vectorCacheDirectory()
    mkdirSync(directory, { recursive: true })
    const out: (Float32Array | null)[] = texts.map((text) => {
        const path = join(directory, `${keyOf(text)}.i8`)
        if (!existsSync(path)) return null
        const bytes = readFileSync(path)
        return dequantize(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length))[0] ?? null
    })
    const missing = out.flatMap((vector, index) => (vector ? [] : [index]))
    if (missing.length > 0) {
        const embedder = await nodeEmbedder()
        const started = Date.now()
        const vectors = await embedder.embed(
            missing.map((index) => texts[index]),
            'document'
        )
        missing.forEach((index, i) => {
            out[index] = vectors[i]
            const path = join(directory, `${keyOf(texts[index])}.i8`)
            const temporary = `${path}.${process.pid}.tmp`
            writeFileSync(temporary, quantize([vectors[i]]))
            renameSync(temporary, path)
        })
        if (missing.length > 50) {
            console.log(
                `search: embedded ${missing.length} documents in ${Date.now() - started} ms`
            )
        }
    }
    return out as Float32Array[]
}
