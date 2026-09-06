#!/usr/bin/env node
/**
 * The voice check for the courses: every `.md` and `meta.json` under `src/content` is read against
 * the banned list of `docs/courses/voice.md`, and a single hit fails the run.
 *
 * The list below is the whole point of the script, so it is written to be read and edited: one entry
 * per rule, with the name the guide gives it and a hint saying what to write instead. Add a rule by
 * adding a line; the walking and the reporting below never need to change.
 *
 * Run it with `npm run check:voice`; `npm run lint` runs it too.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'src', 'content')

/**
 * `pattern` is matched against each line. Keep the flags `g` and, where the phrase is prose rather
 * than a heading, `i`.
 */
const RULES = [
    // --- dashes: a comma, a full stop or parentheses instead ---
    { name: 'em dash', pattern: /—/g, hint: 'use a comma, a full stop or parentheses' },
    { name: 'en dash', pattern: /–/g, hint: 'use a comma, a full stop or parentheses' },

    // --- contrast frames ---
    {
        name: "it's not X, it's Y",
        pattern: /\bit'?s not\b[^.!?\n]*,\s*it'?s\b/gi,
        hint: 'say what it is'
    },
    { name: 'not just X but Y', pattern: /\bnot just\b[^.!?\n]*\bbut\b/gi, hint: 'say what it is' },
    { name: "it isn't about X", pattern: /\bit\s+isn'?t about\b/gi, hint: 'say what it is about' },
    { name: 'rather than X, Y', pattern: /\brather than\b[^.!?\n]*,/gi, hint: 'say what it does' },

    // --- openers and closers ---
    { name: "let's dive in", pattern: /\blet'?s dive in\b/gi, hint: 'start on the topic' },
    {
        name: 'in this lecture we will explore',
        pattern: /\bin this (lecture|chapter|course) (we|you) will\b/gi,
        hint: 'tie to the previous lecture instead'
    },
    { name: 'in this section', pattern: /\bin this section\b/gi, hint: 'say what is here' },
    {
        name: 'by the end of this lecture',
        pattern: /\bby the end of this\b/gi,
        hint: 'say what is here'
    },
    { name: 'in conclusion', pattern: /\bin conclusion\b/gi, hint: 'close on the code' },
    { name: 'to summarize', pattern: /\bto summari[sz]e\b/gi, hint: 'close on the code' },
    { name: 'key takeaway', pattern: /\bkey takeaways?\b/gi, hint: 'close on the code' },
    { name: 'Congratulations', pattern: /\bcongratulations\b/gi, hint: 'close on the code' },
    { name: 'Happy coding', pattern: /\bhappy coding\b/gi, hint: 'close on the code' },

    // --- filler and flourish ---
    { name: 'essentially', pattern: /\bessentially\b/gi, hint: 'drop it' },
    { name: 'crucial', pattern: /\bcrucial(ly)?\b/gi, hint: 'say why it matters' },
    { name: 'critical', pattern: /\bcritical(ly)?\b/gi, hint: 'say why it matters' },
    { name: 'seamlessly', pattern: /\bseamless(ly)?\b/gi, hint: 'drop it' },
    { name: 'robust', pattern: /\brobust\b/gi, hint: 'drop it' },
    { name: 'leverage', pattern: /\bleverages?\b/gi, hint: 'use' },
    { name: 'delve', pattern: /\bdelves?\b/gi, hint: 'look at' },
    { name: 'elegant', pattern: /\belegant(ly)?\b/gi, hint: 'drop it' },
    { name: 'powerful', pattern: /\bpowerful\b/gi, hint: 'say what it does' },
    {
        name: 'fundamental building block',
        pattern: /\bfundamental building block/gi,
        hint: 'name it'
    },
    { name: 'under the hood', pattern: /\bunder the hood\b/gi, hint: 'say where' },
    { name: 'at its core', pattern: /\bat its core\b/gi, hint: 'drop it' },
    { name: 'world of', pattern: /\bworld of\b/gi, hint: 'drop it' },
    { name: 'journey', pattern: /\bjourneys?\b/gi, hint: 'drop it' },

    // --- textbook hedges and recap headings ---
    { name: 'Note that', pattern: /\bnote that\b/gi, hint: 'just say it' },
    { name: 'It is important to', pattern: /\bit is important to\b/gi, hint: 'just say it' },
    { name: 'Keep in mind', pattern: /\bkeep in mind\b/gi, hint: 'just say it' },
    {
        name: 'Summary or Conclusion heading',
        pattern: /^#{1,6}\s+.*\b(summary|conclusion|recap|takeaways?)\b/gim,
        hint: 'close on the code, not on a recap'
    }
]

function contentFiles(directory) {
    const found = []
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        if (statSync(path).isDirectory()) {
            found.push(...contentFiles(path))
        } else if (entry.endsWith('.md') || entry === 'meta.json') {
            found.push(path)
        }
    }
    return found
}

function hitsIn(path) {
    const hits = []
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const rule of RULES) {
        lines.forEach((line, index) => {
            rule.pattern.lastIndex = 0
            let match
            while ((match = rule.pattern.exec(line)) !== null) {
                hits.push({
                    line: index + 1,
                    column: match.index + 1,
                    rule: rule.name,
                    hint: rule.hint,
                    match: match[0]
                })
                if (match[0].length === 0) rule.pattern.lastIndex++
            }
        })
    }
    return hits.sort((a, b) => a.line - b.line || a.column - b.column)
}

let total = 0
for (const path of contentFiles(CONTENT).sort()) {
    for (const hit of hitsIn(path)) {
        total++
        const where = `${relative(ROOT, path)}:${hit.line}:${hit.column}`
        console.log(`${where}  ${hit.rule}  "${hit.match.trim()}"  (${hit.hint})`)
    }
}

if (total > 0) {
    console.log(`\n${total} voice ${total === 1 ? 'problem' : 'problems'} in src/content.`)
    console.log('The list is docs/courses/voice.md, the rules are in scripts/check-voice.mjs.')
    process.exit(1)
}
console.log('src/content reads in the voice.')
