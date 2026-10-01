import { create, insertMultiple, search as oramaSearch, type AnyOrama } from '@orama/orama'
import { VECTOR_DIMS } from './model'
import {
    payloadVectors,
    type EntryDocument,
    type SectionDocument,
    type ShardPayload
} from './payload'
import { shardsOf, type SearchScope, type ShardId } from './scope'

/**
 * Hybrid search over the loaded shards ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)):
 * Orama ranks by words and, when the caller has a query vector, by meaning too. Two fixed rules
 * then apply ([the design record](../../../docs/design/documentation-search.md), Ranking): an entry
 * named exactly what was typed comes first, and a Lecture section appears once, at its best
 * window. The same order serves the panel, the palette and the agents.
 */

/** Values tuned against the golden queries in `golden/`; see the plan's phase 3. */
export const RANKING = {
    boost: { names: 3, title: 2, context: 1.2, text: 1, code: 0.4 },
    /** The least cosine similarity a vector match needs. Right answers measured 0.30 to 0.48. */
    similarity: 0.15,
    /** Hits asked of Orama before the fixed rules, so that collapsing windows still fills a page. */
    candidates: 80,
    /**
     * A Lecture section's score is multiplied by this. A lecture uses many words of every topic it
     * touches, so on words alone it matches almost anything; the Documentation is what a search is
     * mostly for, and a section comes before an entry only when it answers much better.
     */
    sectionWeight: 0.75,
    /**
     * The same for an x86 Extensions entry, a catch-all listing every instruction of a NASM section
     * that has no page of its own, names and summaries: it too matches almost any word. Its exact
     * names still put it first (`vaddpd`).
     */
    extensionGroupWeight: 0.6
}

/**
 * Words that carry no meaning of their own in a question. Left in, a forgiving full-text search
 * matched "the" to `tne` and "an" to `$a0`, and those entries topped every question asked in words.
 * Only a question's words are dropped: a single word is kept, so `and` and `or` still find their
 * instructions.
 */
const STOP_WORDS = new Set(
    'a an the and or how do does did i me my to of in on for with is are was be what which who when where why can could should would will it its this that these those from by at as into about there you your we our'.split(
        ' '
    )
)

/** The words of a query the full-text half searches for. */
export function textTerms(query: string): string {
    const words = query.trim().split(/\s+/)
    if (words.length < 2) return query.trim()
    const kept = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    return (kept.length > 0 ? kept : words).join(' ')
}

/**
 * The everyday word a reader types for what the Documentation calls something else: people print
 * a number, and the M68K's trap task 3 "displays" one. Added to a question's words for the
 * full-text half only; the vector half reads the question as it was typed, and a single word,
 * which is usually a name, is left alone.
 */
const SYNONYMS: Record<string, string[]> = {
    print: ['display', 'output', 'show'],
    display: ['print', 'show'],
    show: ['display', 'print'],
    output: ['print', 'display'],
    read: ['input'],
    input: ['read'],
    exit: ['end', 'terminate', 'halt'],
    quit: ['exit', 'end', 'terminate'],
    terminate: ['exit', 'end'],
    stop: ['halt', 'end'],
    halt: ['stop', 'end'],
    integer: ['number'],
    char: ['character'],
    character: ['char'],
    key: ['keyboard'],
    keypress: ['key', 'keyboard'],
    colour: ['color'],
    function: ['subroutine'],
    procedure: ['subroutine'],
    subroutine: ['function'],
    multiply: ['multiplication', 'product'],
    divide: ['division', 'quotient'],
    remainder: ['modulo'],
    sleep: ['wait', 'delay'],
    wait: ['delay', 'sleep'],
    delay: ['wait', 'sleep'],
    clock: ['time']
}

/** A question's words with the synonyms of each; a single word comes back as it is. */
export function expandedTerms(query: string): string {
    const terms = textTerms(query)
    const words = terms.split(/\s+/)
    if (words.length < 2) return terms
    const extra = words.flatMap((word) => SYNONYMS[word.toLowerCase()] ?? [])
    return [...new Set([...words, ...extra])].join(' ')
}

/**
 * Typos are forgiven in a single longer word, where they are typos (`mvoe`); in a question every
 * short word would otherwise match some two or three letter mnemonic.
 */
function toleranceOf(term: string): number {
    return !term.includes(' ') && term.length >= 4 ? 1 : 0
}

/**
 * A mnemonic is found by its letters and a question by its meaning: the more words a query has, the
 * more the vector half counts.
 */
export function hybridWeightsOf(query: string): { text: number; vector: number } {
    const words = query.trim().split(/\s+/).length
    if (words <= 1) return { text: 0.7, vector: 0.3 }
    if (words === 2) return { text: 0.5, vector: 0.5 }
    return { text: 0.35, vector: 0.65 }
}

export type EntryResult = {
    kind: 'entry'
    key: string
    score: number
    /** Its name is exactly what was typed. */
    exact: boolean
    entry: EntryDocument
}

export type SectionResult = {
    kind: 'section'
    key: string
    score: number
    section: SectionDocument
    /** A few lines of the section around the first word of the query. */
    excerpt: string
}

export type SearchResult = EntryResult | SectionResult

type Unit = {
    id: string
    shard: ShardId
    kind: 'entry' | 'window'
    /** Index into the shard's entries or windows. */
    ref: number
    names: string[]
    title: string
    context: string
    text: string
    code: string
    embedding?: number[]
}

const SCHEMA = {
    id: 'string',
    shard: 'enum',
    kind: 'enum',
    ref: 'number',
    names: 'string[]',
    title: 'string',
    context: 'string',
    text: 'string',
    code: 'string',
    embedding: `vector[${VECTOR_DIMS}]`
} as const

/** Lowercase, trimmed and with single spaces: how entry names are stored and queries compared. */
export function normalizeName(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The spellings an exact-name query also stands for: a directive with or without its dot, and an
 * M68K-style size suffix (`move.l`) when nothing has the suffixed name itself (`add.s` is a MIPS
 * instruction of its own).
 */
function nameVariants(query: string): string[][] {
    const name = normalizeName(query)
    if (!name) return []
    const first = [name, name.startsWith('.') ? name.slice(1) : `.${name}`]
    const sized = /^([a-z][a-z0-9]*)\.[bwls]$/.exec(name)
    return sized ? [first, [sized[1]]] : [first]
}

/**
 * The words of a query worth highlighting, longest first so a longer match wins: the words the
 * full-text half searched for, so a question's "and" or "the" is not marked everywhere.
 */
export function queryTerms(query: string): string[] {
    const words = textTerms(query)
        .toLowerCase()
        .split(/[^\p{L}\p{N}_.$#%]+/u)
        .map((word) => word.replace(/^[.]+|[.]+$/g, ''))
        .filter((word) => word.length >= 2)
    return [...new Set(words)].sort((a, b) => b.length - a.length)
}

/** About two lines of text around the first query word it contains, or its start. */
export function excerpt(text: string, terms: string[], length = 220): string {
    const flat = text.replace(/\s+/g, ' ').trim()
    if (flat.length <= length) return flat
    const lower = flat.toLowerCase()
    const at = terms
        .map((term) => lower.indexOf(term))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0]
    if (at === undefined || at < length / 3) return flat.slice(0, length).trimEnd() + '…'
    let start = Math.max(0, at - Math.floor(length / 3))
    const space = flat.indexOf(' ', start)
    if (space >= 0 && space < at) start = space + 1
    const end = Math.min(flat.length, start + length)
    return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '')
}

export class SearchEngine {
    private readonly shards = new Map<ShardId, ShardPayload>()
    private readonly withVectors = new Set<ShardId>()
    /** Normalised name → the entries that carry it, per shard. */
    private readonly names = new Map<string, { shard: ShardId; ref: number }[]>()

    private constructor(private readonly db: AnyOrama) {}

    static create(): SearchEngine {
        return new SearchEngine(create({ schema: SCHEMA }) as AnyOrama)
    }

    has(shard: ShardId): boolean {
        return this.shards.has(shard)
    }

    /** Whether every shard of the scope is loaded. */
    covers(scope: SearchScope): boolean {
        return shardsOf(scope).every((shard) => this.shards.has(shard))
    }

    /** Whether the scope's shards carry vectors, so a query vector can be used. */
    hasVectors(scope: SearchScope): boolean {
        return shardsOf(scope).some((shard) => this.withVectors.has(shard))
    }

    async add(payload: ShardPayload): Promise<void> {
        if (this.shards.has(payload.shard)) return
        const vectors = payloadVectors(payload)
        const units: Unit[] = []
        payload.entries.forEach((entry, ref) => {
            units.push({
                id: `${payload.shard}:e:${ref}`,
                shard: payload.shard,
                kind: 'entry',
                ref,
                names: entry.names,
                title: entry.title,
                context: `${entry.chapterTitle} ${entry.signature}`,
                text: `${entry.summary}\n${entry.text}`,
                code: entry.code,
                embedding: vectors ? Array.from(vectors[ref]) : undefined
            })
            for (const name of entry.names) {
                const key = normalizeName(name)
                const list = this.names.get(key) ?? []
                list.push({ shard: payload.shard, ref })
                this.names.set(key, list)
            }
        })
        const firstWindow = new Set<number>()
        payload.windows.forEach((window, ref) => {
            const section = payload.sections[window.section]
            // The code is indexed once per section, not once per window.
            const code = firstWindow.has(window.section) ? '' : section.code
            firstWindow.add(window.section)
            units.push({
                id: `${payload.shard}:w:${ref}`,
                shard: payload.shard,
                kind: 'window',
                ref,
                names: [],
                title: section.title,
                context: `${section.courseName} ${section.lectureName}`,
                text: window.text,
                code,
                embedding: vectors ? Array.from(vectors[payload.entries.length + ref]) : undefined
            })
        })
        await insertMultiple(this.db, units, 500)
        this.shards.set(payload.shard, payload)
        if (vectors) this.withVectors.add(payload.shard)
    }

    async search(
        query: string,
        options: { scope: SearchScope; vector?: Float32Array | null; limit?: number }
    ): Promise<SearchResult[]> {
        const term = query.trim()
        if (!term) return []
        const shards = shardsOf(options.scope).filter((shard) => this.shards.has(shard))
        if (shards.length === 0) return []
        const limit = options.limit ?? 20
        const textTerm = expandedTerms(term)
        const base = {
            term: textTerm,
            properties: ['names', 'title', 'context', 'text', 'code'],
            boost: RANKING.boost,
            tolerance: toleranceOf(textTerm),
            where: { shard: { in: shards } },
            limit: RANKING.candidates
        }
        const useVector = !!options.vector && shards.some((shard) => this.withVectors.has(shard))
        const params = useVector
            ? {
                  ...base,
                  mode: 'hybrid' as const,
                  vector: { value: Array.from(options.vector!), property: 'embedding' },
                  similarity: RANKING.similarity,
                  hybridWeights: hybridWeightsOf(term)
              }
            : { ...base, mode: 'fulltext' as const }
        // Orama's parameter types are per schema; the schema above is fixed, so one cast here.
        const found = await oramaSearch(this.db, params as Parameters<typeof oramaSearch>[1])
        const terms = queryTerms(term)

        const exacts: SearchResult[] = []
        const results: SearchResult[] = []
        const seen = new Set<string>()
        for (const exact of this.exactEntries(term, shards)) {
            const entry = this.shards.get(exact.shard)!.entries[exact.ref]
            const key = `${exact.shard}:e:${exact.ref}`
            seen.add(key)
            exacts.push({ kind: 'entry', key, score: Infinity, exact: true, entry })
        }
        for (const hit of found.hits) {
            const unit = hit.document as unknown as Unit
            const payload = this.shards.get(unit.shard)
            if (!payload) continue
            if (unit.kind === 'entry') {
                const key = `${unit.shard}:e:${unit.ref}`
                if (seen.has(key)) continue
                seen.add(key)
                const entry = payload.entries[unit.ref]
                const weight =
                    entry.entryKind === 'extension-group' ? RANKING.extensionGroupWeight : 1
                results.push({ kind: 'entry', key, score: hit.score * weight, exact: false, entry })
                continue
            }
            const window = payload.windows[unit.ref]
            const key = `${unit.shard}:s:${window.section}`
            if (seen.has(key)) continue
            seen.add(key)
            results.push({
                kind: 'section',
                key,
                score: hit.score * RANKING.sectionWeight,
                section: payload.sections[window.section],
                excerpt: excerpt(window.text, terms)
            })
        }
        // stable, so equal scores keep Orama's order
        results.sort((a, b) => b.score - a.score)
        return [...exacts, ...results].slice(0, limit)
    }

    /** Entries whose name is exactly the query, in scope, in the order the shards were listed. */
    private exactEntries(query: string, shards: ShardId[]): { shard: ShardId; ref: number }[] {
        for (const variants of nameVariants(query)) {
            const matches = variants
                .flatMap((name) => this.names.get(name) ?? [])
                .filter((match) => shards.includes(match.shard))
            const unique = [...new Map(matches.map((m) => [`${m.shard}:${m.ref}`, m])).values()]
            if (unique.length > 0) {
                return unique.sort((a, b) => shards.indexOf(a.shard) - shards.indexOf(b.shard))
            }
        }
        return []
    }
}
