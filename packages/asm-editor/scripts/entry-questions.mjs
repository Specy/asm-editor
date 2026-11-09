#!/usr/bin/env node
/**
 * Entry questions ([ADR 0079](../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)):
 * the questions a student would type that a Documentation entry answers, written once by a language
 * model and committed in `src/lib/documentation/questions/<language>.json`. This script reads a
 * built site's Documentation shards (`build/search/docs-<language>.json`, any shard format), and
 * never runs a model itself.
 *
 * How to run, from `packages/asm-editor`:
 *
 * 1. Build the site, or use a build that has the same Documentation: the main checkout's
 *    `build/search` will do. The shard folder is the last argument of every command; it defaults to
 *    the repository's `build/search`.
 * 2. `node scripts/entry-questions.mjs packets mips --chapter Syscalls --missing` writes one packet
 *    per Chapter to `.cache/entry-questions/packets/mips/` (`--size 60` splits big Chapters).
 * 3. A writer agent reads `scripts/entry-questions/writer.md` and a packet, and writes a result to
 *    `.cache/entry-questions/results/<language>/<packet>.json`.
 * 4. A checker agent reads `scripts/entry-questions/checker.md`, the packet and the result, and
 *    writes its flags to `.cache/entry-questions/flags/<language>/<packet>.json`. The writer then
 *    revises the flagged questions (writer.md, "Revising after a check").
 * 5. `node scripts/entry-questions.mjs merge <result.json>` validates the result and writes the
 *    accepted entries, each with its hash, into the language's file (`--dry-run` only validates).
 * 6. `node scripts/entry-questions.mjs check` lists what is missing, stale or orphaned.
 *
 * Commands:
 *
 * - `check [dir]`: per language, entries without questions (missing), entries whose text changed
 *   since their questions were written (stale), questions of entries that no longer exist
 *   (orphaned), and stored questions that `merge` would reject today (invalid). Always exits 0.
 * - `packets <language> [--chapter <title or id>] [--missing] [--stale] [--size <n>]
 *   [--out <dir>] [dir]`: writes `<out>/<language>/<chapter>.json` (`<chapter>.<part>.json` when
 *   split); `<out>` defaults to `.cache/entry-questions/packets`.
 * - `merge <result.json> [--dry-run] [dir]`: rejects, listing every problem, an entry with fewer
 *   than three questions, two questions differing only in case or punctuation, a question over 140
 *   characters, another language's name or alias, more than half of its questions naming the entry,
 *   or an id the shards do not have (or an x86 Extensions entry). Writes the other entries; exits
 *   1 when any was rejected.
 *
 * Every command takes `--questions <dir>` for a questions folder other than the committed one, for
 * example to merge a pilot's results apart.
 *
 * The hash is the first 16 hex digits of the SHA-256 of `summary + '\0' + text + '\0' + detail`
 * (UTF-8; an absent `detail` is the empty string), the fields as the built shard holds them:
 * `entryHash` in `scripts/entry-questions/lib.mjs`.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
    LANGUAGES,
    buildPackets,
    chaptersOf,
    checkAll,
    formatCheck,
    mergeQuestions,
    readQuestions,
    readShard,
    serializeQuestions,
    validateResult
} from './entry-questions/lib.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const defaultShards = resolve(projectRoot, '..', '..', 'build', 'search')
const defaultQuestions = join(projectRoot, 'src', 'lib', 'documentation', 'questions')
const defaultPackets = join(projectRoot, '.cache', 'entry-questions', 'packets')

const USAGE = `Usage: node scripts/entry-questions.mjs <command>
  check [dir]
  packets <language> [--chapter <title>] [--missing] [--stale] [--size <n>] [--out <dir>] [dir]
  merge <result.json> [--dry-run] [dir]
Every command takes --questions <dir>. [dir] is the built shard folder (default ${relative(process.cwd(), defaultShards) || '.'}).`

function fail(message) {
    console.error(message)
    process.exit(1)
}

const { values, positionals } = (() => {
    try {
        return parseArgs({
            allowPositionals: true,
            options: {
                chapter: { type: 'string' },
                missing: { type: 'boolean', default: false },
                stale: { type: 'boolean', default: false },
                size: { type: 'string' },
                out: { type: 'string' },
                questions: { type: 'string' },
                'dry-run': { type: 'boolean', default: false },
                help: { type: 'boolean', short: 'h', default: false }
            }
        })
    } catch (error) {
        return fail(`${error.message}\n${USAGE}`)
    }
})()

const [command, ...rest] = positionals
const questionsDir = values.questions ? resolve(values.questions) : defaultQuestions

function shardEntries(dir, language) {
    const entries = readShard(dir, language)
    if (!entries) {
        fail(
            `No docs-${language}.json in ${dir}. Build the site, or pass a build/search folder such as the main checkout's.`
        )
    }
    return entries
}

function shown(path) {
    const relativePath = relative(process.cwd(), path)
    return relativePath.startsWith('..') ? path : relativePath
}

function check() {
    const shards = resolve(rest[0] ?? defaultShards)
    console.log(`Entry questions in ${shown(questionsDir)}, against ${shown(shards)}\n`)
    console.log(formatCheck(checkAll(shards, questionsDir)))
}

function packets() {
    const [language, dir] = rest
    if (!LANGUAGES.includes(language)) fail(`packets: give a language: ${LANGUAGES.join(', ')}`)
    const size = values.size === undefined ? undefined : Number(values.size)
    if (size !== undefined && !(Number.isInteger(size) && size > 0)) {
        fail(`--size must be a positive whole number, not ${values.size}`)
    }
    const shards = resolve(dir ?? defaultShards)
    const entries = shardEntries(shards, language)
    const chapters = chaptersOf(entries)
    if (
        values.chapter !== undefined &&
        !chapters.some(
            ({ chapter, chapterTitle }) =>
                chapter.toLowerCase() === values.chapter.toLowerCase() ||
                chapterTitle.toLowerCase() === values.chapter.toLowerCase()
        )
    ) {
        fail(
            `No Chapter "${values.chapter}" in ${language}. Chapters: ${chapters.map((item) => item.chapterTitle).join(', ')}`
        )
    }
    const built = buildPackets(language, entries, readQuestions(questionsDir, language), {
        chapter: values.chapter,
        missing: values.missing,
        stale: values.stale,
        size
    })
    const out = join(values.out ? resolve(values.out) : defaultPackets, language)
    mkdirSync(out, { recursive: true })
    const written = new Set(built.map(({ packet }) => packet.chapter))
    for (const name of readdirSync(out)) {
        // A Chapter's packets from an earlier run, possibly split differently.
        const chapter = name.replace(/(\.\d+)?\.json$/, '')
        if (name.endsWith('.json') && written.has(chapter)) rmSync(join(out, name))
    }
    for (const { name, packet } of built) {
        const path = join(out, `${name}.json`)
        writeFileSync(path, `${JSON.stringify(packet, null, 4)}\n`)
        const others = packet.others.length
            ? `, ${packet.others.length} others by summary`
            : ' (the whole Chapter)'
        console.log(`${shown(path)}: ${packet.entries.length} entries${others}`)
    }
    if (!built.length) console.log('Nothing to write: every entry asked for has its questions.')
}

function merge() {
    const [resultPath, dir] = rest
    if (!resultPath) fail(`merge: give a result file\n${USAGE}`)
    let result
    try {
        result = JSON.parse(readFileSync(resultPath, 'utf8'))
    } catch (error) {
        fail(`${resultPath}: ${error.message}`)
    }
    const language = result?.language
    if (!LANGUAGES.includes(language)) {
        fail(`${resultPath}: "language" must be one of ${LANGUAGES.join(', ')}`)
    }
    const entries = shardEntries(resolve(dir ?? defaultShards), language)
    const validated = validateResult(result, entries)
    if (validated.fatal) fail(`${resultPath}: ${validated.fatal}`)
    const { accepted, rejected, warnings } = validated
    for (const [id, problems] of Object.entries(rejected)) {
        console.log(`rejected ${id}:`)
        for (const problem of problems) console.log(`    ${problem}`)
    }
    for (const warning of warnings) console.log(`warning: ${warning}`)
    const acceptedCount = Object.keys(accepted).length
    const rejectedCount = Object.keys(rejected).length
    const counted = (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`
    const path = join(questionsDir, `${language}.json`)
    if (values['dry-run']) {
        console.log(
            `${counted(acceptedCount)} accepted, ${rejectedCount} rejected; nothing written`
        )
    } else if (acceptedCount) {
        const file = mergeQuestions(readQuestions(questionsDir, language), accepted, entries)
        mkdirSync(questionsDir, { recursive: true })
        writeFileSync(path, serializeQuestions(file))
        console.log(`${shown(path)}: ${counted(acceptedCount)} written, ${rejectedCount} rejected`)
    } else {
        console.log(`Nothing written: ${counted(rejectedCount)} rejected`)
    }
    if (rejectedCount) process.exit(1)
}

if (values.help || !command) {
    console.log(USAGE)
} else if (command === 'check') {
    check()
} else if (command === 'packets') {
    packets()
} else if (command === 'merge') {
    merge()
} else {
    fail(`Unknown command "${command}"\n${USAGE}`)
}
