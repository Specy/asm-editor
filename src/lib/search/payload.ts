import { dequantize, fromBase64, quantize, toBase64 } from './embedding'
import { VECTOR_DIMS } from './model'
import type { EntryKind } from '$lib/documentation/entries'
import type { DocumentationLanguage, ShardId } from './scope'

/**
 * A shard of the index, as the build writes it and the browser reads it: the text of every search
 * unit, with its vector as int8 in one base64 string. Orama's own `save()` was ruled out, at 44.6
 * MiB of JSON for every Course against 3.1 MiB for this ([the plan](../../../docs/design/documentation-search-plan.md),
 * phase 0); the browser builds the Orama database from this instead.
 */

export const PAYLOAD_FORMAT = 1

/** A Documentation entry, as the index holds it. */
export type EntryDocument = {
    /** The entry's id, `<language>/<chapter>/<entry>`. */
    id: string
    language: DocumentationLanguage
    chapter: string
    chapterTitle: string
    entryKind: EntryKind
    title: string
    /** Whether the title is code, where the kind does not settle it. */
    codeName?: boolean
    /** What an exact-name search matches, lowercase. */
    names: string[]
    signature: string
    summary: string
    text: string
    code: string
    href: string
}

/** A Lecture section, as the index holds it. */
export type SectionDocument = {
    /** `<course>/<module>/<lecture>#<slug>`, with an empty slug for the text before the first heading. */
    id: string
    course: string
    courseName: string
    lectureName: string
    /** The section's heading, or the Lecture's name for its opening text. */
    title: string
    href: string
    /** The section's markdown without its heading, which the panel renders when a card expands. */
    markdown: string
    code: string
}

/** A stretch of a Lecture section's prose, embedded on its own: long sections have several. */
export type WindowDocument = {
    /** Index into the shard's `sections`. */
    section: number
    text: string
}

export type ShardPayload = {
    format: typeof PAYLOAD_FORMAT
    shard: ShardId
    /** The model revision the vectors were made with, or `null` when the shard has words only. */
    model: string | null
    dims: number
    entries: EntryDocument[]
    sections: SectionDocument[]
    windows: WindowDocument[]
    /** int8, `dims` per unit: every entry, then every window. `null` with `model`. */
    vectors: string | null
}

export type ShardContent = Pick<ShardPayload, 'shard' | 'entries' | 'sections' | 'windows'>

/** How many vectors a shard holds: one per entry and one per window. */
export function unitCount(content: Pick<ShardPayload, 'entries' | 'windows'>): number {
    return content.entries.length + content.windows.length
}

export function createPayload(
    content: ShardContent,
    vectors: Float32Array[] | null,
    model: string | null
): ShardPayload {
    if (vectors && vectors.length !== unitCount(content)) {
        throw new Error(
            `shard ${content.shard}: ${vectors.length} vectors for ${unitCount(content)} units`
        )
    }
    const bytes = vectors ? quantize(vectors) : null
    return {
        format: PAYLOAD_FORMAT,
        ...content,
        model: vectors ? model : null,
        dims: VECTOR_DIMS,
        vectors: bytes ? toBase64(new Uint8Array(bytes.buffer)) : null
    }
}

/** The shard's vectors in unit order, or `null` when it has words only. */
export function payloadVectors(payload: ShardPayload): Float32Array[] | null {
    if (!payload.vectors) return null
    const bytes = fromBase64(payload.vectors)
    return dequantize(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), payload.dims)
}

export function isPayload(value: unknown): value is ShardPayload {
    if (typeof value !== 'object' || value === null) return false
    const payload = value as Partial<ShardPayload>
    return (
        payload.format === PAYLOAD_FORMAT &&
        typeof payload.shard === 'string' &&
        Array.isArray(payload.entries) &&
        Array.isArray(payload.sections) &&
        Array.isArray(payload.windows)
    )
}
