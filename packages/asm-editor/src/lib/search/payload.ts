import { dequantize, fromBase64, quantize, toBase64 } from './embedding'
import { VECTOR_DIMS } from './model'
import type { EntryKind } from '#lib/documentation/entryKinds.ts'
import type { InstructionCategory } from '#lib/documentation/instructions/categories.ts'
import type { DocumentationLanguage, ShardId } from './scope'

/**
 * A shard of the index, as the build writes it and the browser reads it: the text of every search
 * unit, with its vector as int8 in one base64 string. Orama's own `save()` was ruled out, at 44.6
 * MiB of JSON for every Course against 3.1 MiB for this ([the plan](../../../../../docs/design/documentation-search-plan.md),
 * phase 0); the browser builds the Orama database from this instead.
 */

/**
 * Raised whenever a reader of an older shard would misread a newer one. Format 2 added an entry's
 * questions, the vectors of a long entry's further windows (`entryWindows`) and a Documentation
 * shard's word-like names ([the plan](../../../../../docs/design/plain-english-search-plan.md),
 * phase 2). A page left open across the deploy that changes it has to be reloaded.
 */
export const PAYLOAD_FORMAT = 2

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
    /**
     * An instruction's **Instruction category**, matched together with the Chapter's title and named
     * on its result row. Optional, so `PAYLOAD_FORMAT` stays: a shard without it still reads, and
     * the vectors, made without it, are unchanged.
     */
    category?: InstructionCategory
    summary: string
    text: string
    /** An authored description, read with a lower weight than `text`. Optional, as `category` is. */
    detail?: string
    /**
     * Its **Entry questions** ([ADR 0079](../../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)),
     * read first by its vector. Left out when it has none.
     */
    questions?: string[]
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

/**
 * A further vector of a Documentation entry longer than the model reads, made from the text past
 * what its first vector read. It has no words of its own, so the shard carries no text for it:
 * the build embeds the text, the browser needs only the vector.
 */
export type EntryWindowDocument = {
    /** Index into the shard's `entries`. */
    entry: number
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
    /** The further vectors of long entries, in entry order. Empty in a Course's shard. */
    entryWindows: EntryWindowDocument[]
    /**
     * A Documentation shard's entry names that the Lectures use as ordinary words (`stop`, `loop`,
     * `test`): in a question they count as words, not names. Empty in a Course's shard.
     */
    wordLikeNames: string[]
    /**
     * int8, `dims` per vector: each entry's first, then `entryWindows`, then `windows` (no shard has
     * both entries and Lecture windows). `null` with `model`.
     */
    vectors: string | null
}

/** What a shard holds besides its vectors; the lists a shard may lack are empty by default. */
export type ShardContent = Pick<ShardPayload, 'shard' | 'entries' | 'sections' | 'windows'> &
    Partial<Pick<ShardPayload, 'entryWindows' | 'wordLikeNames'>>

/** How many vectors a shard holds: one per entry, per entry window and per Lecture window. */
export function unitCount(content: ShardContent): number {
    return content.entries.length + (content.entryWindows?.length ?? 0) + content.windows.length
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
        entryWindows: content.entryWindows ?? [],
        wordLikeNames: content.wordLikeNames ?? [],
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
        Array.isArray(payload.windows) &&
        Array.isArray(payload.entryWindows) &&
        Array.isArray(payload.wordLikeNames)
    )
}

/**
 * Whether a value is a shard of another format than this code reads: one written before or after
 * the deploy that loaded the page, which a reload brings in step.
 */
export function isOtherFormat(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false
    const format = (value as { format?: unknown }).format
    return typeof format === 'number' && format !== PAYLOAD_FORMAT
}
