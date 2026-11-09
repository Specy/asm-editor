/**
 * The logic of `scripts/entry-questions.mjs` ([ADR 0079](../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)):
 * the hash an entry's questions are stored with, what `merge` accepts, what `check` reports and
 * what a packet holds. Plain JavaScript with no imports but Node's, so the script runs it under
 * Node and `src/lib/documentation/entryQuestions.test.ts` tests it.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LANGUAGES = ['m68k', 'mips', 'risc-v', 'x86', 'z80']

/** Fewest questions an entry may have, most it should have, and the longest a question may be. */
export const MIN_QUESTIONS = 3
export const MAX_QUESTIONS = 6
export const MAX_QUESTION_LENGTH = 140

/**
 * Each language's names and aliases, as patterns matched as whole words, case-insensitive. A
 * question may name its own language but no other.
 */
export const LANGUAGE_NAMES = {
    m68k: ['m68k', '68k', '68000', 'motorola', 'easy\\s?68k'],
    mips: ['mips', 'mars'],
    'risc-v': ['risc[-\\s]?v', 'rv32\\w*', 'rv64\\w*', 'rars'],
    x86: ['x86', 'x64', 'x86[-_]64', 'amd64', 'intel', 'nasm'],
    z80: ['z80']
}

/** The x86 Extensions are lists of other instructions, and get no Entry questions. */
export function takesQuestions(entry) {
    return entry.entryKind !== 'extension-group'
}

/**
 * The hash an entry's questions are stored with: the first 16 hex digits of the SHA-256 of the
 * entry's `summary`, `text` and `detail` as the built shard holds them, joined by a NUL character
 * (U+0000) and encoded as UTF-8. An entry without `detail` hashes it as the empty string, so the
 * input always holds two NULs: `summary + '\0' + text + '\0' + (detail ?? '')`.
 */
export function entryHash(entry) {
    return createHash('sha256')
        .update(`${entry.summary}\u0000${entry.text}\u0000${entry.detail ?? ''}`, 'utf8')
        .digest('hex')
        .slice(0, 16)
}

const WORD = '[\\p{L}\\p{N}_]'

function wholeWords(source) {
    return new RegExp(`(?<!${WORD})(?:${source})(?!${WORD})`, 'iu')
}

const LANGUAGE_PATTERNS = Object.fromEntries(
    Object.entries(LANGUAGE_NAMES).map(([language, names]) => [
        language,
        names.map((name) => ({ name, pattern: wholeWords(name) }))
    ])
)

/** The names and aliases of languages other than `language` that `question` holds, as written. */
export function otherLanguageNames(question, language) {
    const found = []
    for (const [other, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
        if (other === language) continue
        for (const { pattern } of patterns) {
            const match = pattern.exec(question)
            if (match) found.push(match[0])
        }
    }
    return found
}

/**
 * Entry names that are also short English words. In a question they name the entry only when
 * written in capitals, as code is: "how do I add a number" does not name the Z80's register `a`,
 * nor "what does it do" the x86 directive `do`, but "what is in A" names `a`.
 */
const ENGLISH_NAMES = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'be',
    'by',
    'do',
    'end',
    'if',
    'in',
    'is',
    'it',
    'no',
    'not',
    'of',
    'on',
    'or',
    'out',
    'set',
    'so',
    'to',
    'up'
])

function escaped(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether `question` names the entry: holds one of its `names` as a whole word, case-insensitive.
 * A one-letter name or a name in `ENGLISH_NAMES` counts only in capitals, and the pronoun "I"
 * never counts.
 */
export function namesEntry(question, names) {
    return names.some((name) => {
        if (!name) return false
        const plainWord = /^\p{L}+$/u.test(name) && (name.length === 1 || ENGLISH_NAMES.has(name))
        if (!plainWord) return wholeWords(escaped(name)).test(question)
        if (name.toLowerCase() === 'i') return false
        return new RegExp(`(?<!${WORD})${escaped(name.toUpperCase())}(?!${WORD})`, 'u').test(
            question
        )
    })
}

/** A question as compared for duplicates: lower case, without punctuation, single spaces. */
export function questionKey(question) {
    return question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** A question as stored: trimmed, with single spaces. */
export function tidyQuestion(question) {
    return question.replace(/\s+/g, ' ').trim()
}

/**
 * Every reason `merge` would reject `questions` for `entry` of `language`, or an empty list. The
 * questions are taken as tidied by `tidyQuestion`.
 */
export function questionProblems(questions, entry, language) {
    if (!Array.isArray(questions)) return ['the questions are not a list of strings']
    const problems = []
    const texts = []
    for (const [index, question] of questions.entries()) {
        if (typeof question !== 'string' || !tidyQuestion(question)) {
            problems.push(`question ${index + 1} is empty or not a string`)
        } else {
            texts.push(tidyQuestion(question))
        }
    }
    if (questions.length < MIN_QUESTIONS) {
        problems.push(`${questions.length} questions; at least ${MIN_QUESTIONS} are needed`)
    }
    const seen = new Map()
    for (const question of texts) {
        const length = [...question].length
        if (length > MAX_QUESTION_LENGTH) {
            problems.push(`"${question}" is ${length} characters; at most ${MAX_QUESTION_LENGTH}`)
        }
        const key = questionKey(question)
        if (seen.has(key)) problems.push(`"${question}" repeats "${seen.get(key)}"`)
        else seen.set(key, question)
        const languages = otherLanguageNames(question, language)
        if (languages.length) {
            problems.push(`"${question}" names another language (${languages.join(', ')})`)
        }
    }
    const naming = texts.filter((question) => namesEntry(question, entry.names))
    if (naming.length > texts.length / 2) {
        problems.push(
            `${naming.length} of ${texts.length} questions name the entry (${entry.names.join(', ')}); at most half may`
        )
    }
    return problems
}

/** The Documentation entries of a built shard folder, by language, read from `docs-<language>.json`. */
export function readShard(dir, language) {
    const path = join(dir, `docs-${language}.json`)
    if (!existsSync(path)) return null
    const shard = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(shard.entries)) throw new Error(`${path} holds no entries`)
    return shard.entries
}

/** A language's questions file, or an empty object when there is none. */
export function readQuestions(dir, language) {
    const path = join(dir, `${language}.json`)
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * `check` for one language: its entries that take questions, those with none (`missing`), those
 * whose hash differs from the entry's text today (`stale`), the ids in the file that no entry
 * takes questions for (`orphaned`), and stored entries `merge` would reject today (`invalid`).
 */
export function checkLanguage(language, entries, questions) {
    const taking = entries.filter(takesQuestions)
    const byId = new Map(taking.map((entry) => [entry.id, entry]))
    const missing = taking.filter((entry) => !Object.hasOwn(questions, entry.id))
    const stale = []
    const invalid = []
    for (const [id, stored] of Object.entries(questions)) {
        const entry = byId.get(id)
        if (!entry) continue
        if (stored?.hash !== entryHash(entry)) stale.push(id)
        const problems = questionProblems(stored?.questions, entry, language)
        if (problems.length) invalid.push({ id, problems })
    }
    const orphaned = Object.keys(questions).filter((id) => !byId.has(id))
    return {
        language,
        entries: taking.length,
        written: taking.length - missing.length,
        missing,
        stale,
        orphaned,
        invalid
    }
}

/** `check` over every language: a report each, or `{ language, error }` where one cannot be read. */
export function checkAll(shardsDir, questionsDir) {
    return LANGUAGES.map((language) => {
        let entries
        try {
            entries = readShard(shardsDir, language)
        } catch (error) {
            return { language, error: `docs-${language}.json: ${error.message}` }
        }
        if (!entries) return { language, error: `no docs-${language}.json in ${shardsDir}` }
        let questions
        try {
            questions = readQuestions(questionsDir, language)
        } catch (error) {
            return { language, error: `${language}.json: ${error.message}` }
        }
        return checkLanguage(language, entries, questions)
    })
}

function countByChapter(entries) {
    const counts = new Map()
    for (const entry of entries) {
        counts.set(entry.chapterTitle, (counts.get(entry.chapterTitle) ?? 0) + 1)
    }
    return [...counts].map(([title, count]) => `${title} ${count}`).join(', ')
}

/** What `check` prints. */
export function formatCheck(reports) {
    const lines = []
    const total = { entries: 0, written: 0, missing: 0, stale: 0, orphaned: 0, invalid: 0 }
    for (const report of reports) {
        if (report.error) {
            lines.push(`${report.language}: not checked: ${report.error}`)
            continue
        }
        total.entries += report.entries
        total.written += report.written
        total.missing += report.missing.length
        total.stale += report.stale.length
        total.orphaned += report.orphaned.length
        total.invalid += report.invalid.length
        lines.push(
            `${report.language}: ${report.entries} entries, ${report.written} with questions, ` +
                `${report.missing.length} missing, ${report.stale.length} stale, ` +
                `${report.orphaned.length} orphaned, ${report.invalid.length} invalid`
        )
        if (report.missing.length) {
            lines.push(`    missing by Chapter: ${countByChapter(report.missing)}`)
        }
        for (const id of report.stale) lines.push(`    stale: ${id}`)
        for (const id of report.orphaned) lines.push(`    orphaned: ${id}`)
        for (const { id, problems } of report.invalid) {
            lines.push(`    invalid: ${id}: ${problems.join('; ')}`)
        }
    }
    lines.push(
        `total: ${total.entries} entries, ${total.written} with questions, ${total.missing} missing, ` +
            `${total.stale} stale, ${total.orphaned} orphaned, ${total.invalid} invalid`
    )
    return lines.join('\n')
}

/**
 * Validates a writer's result, `{ language, entries: { <id>: [question, …] } }`, against the
 * language's shard entries. Returns `{ fatal }` when the result cannot be read at all; otherwise the
 * accepted entries' tidied questions, every rejected entry's problems, and warnings that reject
 * nothing (more than `MAX_QUESTIONS`, a question two entries share).
 */
export function validateResult(result, entries) {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
        return { fatal: 'the result is not a JSON object' }
    }
    if (!LANGUAGES.includes(result.language)) {
        return {
            fatal: `"language" is ${JSON.stringify(result.language)}, not one of ${LANGUAGES.join(', ')}`
        }
    }
    if (
        typeof result.entries !== 'object' ||
        result.entries === null ||
        Array.isArray(result.entries)
    ) {
        return { fatal: '"entries" is not an object of entry ids' }
    }
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const accepted = {}
    const rejected = {}
    const warnings = []
    const owners = new Map()
    for (const [id, questions] of Object.entries(result.entries)) {
        const entry = byId.get(id)
        if (!entry) {
            rejected[id] = [`not an entry of the ${result.language} Documentation`]
            continue
        }
        if (!takesQuestions(entry)) {
            rejected[id] = ['an x86 Extensions entry, which has no Entry questions']
            continue
        }
        const problems = questionProblems(questions, entry, result.language)
        if (problems.length) {
            rejected[id] = problems
            continue
        }
        const tidied = questions.map(tidyQuestion)
        accepted[id] = tidied
        if (tidied.length > MAX_QUESTIONS) {
            warnings.push(`${id}: ${tidied.length} questions; usually at most ${MAX_QUESTIONS}`)
        }
        for (const question of tidied) {
            const key = questionKey(question)
            owners.set(key, [...(owners.get(key) ?? []), { id, question }])
        }
    }
    for (const shared of owners.values()) {
        if (shared.length < 2) continue
        warnings.push(
            `"${shared[0].question}" is a question of ${shared.map((owner) => owner.id).join(', ')}`
        )
    }
    return { accepted, rejected, warnings }
}

/** The questions file with `accepted` written in, each with its entry's hash today, sorted by id. */
export function mergeQuestions(file, accepted, entries) {
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const merged = { ...file }
    for (const [id, questions] of Object.entries(accepted)) {
        merged[id] = { hash: entryHash(byId.get(id)), questions }
    }
    return Object.fromEntries(
        Object.keys(merged)
            .sort()
            .map((id) => [id, merged[id]])
    )
}

const INDENT = '    '
const PRINT_WIDTH = 100

/**
 * A questions file as JSON the way the repository's formatter writes it (four spaces, a list of
 * questions on one line when it fits in 100 columns), so a merge leaves it formatted.
 */
export function serializeQuestions(file) {
    const ids = Object.keys(file)
    if (!ids.length) return '{}\n'
    const blocks = ids.map((id) => {
        const { hash, questions } = file[id]
        const inner = INDENT.repeat(2)
        const oneLine = `${inner}"questions": [${questions.map((q) => JSON.stringify(q)).join(', ')}]`
        const list =
            oneLine.length <= PRINT_WIDTH
                ? oneLine
                : [
                      `${inner}"questions": [`,
                      questions
                          .map((question) => `${INDENT.repeat(3)}${JSON.stringify(question)}`)
                          .join(',\n'),
                      `${inner}]`
                  ].join('\n')
        return [
            `${INDENT}${JSON.stringify(id)}: {`,
            `${inner}"hash": ${JSON.stringify(hash)},`,
            list,
            `${INDENT}}`
        ].join('\n')
    })
    return `{\n${blocks.join(',\n')}\n}\n`
}

/** What a packet holds of an entry to write questions for. */
function packetEntry(entry, stored) {
    return {
        id: entry.id,
        kind: entry.entryKind,
        title: entry.title,
        names: entry.names,
        signature: entry.signature,
        ...(entry.category ? { category: entry.category } : {}),
        summary: entry.summary,
        text: entry.text,
        ...(entry.detail ? { detail: entry.detail } : {}),
        ...(entry.code ? { code: entry.code } : {}),
        ...(stored?.questions?.length ? { currentQuestions: stored.questions } : {})
    }
}

/** The Chapters of `entries` in the order they first appear, as `{ chapter, chapterTitle }`. */
export function chaptersOf(entries) {
    const chapters = new Map()
    for (const entry of entries) {
        if (!chapters.has(entry.chapter)) {
            chapters.set(entry.chapter, {
                chapter: entry.chapter,
                chapterTitle: entry.chapterTitle
            })
        }
    }
    return [...chapters.values()]
}

/**
 * The packets for one language: one per Chapter (or per `size` entries of it), each holding the
 * entries to write questions for in full and the Chapter's other entries by name and summary.
 *
 * - `chapter`: only the Chapter with this title or id, case-insensitive.
 * - `missing`, `stale`: only entries with no questions, or with stale ones; both give either.
 * - `size`: at most this many entries a packet; a Chapter with more is split into parts.
 *
 * Returns `{ name, packet }` items, `name` being the file name without `.json`: the Chapter's id, or
 * `<id>.<part>` for a split Chapter. A Chapter left with nothing to write gives no packet.
 */
export function buildPackets(language, entries, questions, options = {}) {
    const { chapter, missing = false, stale = false, size } = options
    let chapters = chaptersOf(entries)
    if (chapter !== undefined) {
        const wanted = chapter.toLowerCase()
        chapters = chapters.filter(
            (item) =>
                item.chapter.toLowerCase() === wanted || item.chapterTitle.toLowerCase() === wanted
        )
    }
    const wanted = (entry) => {
        if (!takesQuestions(entry)) return false
        if (!missing && !stale) return true
        const stored = questions[entry.id]
        if (missing && !stored) return true
        return stale && stored !== undefined && stored.hash !== entryHash(entry)
    }
    const packets = []
    for (const { chapter: id, chapterTitle } of chapters) {
        const inChapter = entries.filter((entry) => entry.chapter === id)
        const targets = inChapter.filter(wanted)
        if (!targets.length) continue
        const step = size && size > 0 ? size : targets.length
        const parts = Math.ceil(targets.length / step)
        for (let part = 0; part < parts; part++) {
            const slice = targets.slice(part * step, (part + 1) * step)
            const inSlice = new Set(slice.map((entry) => entry.id))
            packets.push({
                name: parts > 1 ? `${id}.${part + 1}` : id,
                packet: {
                    language,
                    chapter: id,
                    chapterTitle,
                    ...(parts > 1 ? { part: part + 1, parts } : {}),
                    entries: slice.map((entry) => packetEntry(entry, questions[entry.id])),
                    others: inChapter
                        .filter((entry) => !inSlice.has(entry.id))
                        .map((entry) => ({
                            id: entry.id,
                            title: entry.title,
                            names: entry.names,
                            summary: entry.summary
                        }))
                }
            })
        }
    }
    return packets
}
