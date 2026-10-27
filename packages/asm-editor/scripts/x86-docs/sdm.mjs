/**
 * Intel's preview of its manual as data (https://github.com/intel/SDM), read for two jobs: naming
 * the page of Intel's manual an x86 instruction links to, and, in `x86-docs-sdm-audit.mjs`,
 * checking what our pages say against Intel's executable pseudocode.
 *
 * The preview's notice, repeated in every data file, grants no right beyond publishing an
 * unmodified copy ("No rights are granted to create modifications or derivatives of this
 * document"), and each file says its code is not the 0BSD "Sample Code". So nothing of Intel's
 * text, tables or pseudocode is committed. The extract `intel-sdm-pages.txt` beside this file holds
 * names only: each page's, which is its URL, the XED instruction classes of its encodings and the
 * mnemonics its syntax lines spell. The audit reads a checkout and prints a report; what it finds
 * is written into our pages in our own words.
 *
 * Every encoding in the data names its XED form (`xed_iform="ADD_GPRv_MEMv"`), and a form's name
 * starts with its class. That is how a documented mnemonic finds its page: through the XED classes
 * its flags strip already uses (`flags.mjs`).
 *
 * A checkout is untrusted data: this module reads its text files and runs nothing in it.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { checkoutCommit } from './xed.mjs'

export const SDM_REPOSITORY = 'https://github.com/intel/SDM'
/** Where the site serves a page: `${SDM_PAGE_URL}${page}.html`. */
export const SDM_PAGE_URL = 'https://intel.github.io/SDM/instruction/'
export const sdmPagesPath = join(dirname(fileURLToPath(import.meta.url)), 'intel-sdm-pages.txt')

/** The sentence whose absence means Intel relaxed the licence, and more may be usable. */
const NO_DERIVATIVES = 'No rights are granted to create modifications or derivatives'

// --- the checkout ---------------------------------------------------------------------------------

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function unescape(text) {
    return text.replace(/&(lt|gt|amp|quot|apos);/g, (_, name) => ENTITIES[name])
}

function codeLines(xml) {
    return [...xml.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((match) => unescape(match[1]))
}

function calleesOf(xml) {
    return [...xml.matchAll(/<callee>([^<]*)<\/callee>/g)].map((match) => match[1])
}

function attribute(attributes, name) {
    return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? ''
}

/**
 * One page's `data/instruction/<page>.xml`: its encodings and its operations. An encoding is
 * `{ xedIform, valid32, valid64, mnemonics, code, callees, exceptions }`, where `valid64` is `V`
 * or `N.E.` (not encodable) and `exceptions` pairs a condition with its fault (`LockPrefix`,
 * `#UD`); an operation is the pseudocode an encoding's `Instr_<name>` callee runs.
 */
export function parseSdmInstruction(page, xml) {
    const iforms = [...xml.matchAll(/<iform ([^>]*)>([\s\S]*?)<\/iform>/g)].map(
        ([, attributes, body]) => ({
            xedIform: attribute(attributes, 'xed_iform'),
            valid32: attribute(attributes, 'valid32'),
            valid64: attribute(attributes, 'valid64'),
            mnemonics: [...body.matchAll(/<assembly-syntax mnemonic="([^"]*)"/g)].map(
                (match) => match[1]
            ),
            code: codeLines(body),
            callees: calleesOf(body),
            exceptions: [
                ...body.matchAll(
                    /<exception_condition>([\s\S]*?)<\/exception_condition>\s*<exception_fault>([\s\S]*?)<\/exception_fault>/g
                )
            ].map((match) => ({
                condition: unescape(match[1]).trim(),
                fault: unescape(match[2]).trim()
            }))
        })
    )
    const operations = [
        ...xml.matchAll(/<operation name="([^"]*)"[^>]*>([\s\S]*?)<\/operation>/g)
    ].map(([, name, body]) => ({ name, code: codeLines(body), callees: calleesOf(body) }))
    return { page, iforms, operations }
}

/** Every page of a checkout, in name order, with the commit and the specification's release. */
export function readSdmCheckout(root) {
    const directory = join(root, 'data', 'instruction')
    const pages = readdirSync(directory)
        .filter((name) => name.endsWith('.xml'))
        .sort()
        .map((name) =>
            parseSdmInstruction(
                name.slice(0, -'.xml'.length),
                readFileSync(join(directory, name), 'utf8')
            )
        )
    const versions = JSON.parse(readFileSync(join(root, 'data', 'versions.json'), 'utf8'))
    const licence = readFileSync(join(root, 'License.md'), 'utf8')
    return {
        commit: checkoutCommit(root),
        version: versions['ia-spec'] ?? '',
        relicensed: !licence.includes(NO_DERIVATIVES),
        pages
    }
}

/**
 * The helper functions the pseudocode calls (`Add`, `Condition_Holds`), from
 * `data/definitions.xml.gz`: name to `{ code, callees }`.
 */
export function readSdmDefinitions(root) {
    const xml = gunzipSync(readFileSync(join(root, 'data', 'definitions.xml.gz'))).toString('utf8')
    const definitions = new Map()
    for (const [, name, body] of xml.matchAll(
        /<definition name="([^"]*)"[^>]*>([\s\S]*?)<\/definition>/g
    )) {
        definitions.set(name, { code: codeLines(body), callees: calleesOf(body) })
    }
    return definitions
}

/**
 * The opcode table at the head of a page's `data/sdm/<page>.docbook`, as the manual prints it: one
 * row per encoding, `{ instruction, mode64 }`, where `instruction` is the syntax column
 * (`ADD r/m64, imm8`) and `mode64` the 64-bit mode column (`Valid`, `Invalid`, `N.E.`). Empty
 * for a page laid out another way (VEX and EVEX pages combine the modes in one column). The
 * encodings' own `valid64` is not used for this: in release-1.92.4 it says `V` for BOUND and
 * PUSHA, which the table marks Invalid in 64-bit mode.
 */
export function readSdmOpcodeTable(root, page) {
    const path = join(root, 'data', 'sdm', `${page}.docbook`)
    if (!existsSync(path)) return []
    const table = /<table[\s\S]*?<\/table>/.exec(readFileSync(path, 'utf8'))?.[0] ?? ''
    const cells = (row) =>
        [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) =>
            unescape(match[1].replace(/<[^>]+>/g, ''))
                .replace(/\s+/g, ' ')
                .trim()
        )
    const head = /<thead>([\s\S]*?)<\/thead>/.exec(table)
    if (!head) return []
    const columns = cells(head[1])
    const instruction = columns.findIndex((column) => /^instruction$/i.test(column))
    const mode64 = columns.findIndex((column) => /^64-bit mode$/i.test(column))
    if (instruction < 0 || mode64 < 0) return []
    return [...table.slice(head.index + head[0].length).matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
        .map((match) => cells(match[1]))
        .filter((row) => row.length > Math.max(instruction, mode64))
        .map((row) => ({ instruction: row[instruction], mode64: row[mode64] }))
}

/**
 * The XED class an encoding belongs to, out of `classes`: the longest whose name is the form's or
 * begins it (`MOV_CR` for `MOV_CR_CR_GPR64`, not `MOV`). Empty when none of them does.
 */
export function classOfIform(iform, classes) {
    let found = ''
    for (const iclass of classes) {
        if ((iform === iclass || iform.startsWith(`${iclass}_`)) && iclass.length > found.length) {
            found = iclass
        }
    }
    return found
}

/**
 * The extract's records, one per page: `{ page, classes, mnemonics }`, where `classes` are the
 * ones out of `classes` (the documentation's, from `xed-flags.txt`) that the page has encodings of.
 */
export function sdmPageRecords(checkout, classes) {
    return checkout.pages.map(({ page, iforms }) => ({
        page,
        classes: [
            ...new Set(iforms.map((iform) => classOfIform(iform.xedIform, classes)).filter(Boolean))
        ].sort(),
        mnemonics: [...new Set(iforms.flatMap((iform) => iform.mnemonics))].sort()
    }))
}

// --- the vendored extract -------------------------------------------------------------------------

const COLUMNS = ['page', 'xed classes', 'mnemonics']

/** The extract, as `intel-sdm-pages.txt` holds it: a header naming its source, one page per line. */
export function formatSdmPages({ commit, version, records }) {
    const header = [
        "Which page of Intel's preview SDM documents each x86 instruction, for the link on its page.",
        '',
        `Extracted from ${SDM_REPOSITORY}, ia-spec ${version || 'unversioned'}, commit`,
        `${commit},`,
        'by `node scripts/x86-docs-generate.mjs --sdm <checkout>`; regenerate it that way rather than',
        'editing it.',
        '',
        `Names only: each page's, which is its URL under ${SDM_PAGE_URL},`,
        'the XED instruction classes the documentation uses that the page has encodings of, and the',
        "mnemonics its syntax lines spell. No text, table or pseudocode of Intel's is copied: the",
        "preview's notice allows no modified copy or derivative of them.",
        '',
        COLUMNS.join('\t')
    ]
    const lines = records.map((record) =>
        [
            record.page,
            record.classes.length ? record.classes.join(',') : '-',
            record.mnemonics.length ? record.mnemonics.join(',') : '-'
        ].join('\t')
    )
    return `${header.map((line) => `#${line ? ` ${line}` : ''}`).join('\n')}\n${lines.join('\n')}\n`
}

/** Reads `intel-sdm-pages.txt` back: its source line and its records. */
export function readSdmPages(path = sdmPagesPath) {
    if (!existsSync(path)) {
        throw new Error(
            `missing ${path}; extract it from a checkout of ${SDM_REPOSITORY} with --sdm <checkout>`
        )
    }
    const text = readFileSync(path, 'utf8')
    const source = /^# Extracted from (\S+), ia-spec (.*), commit\n# (\w+),/m.exec(text)
    if (!source) throw new Error(`${path} does not name the commit it came from`)
    const records = text
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
            const cells = line.split('\t')
            if (cells.length !== COLUMNS.length) throw new Error(`${path}: bad line ${line}`)
            const [page, classes, mnemonics] = cells.map((cell) => (cell === '-' ? '' : cell))
            return {
                page,
                classes: classes ? classes.split(',') : [],
                mnemonics: mnemonics ? mnemonics.split(',') : []
            }
        })
    return { repository: source[1], version: source[2], commit: source[3], records }
}

// --- the join -------------------------------------------------------------------------------------

/**
 * The page each NASM mnemonic links to. A documented one goes through the first XED class of its
 * flags strip, the instruction it chiefly is: `cmpsd` is first the string compare, which the
 * preview has no page for, so it gets no link rather than the SSE2 compare's. Any other mnemonic
 * goes by the syntax lines, and a name more than one page spells (`movsd`, the string move and the
 * SSE2 one) gets no link. Throws when one class has encodings on two pages, which nobody has
 * decided between.
 */
export function sdmPagesOf(names, documentedClasses, records) {
    const byClass = new Map()
    for (const record of records) {
        for (const iclass of record.classes) {
            const known = byClass.get(iclass)
            if (known && known !== record.page) {
                throw new Error(
                    `XED class ${iclass} has encodings on Intel's pages ${known} and ${record.page}; decide which one documents it`
                )
            }
            byClass.set(iclass, record.page)
        }
    }
    const pages = {}
    for (const name of names) {
        const iclass = documentedClasses[name]
        if (iclass !== undefined) {
            const page = byClass.get(iclass)
            if (page) pages[name] = page
            continue
        }
        const mnemonic = name.toUpperCase()
        const spelling = records.filter((record) => record.mnemonics.includes(mnemonic))
        if (spelling.length === 1) pages[name] = spelling[0].page
    }
    return pages
}
