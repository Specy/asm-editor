import { isStopWord } from './queryTerms'

/*
 * English stemming for the words half ([the design record](../../../../../docs/design/documentation-search.md),
 * Matching): "divides" finds "divide" and "strings" finds "string". Orama's own stemming is left
 * off, since it splits a query into words once for every field and would stem it against names
 * too ("movs" found `mov`). The engine instead keeps a stemmed copy of the prose in fields of its
 * own and searches them with a stemmed query, and names, titles and code with the query as typed.
 *
 * The stemmer is Martin Porter's of 1980, as his own reference implementation has it. Orama ships
 * one too, but does not export it, and it cuts `-sion` and `-tion` one letter short ("instruction"
 * gave "instruc" where "instruct" gives "instruct").
 */

/**
 * Ends every stem in an index field and in a query. Orama matches a query word to every word it
 * begins, which on stems would let "oper" (operation) match "operand" everywhere; a stem never
 * holds `_`, so `oper_` begins no word but `oper_` itself. Orama's English tokenizer keeps `_`
 * inside a word.
 */
const STEM_END = '_'

function isConsonant(word: string, i: number): boolean {
    const letter = word[i]
    if (letter === 'a' || letter === 'e' || letter === 'i' || letter === 'o' || letter === 'u') {
        return false
    }
    if (letter === 'y') return i === 0 || !isConsonant(word, i - 1)
    return true
}

/** Porter's m: how many vowel-consonant sequences the stem has, `[C](VC){m}[V]`. */
function measure(stem: string): number {
    let count = 0
    let i = 0
    while (i < stem.length && isConsonant(stem, i)) i++
    while (i < stem.length) {
        while (i < stem.length && !isConsonant(stem, i)) i++
        if (i >= stem.length) break
        while (i < stem.length && isConsonant(stem, i)) i++
        count++
    }
    return count
}

function hasVowel(stem: string): boolean {
    for (let i = 0; i < stem.length; i++) if (!isConsonant(stem, i)) return true
    return false
}

function endsWithDoubleConsonant(word: string): boolean {
    const last = word.length - 1
    return last >= 1 && word[last] === word[last - 1] && isConsonant(word, last)
}

/** Consonant, vowel, consonant at the end, the last not w, x or y (`hop`, not `snow`). */
function endsConsonantVowelConsonant(word: string): boolean {
    const last = word.length - 1
    return (
        last >= 2 &&
        isConsonant(word, last - 2) &&
        !isConsonant(word, last - 1) &&
        isConsonant(word, last) &&
        !'wxy'.includes(word[last])
    )
}

/**
 * The first rule whose suffix the word ends with, longest suffix first as the lists are ordered:
 * only that rule is tried, and it applies when its stem passes the test.
 */
function replaceSuffix(
    word: string,
    rules: readonly (readonly [string, string])[],
    applies: (base: string) => boolean
): string {
    for (const [suffix, replacement] of rules) {
        if (!word.endsWith(suffix)) continue
        const base = word.slice(0, word.length - suffix.length)
        return applies(base) ? base + replacement : word
    }
    return word
}

const STEP_2: readonly (readonly [string, string])[] = [
    ['ational', 'ate'],
    ['tional', 'tion'],
    ['enci', 'ence'],
    ['anci', 'ance'],
    ['izer', 'ize'],
    ['bli', 'ble'],
    ['alli', 'al'],
    ['entli', 'ent'],
    ['eli', 'e'],
    ['ousli', 'ous'],
    ['ization', 'ize'],
    ['ation', 'ate'],
    ['ator', 'ate'],
    ['alism', 'al'],
    ['iveness', 'ive'],
    ['fulness', 'ful'],
    ['ousness', 'ous'],
    ['aliti', 'al'],
    ['iviti', 'ive'],
    ['biliti', 'ble'],
    ['logi', 'log']
]

const STEP_3: readonly (readonly [string, string])[] = [
    ['icate', 'ic'],
    ['ative', ''],
    ['alize', 'al'],
    ['iciti', 'ic'],
    ['ical', 'ic'],
    ['ful', ''],
    ['ness', '']
]

/** Longest first where one suffix ends another (`ement`, `ment`, `ent`). */
const STEP_4 = [
    'al',
    'ance',
    'ence',
    'er',
    'ic',
    'able',
    'ible',
    'ant',
    'ement',
    'ment',
    'ent',
    'ion',
    'ou',
    'ism',
    'ate',
    'iti',
    'ous',
    'ive',
    'ize'
]
    .sort((a, b) => b.length - a.length)
    .map((suffix) => [suffix, ''] as const)

/** The Porter stem of a lowercase English word. Words of one or two letters stay as they are. */
export function stem(word: string): string {
    if (word.length <= 2) return word
    let w = word

    // step 1a: plurals
    if (w.endsWith('sses')) w = w.slice(0, -2)
    else if (w.endsWith('ies')) w = w.slice(0, -2)
    else if (!w.endsWith('ss') && w.endsWith('s')) w = w.slice(0, -1)

    // step 1b: -ed and -ing
    if (w.endsWith('eed')) {
        if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1)
    } else {
        const suffix = w.endsWith('ed') ? 2 : w.endsWith('ing') ? 3 : 0
        if (suffix && hasVowel(w.slice(0, -suffix))) {
            w = w.slice(0, -suffix)
            if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e'
            else if (endsWithDoubleConsonant(w) && !'lsz'.includes(w[w.length - 1])) {
                w = w.slice(0, -1)
            } else if (measure(w) === 1 && endsConsonantVowelConsonant(w)) w += 'e'
        }
    }

    // step 1c: a final y after a vowel somewhere becomes i
    if (w.endsWith('y') && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + 'i'

    w = replaceSuffix(w, STEP_2, (base) => measure(base) > 0)
    w = replaceSuffix(w, STEP_3, (base) => measure(base) > 0)
    // step 4: -ion goes only after s or t (adoption, not onion)
    const ion = w.endsWith('ion')
    w = replaceSuffix(w, STEP_4, (base) => measure(base) > 1 && (!ion || /[st]$/.test(base)))

    // step 5a: a final e
    if (w.endsWith('e')) {
        const base = w.slice(0, -1)
        const m = measure(base)
        if (m > 1 || (m === 1 && !endsConsonantVowelConsonant(base))) w = base
    }
    // step 5b: a final double l
    if (measure(w) > 1 && w.endsWith('ll')) w = w.slice(0, -1)
    return w
}

/** Punctuation around a word in running text, which is not part of it. */
const LEADING = /^[("'“‘[{]+/
const TRAILING = /[)"'”’\]},;:!?.]+$/

/**
 * A word of running text as the stemmed fields hold it, or `null` when it is not an ordinary
 * English word: code (`$t0`, `move.l`, `.data`, `x86`, `exit_group`), a word in capitals (`MOVE`,
 * `ASCII`, which prose writes for mnemonics and acronyms), a single letter or a stop word.
 */
function englishWord(raw: string): string | null {
    const word = raw
        .replace(LEADING, '')
        .replace(TRAILING, '')
        .replace(/['’]s$/, '')
    if (!/^[A-Za-z]{2,}$/.test(word)) return null
    if (word === word.toUpperCase()) return null
    const lower = word.toLowerCase()
    return isStopWord(lower) ? null : lower
}

/**
 * The ordinary English words of running text, lowercase, hyphenated ones split (`zero-extended`
 * is `zero` and `extended`): no code, no words in capitals, no stop words.
 */
export function englishWords(text: string): string[] {
    const out: string[] = []
    for (const token of text.split(/\s+/)) {
        for (const part of token.split(/[-–—/]/)) {
            const word = englishWord(part)
            if (word) out.push(word)
        }
    }
    return out
}

/** The stemmed copy of prose that the index holds: its English words, each stemmed and ended. */
export function stemmedText(text: string): string {
    return englishWords(text)
        .map((word) => stem(word) + STEM_END)
        .join(' ')
}

/**
 * A query word as the stemmed fields are searched for it, or `null` when it is not an ordinary
 * English word (see `englishWord`); the caller leaves out names too.
 */
export function stemmedWord(word: string): string | null {
    const english = englishWord(word)
    return english ? stem(english) + STEM_END : null
}
