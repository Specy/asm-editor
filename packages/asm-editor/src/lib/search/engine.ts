import { count, create, insertMultiple, search as oramaSearch, type AnyOrama } from '@orama/orama'
import { index as oramaIndex } from '@orama/orama/components'
import { hasCodeName, type EntryKind } from '#lib/documentation/entryKinds.ts'
import { categoryLabel } from '#lib/documentation/instructions/categories.ts'
import { VECTOR_DIMS } from './model'
import {
    payloadVectors,
    type EntryDocument,
    type SectionDocument,
    type ShardPayload
} from './payload'
import { findCouples } from './queryCouples'
import {
    modifierKindOf,
    readQuery,
    type ModifierKind,
    type QueryCouple,
    type QueryModifiers
} from './queryModifiers'
import { courseLanguage, shardsOf, type SearchScope, type ShardId } from './scope'
import { isStopWord, queryTerms } from './queryTerms'
import { englishWords, stemmedText, stemmedWord } from './stemming'
import { expandedTerms } from './synonyms'

/**
 * Hybrid search over the loaded shards ([ADR 0026](../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)),
 * in two halves ([the design record](../../../../../docs/design/documentation-search.md),
 * Searching in plain English, Matching). The words half is Orama's full-text search, the meaning
 * half its vector search over a database of its own, run when the caller has a query vector.
 * Each half scores a result by its best unit (a Lecture section by its best window, an entry by its
 * best vector), and the two are added on fixed scales: the meaning half's cosine similarity is
 * absolute already, and the words half's score is brought to one by saturation. Orama's own hybrid
 * mode divides each half by its own best score instead, so a weak best match looked as certain as
 * a strong one.
 *
 * Each shard has databases of its own, searched one by one and their hits merged, and the words
 * of each are scored with the statistics of the scope's shards together (`ScopeStatistics`), as
 * one database of them would score them. In one database for every shard loaded, a words score
 * depended on what else the worker had loaded: with the site's search open, a language's box
 * ranked differently. With each shard's own statistics, the shard that says the most about a word
 * counted it the least, and the General course's lecture on the stack dropped out of "what is the
 * stack".
 *
 * The multipliers of a kind of result then apply, and those of the query's Search modifiers
 * (`queryModifiers.ts`) and of the names inside a question, then two fixed rules: the entries a
 * couple names ("tst instruction", `queryCouples.ts`) and an entry named exactly what was typed
 * come first, and a Lecture section appears once. The same order serves the panel, the palette
 * and the agents, but for one exception: the Workbench's Documentation panel favours the
 * instructions on the lines of the Problems' errors (`favour`).
 */

/** Values tuned against the golden queries in `golden/`. */
export const RANKING = {
    /**
     * How much a match in each field counts in the words half, the query as typed. An entry's
     * `questions` are its Entry questions: a student's words for what it answers, which its own
     * text often does not use ("print a number in binary" for "in the base in D2.B"). As much as
     * the title: at 3 the questions that mention the stack in passing put `pushf` and `leave`
     * ahead of "what is the stack", and at 1.5 the reader's words answered fewer questions.
     */
    boost: { names: 3, title: 2, context: 1.2, questions: 2, text: 1, detail: 0.5, code: 0.4 },
    /**
     * The same for the stemmed copies of the prose fields, searched with the stemmed query: half the
     * originals', since a word typed as the text has it matches both copies. At the originals'
     * boosts the stems outweighed the words as typed ("68020 exceptions" found the Exceptions
     * overview before the 68020's own entry).
     */
    stemBoost: {
        titleStems: 1,
        contextStems: 0.6,
        questionsStems: 1,
        textStems: 0.5,
        detailStems: 0.25
    },
    /**
     * The words half's score `s` counts `s / (s + saturation)`: half for a match as strong as a
     * typical good one, and never more than 1. The best words score of a golden query was 40 at
     * the median (31 and 53 at the quartiles); the Entry questions raised it to 46 (35 and 58),
     * but 46 ranked the golden queries a little worse than 40 did.
     */
    saturation: 40,
    /**
     * How much each half counts. A query of names (`syscall 10`, `move.l d0`) leans on words, a
     * question in words (`print integer`) on meaning, and a query in between in proportion to its
     * share of names. A single word leans on words, since it is usually a name.
     */
    weights: {
        names: { words: 0.7, meaning: 0.3 },
        words: { words: 0.35, meaning: 0.65 }
    },
    /** The least cosine similarity a vector match needs. Right answers measured 0.30 to 0.48. */
    similarity: 0.15,
    /**
     * Units each half keeps of a search before collapsing, so that collapsing windows still fills
     * a page: the scope's best, of as many asked of each shard. A unit out of them gets nothing from
     * that half. Keeping each shard's best instead let the register `b`, far in meaning from
     * "decrement b and jump if not zero", into the meaning half, and it rose over `djnz`.
     */
    candidates: 80,
    /**
     * A Lecture section's score is multiplied by this. A lecture uses many words of every topic it
     * touches, so on words alone it matches almost anything; the Documentation is what a search is
     * mostly for, and a section comes before an entry only when it answers much better. It was
     * 0.75 before the Entry questions, which gave entries a reader's words too: at 0.75 "what is
     * the stack" lost the General course's section to instructions whose questions mention it.
     */
    sectionWeight: 0.85,
    /**
     * The same for an x86 Extensions entry, a catch-all listing every instruction of a NASM section
     * that has no page of its own, names and summaries: it too matches almost any word. Its exact
     * names still put it first (`vaddpd`).
     */
    extensionGroupWeight: 0.6,
    /**
     * The same for a Runtime library function. Its name is often the start of an everyday word,
     * and Orama matches a word to every name it begins, so on words alone `printf` answered "print
     * an integer" and `getc` "divide and get the remainder" ahead of the Core's own syscalls and
     * instructions. Its exact name still puts it first, and a query asking for the library ("libc",
     * a kind word) counts it fully.
     */
    runtimeFunctionWeight: 0.3,
    /**
     * A result of another language than the ones a query names, in a scope of several languages
     * ("m68k multiply numbers" on the site), is multiplied by this: the named language is
     * preferred, not filtered. The General course's sections count fully.
     */
    otherLanguageWeight: 0.25,
    /**
     * A result in a Chapter of the kind a kind word names ("directive for strings"), its prose
     * entries included, or a Lecture section for the lecture words, is multiplied by this: a small
     * lift, the rest left as they are. At 1.5 "libraries and simulator services" kept its answer,
     * the Libraries page of Using C, by 0.001 over the Runtime library's `clock`, and at 1.75 lost
     * it in three languages.
     */
    kindLift: 1.25,
    /**
     * An entry named by a word of a question ("how does dbra work") is multiplied by this. It must
     * still be found by the question, so a name lifts its entry rather than pinning it. Without it
     * a pasted `add $t0, $t1, $t2` answered with `addiu`; anything from 1.25 to 2 kept every
     * golden query.
     */
    nameBoost: 1.5,
    /**
     * An entry the Workbench's Documentation panel favours, named by the instruction or directive
     * on the line of an error in the Problems tab, is multiplied by this: enough to break a near
     * tie, not to lift a weak match over a strong one, since the reader typed none of it.
     */
    problemBoost: 1.25
}

/**
 * Typos are forgiven in a single longer word, where they are typos (`mvoe`); in a question every
 * short word would otherwise match some two or three letter mnemonic.
 */
function toleranceOf(term: string): number {
    return !term.includes(' ') && term.length >= 4 ? 1 : 0
}

/** A word of a query without the punctuation of the sentence around it (`stack?`, `(dbra)`). */
function bareWord(word: string): string {
    const trimmed = word.replace(/^[("'“‘[{]+/, '').replace(/[)"'”’\]},;:!?]+$/, '')
    // a full stop ends a word, but a dot inside or before one is code (`move.l`, `.data`)
    return /^[^.]+\.$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed
}

/** Typed as code: in capitals, or with a `$`, `.`, `#` or `%` (`STOP`, `move.l`, `$t0`, `#1`). */
function typedAsCode(word: string): boolean {
    return /[$.#%]/.test(word) || inCapitals(word)
}

/** Written in capitals (`STOP`, `ASCII`, and "I"). */
function inCapitals(word: string): boolean {
    return /[A-Z]/.test(word) && word === word.toUpperCase()
}

/**
 * An operand as code writes it, whatever the scope's names: a `$`, `.`, `#` or `%` (`$t0`, `#15`),
 * or a number with a letter (`d0`, `4($sp)`).
 */
function operandShaped(word: string): boolean {
    return /[$.#%]/.test(word) || (/\d/.test(word) && /\p{L}/u.test(word))
}

/**
 * A query with the English parts of each hyphenated word beside it, for the fields searched as
 * typed: Orama keeps `sign-extend` whole, which matches only text that hyphenates it too, while
 * the text often has "sign extend". It splits at a slash or a dash itself.
 */
function withHyphenParts(query: string): string {
    const parts = query
        .split(/\s+/)
        .filter((word) => word.includes('-'))
        .flatMap((word) => englishWords(word))
    return parts.length > 0 ? `${query} ${parts.join(' ')}` : query
}

/** A number or a word shaped like code, which counts as a name whatever the shards hold. */
function codeShaped(word: string): boolean {
    return /[$.#%]/.test(word) || /\d/.test(word)
}

/** The language of a Documentation shard or the Course of a Lecture shard (`docs-mips`: `mips`). */
function shardLanguage(shard: ShardId): string {
    return shard.slice(shard.indexOf('-') + 1)
}

/**
 * The pieces of a query that may be names: split at white space, commas and brackets, so a pasted
 * `lw $t0, 4($sp)` gives `lw`, `$t0`, `4` and `$sp`, with the punctuation of a sentence trimmed.
 */
function namePieces(query: string): string[] {
    return query
        .split(/[\s,()[\]{}]+/)
        .map(bareWord)
        .filter(Boolean)
}

export type EntryResult = {
    kind: 'entry'
    key: string
    score: number
    /** Pinned: its name is exactly what was typed, or a couple's name ("tst instruction"). */
    exact: boolean
    entry: EntryDocument
}

/** Where an entry is: its shard, and its index among the shard's entries. */
type EntryRef = { shard: ShardId; ref: number }

/**
 * A name with its kind's noun beside it in a query (`queryCouples.ts`): where it is, what the box
 * says of it, and the entries it pins.
 */
export type Couple = QueryCouple & { entries: EntryRef[] }

export type SectionResult = {
    kind: 'section'
    key: string
    score: number
    section: SectionDocument
    /** A few lines of the section around the first word of the query. */
    excerpt: string
}

export type SearchResult = EntryResult | SectionResult

/** Where a unit of either database comes from: an entry, or a window of a Lecture section. */
type UnitSource = {
    id: string
    shard: ShardId
    kind: 'entry' | 'window'
    /** Index into the shard's entries or windows. */
    ref: number
}

/** A unit of the words database: an entry, or a window of a Lecture section, with its words. */
type WordsUnit = UnitSource & {
    names: string[]
    title: string
    context: string
    /** An entry's Entry questions, one a line; empty for a Lecture window, which has none. */
    questions: string
    text: string
    detail: string
    code: string
    /** Stemmed copies of the prose fields (`stemming.ts`), empty where the field is code. */
    titleStems: string
    contextStems: string
    questionsStems: string
    textStems: string
    detailStems: string
}

/** A unit of the meaning database: one vector of an entry or of a Lecture window. */
type MeaningUnit = UnitSource & { embedding: number[] }

/**
 * What Orama indexes of a words unit. Orama reads a document's `id` itself and keeps the rest of
 * it as given, so where a unit comes from needs no index, a shard's units being in its own database.
 */
const WORDS_SCHEMA = {
    names: 'string[]',
    title: 'string',
    context: 'string',
    questions: 'string',
    text: 'string',
    detail: 'string',
    code: 'string',
    titleStems: 'string',
    contextStems: 'string',
    questionsStems: 'string',
    textStems: 'string',
    detailStems: 'string'
} as const

/**
 * Every vector in a database of its own, apart from the words: an entry's further windows have no
 * words, and in the words database they would change every other unit's score (Orama's BM25 reads
 * the number of documents and their average length).
 */
const MEANING_SCHEMA = {
    embedding: `vector[${VECTOR_DIMS}]`
} as const

/** Orama's index of a database, as its default index component keeps it. */
type OramaIndex = oramaIndex.Index

/**
 * A shard's databases: its words, and its vectors when its payload has them. `fields` is, for each
 * field of the words, how many units have it and their length in words all together, which the
 * scope's statistics add up.
 */
type ShardDatabases = {
    words: AnyOrama
    meaning: AnyOrama | null
    fields: Record<string, { units: number; length: number }>
}

/**
 * What Orama's BM25 reads of the units a search looks among: how many there are, each field's
 * average length in words, and how many units hold each word, by field. A scope's are those of its
 * shards together, whatever else is loaded.
 */
type ScopeStatistics = {
    docsCount: number
    avgFieldLength: Record<string, number>
    tokenOccurrences: Record<string, Record<string, number>>
}

const ORAMA_INDEX = oramaIndex.createIndex()

/**
 * Orama's own index, but for the statistics of a search: a search over a scope hands its
 * `ScopeStatistics` in as `relevance.scope`, which Orama passes to the index with the BM25
 * parameters, and the shard's own word lists and lengths are scored with them.
 */
const SCOPED_INDEX: typeof ORAMA_INDEX = {
    ...ORAMA_INDEX,
    search(
        index,
        term,
        tokenizer,
        language,
        properties,
        exact,
        tolerance,
        boost,
        relevance,
        docsCount,
        where,
        threshold
    ) {
        const scope = (relevance as { scope?: ScopeStatistics }).scope
        const scoped: OramaIndex | typeof index = scope
            ? {
                  ...(index as OramaIndex),
                  avgFieldLength: scope.avgFieldLength,
                  tokenOccurrences: scope.tokenOccurrences
              }
            : index
        return ORAMA_INDEX.search(
            scoped,
            term,
            tokenizer,
            language,
            properties,
            exact,
            tolerance,
            boost,
            relevance,
            scope?.docsCount ?? docsCount,
            where,
            threshold
        )
    }
}

/** A unit an Orama search found, and its score there. */
type Hit = { score: number; document: unknown }

const TYPED_PROPERTIES = Object.keys(RANKING.boost)
const STEMMED_PROPERTIES = Object.keys(RANKING.stemBoost)

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

/** A result's best unit in one half: its score there, and which unit gave it. */
type Best = { score: number; unit: UnitSource }

/** Keeps a result's best unit, by result key. */
function keepBest(results: Map<string, Best>, key: string, score: number, unit: UnitSource) {
    const known = results.get(key)
    if (!known || score > known.score) results.set(key, { score, unit })
}

export class SearchEngine {
    private readonly shards = new Map<ShardId, ShardPayload>()
    /** Each loaded shard's own databases, so that its scores never depend on another's. */
    private readonly databases = new Map<ShardId, ShardDatabases>()
    /** Normalised name → the entries that carry it, per shard. */
    private readonly names = new Map<string, { shard: ShardId; ref: number }[]>()
    /** Each Documentation shard's names that are also ordinary words (`stop`, `loop`). */
    private readonly wordLike = new Map<ShardId, Set<string>>()
    /** The kinds a kind word can favour in each Chapter, by `<shard>:<chapter>`. */
    private readonly chapterKinds = new Map<string, Set<ModifierKind>>()

    private constructor() {}

    static create(): SearchEngine {
        return new SearchEngine()
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
        return shardsOf(scope).some((shard) => this.databases.get(shard)?.meaning)
    }

    async add(payload: ShardPayload): Promise<void> {
        if (this.shards.has(payload.shard)) return
        const { shard } = payload
        const units: WordsUnit[] = []
        payload.entries.forEach((entry, ref) => {
            const kind = modifierKindOf(entry.entryKind)
            if (kind) {
                const chapter = `${shard}:${entry.chapter}`
                const kinds = this.chapterKinds.get(chapter) ?? new Set<ModifierKind>()
                this.chapterKinds.set(chapter, kinds.add(kind))
            }
            const category = entry.category ? categoryLabel(entry.category) : ''
            const prose = `${entry.summary}\n${entry.text}`
            const questions = (entry.questions ?? []).join('\n')
            units.push({
                id: `${shard}:e:${ref}`,
                shard,
                kind: 'entry',
                ref,
                names: entry.names,
                title: entry.title,
                // An instruction's category sits beside its Chapter, so "shift" or "atomic" finds
                // every member of the group by words alone.
                context: [entry.chapterTitle, category, entry.signature].filter(Boolean).join(' '),
                questions,
                text: prose,
                detail: entry.detail ?? '',
                code: entry.code,
                // A title that is code is never stemmed: `bts` and `bt`, `loope` and `loop`
                // would become one.
                titleStems: hasCodeName({ kind: entry.entryKind, codeName: entry.codeName })
                    ? ''
                    : stemmedText(entry.title),
                contextStems: stemmedText(`${entry.chapterTitle} ${category}`),
                questionsStems: stemmedText(questions),
                textStems: stemmedText(prose),
                detailStems: stemmedText(entry.detail ?? '')
            })
            for (const name of entry.names) {
                const normalized = normalizeName(name)
                // A named syscall, in either order, is as precise as its bare name. Pin it
                // ahead of the SYSCALL instruction and similarly named calls such as writev.
                const exactNames = [normalized]
                if (entry.entryKind === 'syscall') {
                    exactNames.push(`syscall ${normalized}`, `${normalized} syscall`)
                }
                for (const key of exactNames) {
                    const list = this.names.get(key) ?? []
                    list.push({ shard, ref })
                    this.names.set(key, list)
                }
            }
        })
        const firstWindow = new Set<number>()
        payload.windows.forEach((window, ref) => {
            const section = payload.sections[window.section]
            // The code is indexed once per section, not once per window.
            const code = firstWindow.has(window.section) ? '' : section.code
            firstWindow.add(window.section)
            const context = `${section.courseName} ${section.lectureName}`
            units.push({
                id: `${shard}:w:${ref}`,
                shard,
                kind: 'window',
                ref,
                names: [],
                title: section.title,
                context,
                questions: '',
                text: window.text,
                detail: '',
                code,
                titleStems: stemmedText(section.title),
                contextStems: stemmedText(context),
                questionsStems: '',
                textStems: stemmedText(window.text),
                detailStems: ''
            })
        })
        const words = create({
            schema: WORDS_SCHEMA,
            components: { index: SCOPED_INDEX }
        }) as AnyOrama
        await insertMultiple(words, units, 500)
        const index = words.data.index as OramaIndex
        const fields = Object.fromEntries(
            Object.entries(index.fieldLengths).map(([field, lengths]) => {
                // Orama averages a field over the units that have it, and a unit with no names
                // has no names field
                const units = Object.keys(lengths).length
                return [field, { units, length: (index.avgFieldLength[field] ?? 0) * units }]
            })
        )

        let meaningDatabase: AnyOrama | null = null
        const vectors = payloadVectors(payload)
        if (vectors) {
            const meaning: MeaningUnit[] = []
            const add = (kind: 'entry' | 'window', ref: number) => {
                const index = meaning.length
                meaning.push({
                    id: `${shard}:v:${index}`,
                    shard,
                    kind,
                    ref,
                    embedding: Array.from(vectors[index])
                })
            }
            // in the payload's order: each entry's first vector, its further windows, then the
            // Lecture windows
            payload.entries.forEach((_, ref) => add('entry', ref))
            payload.entryWindows.forEach((window) => add('entry', window.entry))
            payload.windows.forEach((_, ref) => add('window', ref))
            meaningDatabase = create({ schema: MEANING_SCHEMA }) as AnyOrama
            await insertMultiple(meaningDatabase, meaning, 500)
        }
        this.databases.set(shard, { words, meaning: meaningDatabase, fields })
        this.wordLike.set(shard, new Set(payload.wordLikeNames))
        this.shards.set(shard, payload)
    }

    /**
     * The kinds of Chapter the scope's loaded shards have, which kind words can favour: Lecture
     * sections only beside Documentation, as `scopeKinds` has it for a box.
     */
    modifierKinds(scope: SearchScope): ModifierKind[] {
        const shards = shardsOf(scope).filter((shard) => this.shards.has(shard))
        const kinds = new Set<ModifierKind>()
        for (const [chapter, own] of this.chapterKinds) {
            if (!shards.some((shard) => chapter.startsWith(`${shard}:`))) continue
            for (const kind of own) kinds.add(kind)
        }
        const documentation = shards.some((shard) => shard.startsWith('docs-'))
        if (documentation && shards.some((shard) => shard.startsWith('lectures-'))) {
            kinds.add('lecture')
        }
        return [...kinds]
    }

    /**
     * A query's Search modifiers and couples, with the kinds of Chapter and the names the loaded
     * shards have. A language's name is never part of a couple, and a word in a couple is not
     * also a kind word: "end directive" pins the `end` directive and lifts no other.
     */
    readSearch(
        query: string,
        scope: SearchScope
    ): { modifiers: QueryModifiers; couples: Couple[] } {
        const kinds = this.modifierKinds(scope)
        const read = readQuery(query, scope, kinds)
        const shards = shardsOf(scope).filter((shard) => this.shards.has(shard))
        const couples = findCouples<EntryRef>(
            query,
            {
                entries: (name, entryKinds) => this.coupledEntries(name, entryKinds, shards),
                kindOf: ({ shard, ref }) => this.shards.get(shard)!.entries[ref].entryKind,
                wordLike: (name) => this.isWordLike(name, shards)
            },
            read.marks.filter((mark) => mark.modifier === 'language')
        )
        if (couples.length === 0) return { modifiers: read, couples }
        return { modifiers: readQuery(query, scope, kinds, couples), couples }
    }

    /**
     * The entries of these kinds in scope that a couple's name names, by the spellings an exact
     * name also stands for (a directive's dot, an M68K size suffix) and, the noun making it safe,
     * a MIPS register without its `$` ("sp register"). Only a name that starts with a letter and is
     * not a stop word drops its `$`: "CP0 register 13" is not `$13`, nor "look at register $t0"
     * `$at`.
     */
    private coupledEntries(
        name: string,
        kinds: readonly EntryKind[],
        shards: ShardId[]
    ): EntryRef[] {
        const groups = nameVariants(name)
        const bare = groups[0]?.[0] ?? ''
        if (/^\p{L}/u.test(bare) && !isStopWord(bare)) groups[0] = [...groups[0], `$${bare}`]
        for (const spellings of groups) {
            const matches = spellings
                .flatMap((spelling) => this.names.get(spelling) ?? [])
                .filter(
                    (match) =>
                        shards.includes(match.shard) &&
                        kinds.includes(this.shards.get(match.shard)!.entries[match.ref].entryKind)
                )
            if (matches.length > 0) {
                return [...new Map(matches.map((m) => [`${m.shard}:${m.ref}`, m])).values()]
            }
        }
        return []
    }

    async search(
        query: string,
        options: {
            scope: SearchScope
            vector?: Float32Array | null
            limit?: number
            /** Read from the query when left out; `prepareSearch` reads them once for both. */
            modifiers?: QueryModifiers
            /** The query's couples, read with the modifiers when left out. */
            couples?: readonly Couple[]
            /**
             * Names whose entries count `RANKING.problemBoost` times: the instructions on the
             * lines of the Problems' errors, which only the Workbench's Documentation panel
             * passes. A name of no entry in scope is ignored.
             */
            favour?: readonly string[]
        }
    ): Promise<SearchResult[]> {
        if (!query.trim()) return []
        const shards = shardsOf(options.scope).filter((shard) => this.shards.has(shard))
        if (shards.length === 0) return []
        const read =
            options.modifiers && options.couples ? null : this.readSearch(query, options.scope)
        const modifiers = options.modifiers ?? read!.modifiers
        const couples = options.couples ?? read!.couples
        const term = modifiers.text.trim()
        if (!term) return []
        const limit = options.limit ?? 20
        const vector =
            options.vector && shards.some((shard) => this.databases.get(shard)?.meaning)
                ? options.vector
                : null
        const words = await this.wordsHalf(term, shards)
        const meaning = vector ? await this.meaningHalf(vector, shards) : new Map<string, Best>()
        const weights = vector ? this.weightsOf(term, options.scope) : { words: 1, meaning: 0 }
        const terms = queryTerms(term)
        const named = this.namedEntries(term, shards)
        const favoured = this.favouredEntries(options.favour ?? [], shards)
        const languages = new Set<string>(modifiers.languages)
        const kinds = new Set(modifiers.kinds)
        /**
         * What the Search modifiers, the names in a question and the Problems' errors make of a
         * result's score.
         */
        const modified = (language: string | null, kindFavoured: boolean, key: string) =>
            (language && languages.size > 0 && !languages.has(language)
                ? RANKING.otherLanguageWeight
                : 1) *
            (kindFavoured ? RANKING.kindLift : 1) *
            (named.has(key) ? RANKING.nameBoost : 1) *
            (favoured.has(key) ? RANKING.problemBoost : 1)

        const exacts: SearchResult[] = []
        const seen = new Set<string>()
        // the named languages' entries first, then in the scope's order
        const pinOrder = [...shards].sort(
            (a, b) =>
                Number(!languages.has(shardLanguage(a))) - Number(!languages.has(shardLanguage(b)))
        )
        const inPinOrder = (refs: EntryRef[]) =>
            refs
                .filter((match) => pinOrder.includes(match.shard))
                .sort((a, b) => pinOrder.indexOf(a.shard) - pinOrder.indexOf(b.shard))
        // each couple's entries in the order typed, then those named exactly what was typed
        const pins = [
            ...couples.flatMap((couple) => inPinOrder(couple.entries)),
            ...this.exactEntries(term, pinOrder)
        ]
        for (const pin of pins) {
            const key = `${pin.shard}:e:${pin.ref}`
            if (seen.has(key)) continue
            seen.add(key)
            const entry = this.shards.get(pin.shard)!.entries[pin.ref]
            exacts.push({ kind: 'entry', key, score: Infinity, exact: true, entry })
        }
        // a result's score, and how to make it once it is known to be shown: a section's excerpt
        // is cut only then
        const ranked: { score: number; result: (score: number) => SearchResult }[] = []
        // the words half's order first, so that equal scores keep it
        for (const key of new Set([...words.keys(), ...meaning.keys()])) {
            if (seen.has(key)) continue
            seen.add(key)
            const inWords = words.get(key)
            const inMeaning = meaning.get(key)
            const s = inWords?.score ?? 0
            const fused =
                weights.words * (s / (s + RANKING.saturation)) +
                weights.meaning * Math.max(0, inMeaning?.score ?? 0)
            // a section's excerpt comes from the window whose words matched, if any did
            const unit = (inWords ?? inMeaning)!.unit
            const payload = this.shards.get(unit.shard)!
            if (unit.kind === 'entry') {
                const entry = payload.entries[unit.ref]
                // a reader who asks for the library ("libc function to compare strings") is not
                // matching an everyday word by accident, which is what the function weight is for
                const weight =
                    entry.entryKind === 'extension-group'
                        ? RANKING.extensionGroupWeight
                        : entry.entryKind === 'function' && !kinds.has('library')
                          ? RANKING.runtimeFunctionWeight
                          : 1
                const own = this.chapterKinds.get(`${unit.shard}:${entry.chapter}`)
                const kindFavoured = [...kinds].some((kind) => own?.has(kind))
                ranked.push({
                    score: fused * weight * modified(entry.language, kindFavoured, key),
                    result: (score) => ({ kind: 'entry', key, score, exact: false, entry })
                })
                continue
            }
            const window = payload.windows[unit.ref]
            const section = payload.sections[window.section]
            const language = courseLanguage(section.course)
            ranked.push({
                score:
                    fused * RANKING.sectionWeight * modified(language, kinds.has('lecture'), key),
                result: (score) => ({
                    kind: 'section',
                    key,
                    score,
                    section,
                    excerpt: excerpt(window.text, terms)
                })
            })
        }
        // stable, so equal scores keep the words half's order
        ranked.sort((a, b) => b.score - a.score)
        const shown = ranked.slice(0, Math.max(0, limit - exacts.length))
        return [...exacts, ...shown.map(({ score, result }) => result(score))].slice(0, limit)
    }

    /**
     * How much each half counts for a query in a scope, by the share of its words, stop words
     * aside, that are names of the scope's entries, numbers or code. A name that the Lectures use
     * as an ordinary word (`loop`, `stop`) counts as a word, unless it is written as code.
     */
    weightsOf(query: string, scope: SearchScope): { words: number; meaning: number } {
        const { names, words } = RANKING.weights
        if (query.trim().split(/\s+/).length < 2) return names
        const shards = shardsOf(scope).filter((shard) => this.shards.has(shard))
        const pieces = this.readPieces(query, shards)
        if (pieces.length === 0) return words
        const share = pieces.filter((piece) => piece.counts).length / pieces.length
        const wordsWeight = words.words + (names.words - words.words) * share
        return { words: wordsWeight, meaning: 1 - wordsWeight }
    }

    /**
     * The words of a query, stop words aside, each with whether it counts as a name (a number,
     * code, or a name of the shards' entries that is not an ordinary word as written) and the
     * entries it names. A name the Lectures use as a word is code when typed as code (`STOP`,
     * `move.l`) or when an operand follows it, as in a pasted line (`add $t0, $t1, $t2`,
     * `push rbp`, `trap #15`). A plain number does not make it code, since "wait 5 seconds" and
     * "loop 10 times" are English, nor does a stop word or a word in capitals ("the test I added",
     * "test ASCII text"), unless the line looks like code: a comma, or an operand written as one.
     */
    private readPieces(
        query: string,
        shards: ShardId[]
    ): { counts: boolean; entries: { shard: ShardId; ref: number }[] }[] {
        const pieces = namePieces(query)
        const named = pieces.map((piece) => this.namedBy(piece, shards))
        const wordLike = pieces.map((piece) => this.isWordLike(normalizeName(piece), shards))
        const codeLine = query.includes(',') || pieces.some(operandShaped)
        // written as an operand, a name of the scope that is not a word (`rbp`), or in a line of
        // code a word in capitals (`LABEL`)
        const isOperand = (index: number) => {
            const piece = pieces[index]
            if (piece === undefined || isStopWord(piece)) return false
            if (operandShaped(piece)) return true
            if (named[index].length > 0 && !wordLike[index]) return true
            return codeLine && inCapitals(piece)
        }
        return pieces.flatMap((piece, index) => {
            if (isStopWord(piece)) return []
            const asName =
                named[index].length > 0 &&
                (!wordLike[index] || typedAsCode(piece) || isOperand(index + 1))
            const entries = asName ? named[index].filter((match) => this.hasCodeNames(match)) : []
            return [{ counts: codeShaped(piece) || asName, entries }]
        })
    }

    /**
     * Whether an entry's names are code, which a name in a question lifts: an instruction, a
     * register, a function, an x86 Extensions entry (named by its instructions). An entry named in
     * words, such as the `line` screen command, is found by the words half already. So is a
     * syscall, though x86 sets its names as code: they are often English verbs the Lectures never
     * use, and lifting `rename` made "rename a function" answer with the syscall. A syscall typed
     * with its kind (`write syscall`) is pinned as an exact name instead.
     */
    private hasCodeNames(match: { shard: ShardId; ref: number }): boolean {
        const entry = this.shards.get(match.shard)!.entries[match.ref]
        if (entry.entryKind === 'extension-group') return true
        if (entry.entryKind === 'syscall') return false
        return hasCodeName({ kind: entry.entryKind, codeName: entry.codeName })
    }

    /**
     * The entries a word of a question names, in scope: by the name as written, or without an
     * M68K-style size suffix (`move.l`). A directive is not matched without its dot here, so
     * "data" in a question is a word and `.data` a name.
     */
    private namedBy(piece: string, shards: ShardId[]): { shard: ShardId; ref: number }[] {
        const name = normalizeName(piece)
        const inScope = (key: string) =>
            (this.names.get(key) ?? []).filter((match) => shards.includes(match.shard))
        const found = inScope(name)
        const sized = /^([a-z][a-z0-9]*)\.[bwls]$/.exec(name)
        return found.length > 0 || !sized ? found : inScope(sized[1])
    }

    /** The result keys of the entries a question names, which `RANKING.nameBoost` lifts. */
    private namedEntries(query: string, shards: ShardId[]): Set<string> {
        return new Set(
            this.readPieces(query, shards).flatMap((piece) =>
                piece.entries.map((match) => `${match.shard}:e:${match.ref}`)
            )
        )
    }

    /**
     * The result keys of the entries the favoured names name, which `RANKING.problemBoost` lifts:
     * as a question's names are matched, an M68K size suffix aside (`move.l`).
     */
    private favouredEntries(names: readonly string[], shards: ShardId[]): Set<string> {
        return new Set(
            names.flatMap((name) =>
                this.namedBy(name, shards).map((match) => `${match.shard}:e:${match.ref}`)
            )
        )
    }

    private isName(name: string, shards: ShardId[]): boolean {
        return (this.names.get(name) ?? []).some((match) => shards.includes(match.shard))
    }

    private isWordLike(name: string, shards: ShardId[]): boolean {
        return shards.some((shard) => this.wordLike.get(shard)?.has(name))
    }

    /**
     * The words half: the query as typed over every field, and its English words stemmed over the
     * stemmed copies of the prose, whole words only, each with the Documentation's words for the
     * reader's (`synonyms.ts`). Each shard is searched in its own database; a unit's two scores
     * add up, and a result keeps its best unit's.
     */
    private async wordsHalf(term: string, shards: ShardId[]): Promise<Map<string, Best>> {
        const typed = expandedTerms(term)
        const stems = this.stemmedQuery(typed, shards)
        const statistics = this.statistics(shards)
        const scores = new Map<string, { unit: WordsUnit; score: number }>()
        const collect = (hits: Hit[]) => {
            for (const hit of hits) {
                const unit = hit.document as WordsUnit
                const known = scores.get(unit.id)
                scores.set(unit.id, { unit, score: (known?.score ?? 0) + hit.score })
            }
        }
        collect(
            await this.scopeHits(shards, ({ words }) =>
                this.searchWords(words, statistics, {
                    term: withHyphenParts(typed),
                    properties: TYPED_PROPERTIES,
                    boost: RANKING.boost,
                    tolerance: toleranceOf(typed)
                })
            )
        )
        if (stems) {
            collect(
                await this.scopeHits(shards, ({ words }) =>
                    this.searchWords(words, statistics, {
                        term: stems,
                        properties: STEMMED_PROPERTIES,
                        boost: RANKING.stemBoost,
                        tolerance: 0
                    })
                )
            )
        }
        const results = new Map<string, Best>()
        for (const { unit, score } of [...scores.values()].sort((a, b) => b.score - a.score)) {
            keepBest(results, this.resultKey(unit), score, unit)
        }
        return results
    }

    private async searchWords(
        words: AnyOrama,
        statistics: ScopeStatistics,
        params: {
            term: string
            properties: string[]
            boost: Record<string, number>
            tolerance: number
        }
    ): Promise<Hit[]> {
        // Orama's parameter types are per schema; the schema above is fixed, so one cast here.
        const found = await oramaSearch(words, {
            ...params,
            mode: 'fulltext',
            // a new object each time: Orama fills in the BM25 parameters on the one it is given
            relevance: { scope: statistics },
            limit: RANKING.candidates
        } as Parameters<typeof oramaSearch>[1])
        return found.hits
    }

    /**
     * The statistics of the scope's loaded shards together, as one database of them would have
     * them: the units counted, each field's average length over the units that have it, and the
     * units holding a word, added up over the shards when Orama asks for the word.
     */
    private statistics(shards: ShardId[]): ScopeStatistics {
        const databases = shards.map((shard) => this.databases.get(shard)!)
        const indexes = databases.map(({ words }) => words.data.index as OramaIndex)
        const avgFieldLength: Record<string, number> = {}
        const tokenOccurrences: Record<string, Record<string, number>> = {}
        for (const field of Object.keys(WORDS_SCHEMA)) {
            const units = databases.reduce(
                (sum, { fields }) => sum + (fields[field]?.units ?? 0),
                0
            )
            const length = databases.reduce(
                (sum, { fields }) => sum + (fields[field]?.length ?? 0),
                0
            )
            avgFieldLength[field] = units > 0 ? length / units : 0
            tokenOccurrences[field] = new Proxy({} as Record<string, number>, {
                get: (_, word) =>
                    typeof word !== 'string'
                        ? undefined
                        : indexes.reduce((sum, index) => {
                              const units = index.tokenOccurrences[field]?.[word]
                              return sum + (typeof units === 'number' ? units : 0)
                          }, 0)
            })
        }
        const docsCount = databases.reduce((sum, { words }) => sum + count(words), 0)
        return { docsCount, avgFieldLength, tokenOccurrences }
    }

    /**
     * The query's English words, stemmed, for the stemmed copies, a hyphenated or slashed word in
     * its parts as the index has them (`sign-extend`, `read/write`). A name of the scope's entries
     * is left out unless the Lectures use it as a word: stemmed, `movs` would find `mov`.
     */
    private stemmedQuery(typed: string, shards: ShardId[]): string {
        const leftOut = (word: string) => {
            const name = normalizeName(bareWord(word))
            return this.isName(name, shards) && !this.isWordLike(name, shards)
        }
        const stems = typed.split(/\s+/).flatMap((word) => {
            if (leftOut(word)) return []
            return word.split(/[-–—/]/).flatMap((part) => {
                const stemmed = leftOut(part) ? null : stemmedWord(part)
                return stemmed ? [stemmed] : []
            })
        })
        return [...new Set(stems)].join(' ')
    }

    /** The meaning half: each result's best cosine similarity among its vectors. */
    private async meaningHalf(vector: Float32Array, shards: ShardId[]): Promise<Map<string, Best>> {
        const value = Array.from(vector)
        const hits = await this.scopeHits(shards, async ({ meaning }) => {
            if (!meaning) return []
            const found = await oramaSearch(meaning, {
                mode: 'vector',
                vector: { value, property: 'embedding' },
                similarity: RANKING.similarity,
                limit: RANKING.candidates
            } as Parameters<typeof oramaSearch>[1])
            return found.hits
        })
        const results = new Map<string, Best>()
        for (const hit of hits) {
            const unit = hit.document as unknown as MeaningUnit
            keepBest(results, this.resultKey(unit), hit.score, unit)
        }
        return results
    }

    /**
     * A search run in each shard's own databases, its hits merged into the scope's best
     * `RANKING.candidates`. Stable, so equal scores keep the scope's order of shards.
     */
    private async scopeHits(
        shards: ShardId[],
        search: (databases: ShardDatabases) => Promise<Hit[]>
    ): Promise<Hit[]> {
        const hits: Hit[] = []
        for (const shard of shards) hits.push(...(await search(this.databases.get(shard)!)))
        return hits.sort((a, b) => b.score - a.score).slice(0, RANKING.candidates)
    }

    /** What a unit is part of in the results: its entry, or its window's Lecture section. */
    private resultKey(unit: UnitSource): string {
        if (unit.kind === 'entry') return `${unit.shard}:e:${unit.ref}`
        const window = this.shards.get(unit.shard)!.windows[unit.ref]
        return `${unit.shard}:s:${window.section}`
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

/** A query made ready for `SearchEngine.search`: what the model reads, and the search's options. */
export type PreparedSearch = {
    /** The text the model turns into the query vector: the query without its language words. */
    embed: string
    /**
     * The options of `search`, beside the vector and the limit. The couples are also what an
     * answer reports, for a search box to mark.
     */
    options: { scope: SearchScope; modifiers: QueryModifiers; couples: Couple[] }
}

/**
 * How a query is searched ([the plan](../../../../../docs/design/plain-english-search-plan.md),
 * phase 3): its Search modifiers and couples read once, with the kinds of Chapter and the names
 * the engine has loaded, and the text the model reads. The worker and the golden queries both call
 * this, so the golden files test what the worker does.
 */
export function prepareSearch(
    engine: SearchEngine,
    query: string,
    scope: SearchScope
): PreparedSearch {
    const { modifiers, couples } = engine.readSearch(query, scope)
    return { embed: modifiers.text, options: { scope, modifiers, couples } }
}
