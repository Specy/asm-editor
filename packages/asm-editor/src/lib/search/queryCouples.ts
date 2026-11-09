import type { EntryKind } from '#lib/documentation/entryKinds.ts'
import { isStopWord } from './queryTerms'

/*
 * A query's couples ([the design record](../../../../../docs/design/documentation-search.md),
 * Searching in plain English, Search modifiers): a name with its kind's noun beside it, "tst
 * instruction", "end directive", "register $t0". The noun says that the word is a name, which a
 * name alone in a question does not ("test" is English in the Lectures, `test` an x86
 * instruction), so the engine pins the entries a couple names, as it pins a query that is only a
 * name. Only the engine knows the names, so it finds the couples; a search box marks them once an
 * answer reports them.
 */

/** What a kind's noun names. */
export type CoupleKind =
    | 'instruction'
    | 'directive'
    | 'syscall'
    | 'register'
    | 'flag'
    | 'condition-code'
    | 'addressing-mode'
    | 'port'
    | 'screen-command'
    | 'function'

/**
 * The nouns of each kind, singular only: "test instructions" asks about a kind of instruction,
 * not for one. A noun of two words matches with any white space between them.
 */
const KIND_NOUNS: Record<CoupleKind, string[]> = {
    instruction: ['instruction', 'opcode', 'mnemonic'],
    directive: ['directive', 'pseudo-op', 'pseudo op'],
    syscall: ['syscall', 'system call', 'trap task'],
    register: ['register'],
    flag: ['flag'],
    'condition-code': ['condition code'],
    'addressing-mode': ['addressing mode'],
    port: ['port'],
    'screen-command': ['screen command'],
    function: ['function']
}

/**
 * The kinds of entry a noun names. An x86 Extensions entry is named by the instructions it lists,
 * so it counts as an instruction; the M68K trap tasks are its syscalls.
 */
export const COUPLE_ENTRY_KINDS: Record<CoupleKind, EntryKind[]> = {
    instruction: ['instruction', 'extension-group'],
    directive: ['directive'],
    syscall: ['syscall', 'trap-task'],
    register: ['register'],
    flag: ['flag'],
    'condition-code': ['condition-code'],
    'addressing-mode': ['addressing-mode'],
    port: ['port'],
    'screen-command': ['screen-command'],
    function: ['function']
}

/** How a couple's Tooltip names its kind, in the reader's words. */
const NOUN_LABELS: Record<Exclude<CoupleKind, 'syscall'>, string> = {
    instruction: 'instruction',
    directive: 'directive',
    register: 'register',
    flag: 'flag',
    'condition-code': 'condition code',
    'addressing-mode': 'addressing mode',
    port: 'port',
    'screen-command': 'screen command',
    function: 'function'
}

/** The nouns as words to compare, longest first so that "trap task" is read before anything else. */
const NOUNS = Object.entries(KIND_NOUNS)
    .flatMap(([kind, nouns]) =>
        nouns.map((noun) => ({ kind: kind as CoupleKind, words: noun.split(' ') }))
    )
    .sort((a, b) => b.words.length - a.words.length)

/**
 * Articles, which stand where a name stands before a noun ("a register", "an addressing mode")
 * and are names too: the Z80 register `a`, the x86 condition code `a`, the M68K addressing mode
 * `an`. One is a name before its noun only when typed as code (`A register`).
 */
const ARTICLES = new Set(['a', 'an', 'the'])

/** A word of the query: where it is, and where its text is without a sentence's punctuation. */
type Token = {
    /** As typed, punctuation and all. */
    raw: string
    start: number
    end: number
    /** Without the punctuation of the sentence around it (`(tst`, `instruction?`), as typed. */
    bare: string
    bareStart: number
    bareEnd: number
}

/** The words of a query, split at white space, each with its text bare of a sentence's marks. */
function tokens(query: string): Token[] {
    return [...query.matchAll(/\S+/g)].map((match) => {
        const raw = match[0]
        const start = match.index
        const lead = /^[("'“‘[{]+/.exec(raw)?.[0].length ?? 0
        let rest = raw.slice(lead)
        let trail = /[)"'”’\]},;:!?]+$/.exec(rest)?.[0].length ?? 0
        rest = rest.slice(0, rest.length - trail)
        // a full stop ends a word, but a dot inside or before one is code (`move.l`, `.data`)
        if (/^[^.]+\.$/.test(rest)) {
            rest = rest.slice(0, -1)
            trail++
        }
        return {
            raw,
            start,
            end: start + raw.length,
            bare: rest,
            bareStart: start + lead,
            bareEnd: start + raw.length - trail
        }
    })
}

/** Typed as code: in capitals, or with a `$`, `.`, `#` or `%` (`TST`, `move.l`, `$t0`). */
function typedAsCode(word: string): boolean {
    return /[$.#%]/.test(word) || (/[A-Z]/.test(word) && word === word.toUpperCase())
}

/** A couple the engine found in a query, with the entries its name names. */
export type FoundCouple<T> = {
    /** Offsets into the query of its two words and what is between them. */
    start: number
    end: number
    /** What the Tooltip and a screen reader say: "The tst instruction first". */
    label: string
    entries: T[]
}

/** What a couple reads of the scope's names. */
export type CoupleNames<T> = {
    /** The entries in scope of these kinds that a name, as typed, names: by its variants too. */
    entries(name: string, kinds: readonly EntryKind[]): T[]
    /** An entry's kind, which names a syscall or a trap task in the label. */
    kindOf(entry: T): EntryKind
    /** Whether a name is one the Lectures use as an ordinary word (`set`, `loop`). */
    wordLike(name: string): boolean
}

/**
 * The couples of a query, in the order typed: each a name with its kind's noun beside it, in
 * either order, with nothing but white space between them. The name must be an exact name of an
 * entry of that kind in scope. Before its noun any such name counts, a word-like name or a stop
 * word too ("test instruction", "and instruction"), but an article only when typed as code; after
 * it, only a name that is not an ordinary word, unless typed as code ("instruction tst", but not
 * "instruction set"). A word is in one couple at most, and none is taken from `apart` (a
 * language's name).
 */
export function findCouples<T>(
    query: string,
    names: CoupleNames<T>,
    apart: readonly { start: number; end: number }[] = []
): FoundCouple<T>[] {
    const words = tokens(query)
    const used = words.map((word) =>
        apart.some((span) => word.start < span.end && word.end > span.start)
    )
    const couples: FoundCouple<T>[] = []
    for (let at = 0; at < words.length; at++) {
        const noun = nounAt(words, at)
        if (!noun || used.slice(at, at + noun.length).some(Boolean)) continue
        // the words of a noun of two words name nothing else: "call" in "system call instruction"
        if (noun.length > 1) used.fill(true, at, at + noun.length)
        const first = words[at]
        const last = words[at + noun.length - 1]
        const kinds = COUPLE_ENTRY_KINDS[noun.kind]
        const before = at - 1
        const after = at + noun.length
        let couple: { name: Token; at: number; entries: T[]; bare: boolean } | null = null
        if (before >= 0 && !used[before] && first.bareStart === first.start) {
            const named = nameOf(words[before], kinds, names, 'before')
            if (named) couple = { name: words[before], at: before, ...named }
        }
        if (!couple && after < words.length && !used[after] && last.bareEnd === last.end) {
            const named = nameOf(words[after], kinds, names, 'after')
            if (named) couple = { name: words[after], at: after, ...named }
        }
        if (!couple) {
            at += noun.length - 1
            continue
        }
        for (let index = Math.min(at, couple.at); index < Math.max(after, couple.at + 1); index++) {
            used[index] = true
        }
        const nameStart = couple.bare ? couple.name.bareStart : couple.name.start
        const nameEnd = couple.bare ? couple.name.bareEnd : couple.name.end
        couples.push({
            start: couple.at < at ? nameStart : first.bareStart,
            end: couple.at < at ? last.bareEnd : nameEnd,
            label: coupleLabel(
                query.slice(nameStart, nameEnd),
                noun.kind,
                couple.entries.map((entry) => names.kindOf(entry))
            ),
            entries: couple.entries
        })
        at = Math.max(at + noun.length - 1, couple.at)
    }
    return couples
}

/** The noun that starts at a word, if one does: its kind and how many words it takes. */
function nounAt(words: Token[], at: number): { kind: CoupleKind; length: number } | null {
    for (const noun of NOUNS) {
        const span = words.slice(at, at + noun.words.length)
        if (span.length < noun.words.length) continue
        const matches = noun.words.every((word, index) => {
            const token = span[index]
            if (token.bare.toLowerCase() !== word) return false
            // inside a noun of two words, nothing but white space
            if (index > 0 && token.bareStart !== token.start) return false
            return index === noun.words.length - 1 || token.bareEnd === token.end
        })
        if (matches) return { kind: noun.kind, length: noun.words.length }
    }
    return null
}

/**
 * The entries a word names as the name of a couple, on that side of its noun: the word as typed
 * (`(an)+`, `af'`), or else its text without a sentence's punctuation, which must not stand
 * between it and the noun ("tst, instruction" is no couple). `bare` says which.
 */
function nameOf<T>(
    word: Token,
    kinds: readonly EntryKind[],
    names: CoupleNames<T>,
    side: 'before' | 'after'
): { entries: T[]; bare: boolean } | null {
    const touches = side === 'before' ? word.bareEnd === word.end : word.bareStart === word.start
    const candidates = [
        { text: word.raw, bare: false },
        ...(word.raw !== word.bare && touches ? [{ text: word.bare, bare: true }] : [])
    ]
    for (const { text, bare } of candidates) {
        if (!text || !allowed(text, side, names)) continue
        const entries = names.entries(text, kinds)
        if (entries.length > 0) return { entries, bare }
    }
    return null
}

/** Whether a word may be the name of a couple on that side of its noun. */
function allowed<T>(text: string, side: 'before' | 'after', names: CoupleNames<T>): boolean {
    if (typedAsCode(text)) return true
    const name = text.toLowerCase()
    if (side === 'before') return !ARTICLES.has(name)
    return !isStopWord(name) && !names.wordLike(name)
}

/**
 * What a couple's Tooltip says: "The tst instruction first", the name as typed. A syscall is a
 * trap task where every entry it names is one, as in M68K.
 */
export function coupleLabel(name: string, kind: CoupleKind, entryKinds: EntryKind[]): string {
    const noun =
        kind !== 'syscall'
            ? NOUN_LABELS[kind]
            : entryKinds.length > 0 && entryKinds.every((entryKind) => entryKind === 'trap-task')
              ? 'trap task'
              : 'syscall'
    return `The ${name} ${noun} first`
}
