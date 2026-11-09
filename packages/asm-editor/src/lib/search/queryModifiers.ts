import type { EntryKind } from '#lib/documentation/entryKinds.ts'
import { languageLabel } from '#lib/languages/languageLabel.ts'
import { isStopWord, queryTerms } from './queryTerms'
import { DOCUMENTATION_LANGUAGES, type DocumentationLanguage, type SearchScope } from './scope'

/*
 * The **Search modifiers** of a query ([CONTEXT.md](../../../../../CONTEXT.md); [the design
 * record](../../../../../docs/design/documentation-search.md), Searching in plain English, Search
 * modifiers): words that change how the results are ranked rather than what they match. Apart from
 * the search engine (engine.ts), so that a search box can mark them as they are typed without
 * loading Orama, which runs in the search worker.
 */

/**
 * The kinds of Chapter a kind word favours. `syscall` stands for the syscalls and the M68K trap
 * tasks alike, `library` for the Runtime library, `lecture` for Lecture sections.
 */
export type ModifierKind =
    | 'directive'
    | 'syscall'
    | 'addressing-mode'
    | 'condition-code'
    | 'port'
    | 'screen-command'
    | 'library'
    | 'lecture'

/** A Search modifier in the typed query, by its offsets there, and what it did in plain words. */
export type QueryMark = {
    start: number
    end: number
    modifier: 'language' | 'kind'
    /** What the Tooltip and a screen reader say, such as "M68K results first". */
    label: string
}

export type QueryModifiers = {
    /**
     * What the search matches, in both halves: the query without the language words, unless
     * nothing else would be left. Kind words stay in it.
     */
    text: string
    /** The languages named, whose results count fully; empty when none is. */
    languages: DocumentationLanguage[]
    /** The kinds of Chapter favoured. */
    kinds: ModifierKind[]
    /** Each modifier in the typed query, in order. */
    marks: QueryMark[]
}

/**
 * A language's name and its aliases. Only a search over several languages reads them: in a
 * language's own scope rv64, NASM and 68000 are subjects of its Documentation ("which instructions
 * are rv64 only"), not a preference.
 */
const LANGUAGE_WORDS: Record<DocumentationLanguage, string[]> = {
    m68k: ['m68k', '68k', '68000', 'motorola', 'easy68k'],
    mips: ['mips', 'mars'],
    'risc-v': ['risc-v', 'risc v', 'riscv', 'rars', 'rv32', 'rv64'],
    x86: ['x86', 'x86-64', 'x86_64', 'x64', 'amd64', 'intel', 'nasm'],
    z80: ['z80']
}

/**
 * The words that favour each kind, singular here and matched in the plural too. Words a question
 * uses for other things are left out on purpose: instruction, register, flag, trap, service,
 * "function" ("call a function" means a subroutine) and "example" (the design record).
 */
const KIND_WORDS: Record<ModifierKind, string[]> = {
    directive: ['directive', 'pseudo-op', 'pseudo op'],
    syscall: ['syscall', 'system call', 'trap task'],
    'addressing-mode': ['addressing mode'],
    'condition-code': ['condition code'],
    port: ['port'],
    'screen-command': ['screen command'],
    library: ['library', 'libc', 'c function'],
    lecture: ['lecture', 'lesson', 'tutorial', 'course']
}

const KIND_LABELS: Record<Exclude<ModifierKind, 'syscall'>, string> = {
    directive: 'Directives first',
    'addressing-mode': 'Addressing modes first',
    'condition-code': 'Condition codes first',
    port: 'Ports first',
    'screen-command': 'Screen commands first',
    library: 'Runtime library first',
    lecture: 'Lectures first'
}

/**
 * The kinds of Chapter each language's Documentation has, so that a box can tell which kind words
 * count without the index: M68K has no ports, Z80 no syscalls. A test checks it against the
 * Documentation itself.
 */
export const LANGUAGE_KINDS: Record<DocumentationLanguage, ModifierKind[]> = {
    m68k: ['directive', 'syscall', 'addressing-mode', 'condition-code'],
    mips: ['directive', 'syscall', 'library'],
    'risc-v': ['directive', 'syscall', 'library'],
    x86: ['directive', 'syscall', 'condition-code', 'library'],
    z80: ['directive', 'condition-code', 'addressing-mode', 'port', 'screen-command']
}

/** The kind word that favours a Chapter holding entries of this kind, if any does. */
export function modifierKindOf(kind: EntryKind): ModifierKind | null {
    switch (kind) {
        case 'directive':
        case 'addressing-mode':
        case 'condition-code':
        case 'port':
        case 'screen-command':
            return kind
        case 'syscall':
        case 'trap-task':
            return 'syscall'
        case 'function':
            return 'library'
        default:
            return null
    }
}

/** The languages a scope searches. */
export function scopeLanguages(scope: SearchScope): DocumentationLanguage[] {
    return scope.kind === 'language' ? [scope.language] : DOCUMENTATION_LANGUAGES
}

/**
 * The kinds of Chapter a scope can have. Lecture words count only beside Documentation: in the
 * Courses' scope every result is a Lecture section already, and an Exam has none.
 */
export function scopeKinds(scope: SearchScope): ModifierKind[] {
    if (scope.kind === 'courses') return []
    const languages = scopeLanguages(scope)
    const kinds = new Set(languages.flatMap((language) => LANGUAGE_KINDS[language]))
    if (scope.kind === 'site' || scope.lectures) kinds.add('lecture')
    return [...kinds]
}

/** A phrase as a pattern: any white space between its words, and a kind word's plural. */
function phrasePattern(phrase: string, plural: boolean): string {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    if (!plural) return escaped
    return escaped.endsWith('y') ? `${escaped.slice(0, -1)}(?:y|ies)` : `${escaped}s?`
}

/**
 * The characters of a word: a modifier is matched as a whole word, so `mips` is not found in
 * `mipsel`, nor `port` in `.port` or `report`. A full stop after it ends a sentence; one before a
 * letter is code (`x86.inc`).
 */
const BEFORE = '(?<![\\p{L}\\p{N}_$.#%-])'
const AFTER = '(?![\\p{L}\\p{N}_$#%-]|\\.[\\p{L}\\p{N}])'

type Phrase = { pattern: string; length: number } & (
    | { modifier: 'language'; language: DocumentationLanguage }
    | { modifier: 'kind'; kind: ModifierKind }
)

/** The words of a query, as in `queryTerms.ts`: runs of letters, digits and the marks of code. */
const WORD = /[\p{L}\p{N}_$.#%'-]+/gu

/**
 * A query's Search modifiers in a scope ([the design record](../../../../../docs/design/documentation-search.md),
 * Search modifiers). Language names count only where the scope covers several languages, and
 * only for the languages it searches. Kind words count only with other words beside them and only
 * for the `kinds` the scope has: the engine passes the kinds of the shards it has loaded, a box
 * leaves them out for every kind the scope can have. Matched case-insensitively, as whole words,
 * the longest phrase first ("x86-64" before "x86").
 */
export function readQuery(
    query: string,
    scope: SearchScope,
    kinds: Iterable<ModifierKind> = scopeKinds(scope)
): QueryModifiers {
    const searched = scopeLanguages(scope)
    const allowed = new Set(kinds)
    const phrases: Phrase[] = []
    if (searched.length > 1) {
        for (const language of searched) {
            for (const word of LANGUAGE_WORDS[language]) {
                phrases.push({
                    pattern: phrasePattern(word, false),
                    length: word.length,
                    modifier: 'language',
                    language
                })
            }
        }
    }
    for (const kind of allowed) {
        for (const word of KIND_WORDS[kind]) {
            phrases.push({
                pattern: phrasePattern(word, true),
                length: word.length,
                modifier: 'kind',
                kind
            })
        }
    }
    const none: QueryModifiers = { text: query.trim(), languages: [], kinds: [], marks: [] }
    if (phrases.length === 0) return none
    // an alternation takes the first alternative that matches, so the longest comes first
    phrases.sort((a, b) => b.length - a.length)
    const pattern = new RegExp(
        `${BEFORE}(?:${phrases.map((phrase) => `(${phrase.pattern})`).join('|')})${AFTER}`,
        'giu'
    )
    const found: { start: number; end: number; phrase: Phrase }[] = []
    for (const match of query.matchAll(pattern)) {
        const group = match.findIndex((value, index) => index > 0 && value !== undefined)
        found.push({
            start: match.index,
            end: match.index + match[0].length,
            phrase: phrases[group - 1]
        })
    }
    if (found.length === 0) return none

    // A kind word alone is what the reader is looking for ("directives"), not a preference.
    const kindSpans = found.filter((span) => span.phrase.modifier === 'kind')
    const otherWords = [...query.matchAll(WORD)].filter(
        (word) =>
            !isStopWord(word[0]) &&
            !kindSpans.some(
                (span) => word.index < span.end && word.index + word[0].length > span.start
            )
    )
    const kept =
        otherWords.length > 0 ? found : found.filter((span) => span.phrase.modifier !== 'kind')
    if (kept.length === 0) return none

    const languages = unique(
        kept.flatMap((span) => (span.phrase.modifier === 'language' ? [span.phrase.language] : []))
    )
    const favoured = unique(
        kept.flatMap((span) => (span.phrase.modifier === 'kind' ? [span.phrase.kind] : []))
    )
    const marks = kept.map(({ start, end, phrase }): QueryMark => ({
        start,
        end,
        modifier: phrase.modifier,
        label:
            phrase.modifier === 'language'
                ? `${languageLabel(phrase.language.toUpperCase())} results first`
                : kindLabel(phrase.kind, languages.length > 0 ? languages : searched)
    }))
    return { text: withoutLanguages(query, kept), languages, kinds: favoured, marks }
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)]
}

/** Syscalls are trap tasks in M68K, so the label names what the languages in view call them. */
function kindLabel(kind: ModifierKind, languages: DocumentationLanguage[]): string {
    if (kind !== 'syscall') return KIND_LABELS[kind]
    const withSyscalls = languages.some(
        (language) => language !== 'm68k' && LANGUAGE_KINDS[language].includes('syscall')
    )
    if (!languages.includes('m68k')) return 'Syscalls first'
    return withSyscalls ? 'Syscalls and trap tasks first' : 'Trap tasks first'
}

/**
 * The query without its language words and what they leave behind (`mips: add`, `add (mips)`,
 * `mips - add`), or the query as typed when no language word is in it or nothing but stop words
 * would be left ("what is mips").
 */
function withoutLanguages(query: string, spans: { start: number; end: number; phrase: Phrase }[]) {
    const languages = spans.filter((span) => span.phrase.modifier === 'language')
    if (languages.length === 0) return query.trim()
    let text = query
    for (const span of [...languages].reverse()) {
        text = `${text.slice(0, span.start)} ${text.slice(span.end)}`
    }
    text = text
        .replace(/\(\s*\)|\[\s*\]/g, ' ')
        // a dash standing alone, not the sign of a number (`-1`)
        .replace(/(^|\s)-+(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,:;/|]+|[\s,:;/|]+$/g, '')
    const words = [...text.matchAll(WORD)].map((word) => word[0])
    return words.some((word) => !isStopWord(word)) ? text : query.trim()
}

/**
 * The words to highlight in a scope's results: those the search matched, so a language name left
 * out of the search ("mips" in "mips add") is not marked in every MIPS result. A box without a
 * scope searches the words as typed.
 */
export function highlightedTerms(query: string, scope?: SearchScope): string[] {
    return queryTerms(scope ? readQuery(query, scope).text : query)
}
