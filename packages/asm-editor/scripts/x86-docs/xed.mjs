/**
 * Intel XED's flag tables, the source of the flags strip on an x86 instruction page
 * (`docs/design/instruction-layout.md`, decision 5). XED (https://github.com/intelxed/xed,
 * Apache-2.0) describes every instruction form in its `datafiles`, one `{ ... }` record per group of
 * forms, and the record's `FLAGS` field says what the form does to RFLAGS:
 *
 *   FLAGS : MUST [ of-mod sf-mod zf-mod af-mod pf-mod cf-mod ]
 *   FLAGS : IMM1 MUST [ of-mod cf-mod ], IMMx MUST [ of-u cf-mod ]
 *
 * Each flag carries an action: `tst` reads it, `mod` writes it from the result, `pop` and `ah` load
 * it (from the stack, from AH), `0` and `1` set it to that value, `u` leaves it undefined. `MUST`
 * means every execution does so, `MAY` only some (a shift by `cl` with a count of 0 writes nothing),
 * and `READONLY` lists reads alone. A `IMM0`/`IMM1`/`IMMx` prefix splits a record by its immediate.
 *
 * The generator never reads a checkout of XED. It reads `xed-flags.txt` beside this file, a small
 * extract of the records it needs, so that it runs without the network; `extractXedFlags` writes
 * that extract from a checkout when XED is updated (`x86-docs-generate.mjs --xed <checkout>`).
 * A checkout is untrusted data: this module reads its text files and runs nothing in it, which is
 * why the commit is read out of `.git` by hand rather than by asking git.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const XED_REPOSITORY = 'https://github.com/intelxed/xed'
export const xedFlagsPath = join(dirname(fileURLToPath(import.meta.url)), 'xed-flags.txt')
export const xedLicencePath = join(dirname(fileURLToPath(import.meta.url)), 'XED-LICENSE.txt')

// --- the checkout ---------------------------------------------------------------------------------

/** Every `.txt` file under `datafiles`, in a stable order. */
function datafiles(root) {
    const found = []
    const walk = (directory) => {
        for (const name of readdirSync(directory).sort()) {
            const path = join(directory, name)
            if (statSync(path).isDirectory()) walk(path)
            else if (name.endsWith('.txt')) found.push(path)
        }
    }
    walk(join(root, 'datafiles'))
    return found
}

/**
 * The instruction records of one datafile. A record is a `{` line, `KEY : value` lines, and a `}`
 * line; one record can hold several `PATTERN`/`OPERANDS`/`IFORM` groups, which share its `FLAGS`.
 * `#` starts a comment anywhere on a line.
 */
export function parseXedRecords(text) {
    const records = []
    for (const match of text.matchAll(/^\{[ \t]*\n([\s\S]*?)^\}/gm)) {
        const values = (key) =>
            [...match[1].matchAll(new RegExp(`^[ \\t]*${key}[ \\t]*:(.*)$`, 'gm'))].map((line) =>
                line[1].replace(/#.*$/, '').replace(/\s+/g, ' ').trim()
            )
        const iclass = values('ICLASS')[0]
        if (!iclass) continue
        records.push({
            iclass,
            extension: values('EXTENSION')[0] ?? '',
            isaSet: values('ISA_SET')[0] ?? '',
            cpl: values('CPL')[0] ?? '',
            flags: values('FLAGS')[0] ?? '',
            iforms: values('IFORM')
        })
    }
    return records
}

/** The commit a checkout is at, read from `.git` without running anything in it. */
function checkoutCommit(root) {
    const git = join(root, '.git')
    const head = readFileSync(join(git, 'HEAD'), 'utf8').trim()
    const ref = /^ref: (.+)$/.exec(head)
    if (!ref) return head
    const loose = join(git, ref[1])
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim()
    const packed = readFileSync(join(git, 'packed-refs'), 'utf8')
    const line = packed.split('\n').find((entry) => entry.endsWith(` ${ref[1]}`))
    if (!line) throw new Error(`cannot resolve ${ref[1]} in ${git}`)
    return line.split(' ')[0]
}

/**
 * The records the documentation needs, out of a checkout of XED. APX's re-encodings (extension
 * `APXEVEX` or `APXLEGACY`, or an `APX_` ISA set such as `APX_F_MOVBE`) are left behind: they reuse
 * the base instruction classes (`ADD` is also an EVEX form that can be told to write no flags at
 * all), and no Target here runs APX.
 *
 * `available` comes back too, every instruction class the checkout has, so the caller can resolve
 * names against the whole of XED before choosing what to keep.
 */
export function readXedCheckout(root) {
    const records = []
    /** Each datafile's own copyright line, which the extract has to carry for the files it uses. */
    const notices = new Map()
    for (const path of datafiles(root)) {
        const text = readFileSync(path, 'latin1')
        if (!/^\s*ICLASS\s*:/m.test(text)) continue
        const file = relative(root, path)
        const notice = /Copyright \(c\) [\d-]+ Intel Corporation/.exec(text)
        if (notice) notices.set(file, notice[0])
        for (const record of parseXedRecords(text)) {
            if (/^APX/.test(record.extension) || /^APX/.test(record.isaSet)) continue
            records.push({ ...record, file })
        }
    }
    const licence = readFileSync(join(root, 'LICENSE'), 'utf8')
    if (!licence.includes('Apache License') || !licence.includes('Version 2.0')) {
        throw new Error(
            `${root}/LICENSE is no longer the Apache License 2.0; check before vendoring`
        )
    }
    return {
        commit: checkoutCommit(root),
        version: existsSync(join(root, 'VERSION'))
            ? readFileSync(join(root, 'VERSION'), 'utf8').trim()
            : '',
        licence,
        notices,
        records
    }
}

// --- the vendored extract -------------------------------------------------------------------------

const COLUMNS = ['iclass', 'extension', 'isaSet', 'cpl', 'iforms', 'flags']

/** The extract, as `xed-flags.txt` holds it: a header naming its source, one record per line. */
export function formatXedFlags({ commit, version, notices, records }) {
    const files = [...new Set(records.map((record) => record.file))].sort()
    const width = Math.max(...files.map((file) => file.length))
    const header = [
        'The status flags x86 instructions read and write, for the instructions the editor documents.',
        '',
        `Extracted from Intel XED (${XED_REPOSITORY}), ${version || 'unversioned'}, commit`,
        `${commit},`,
        'by `node scripts/x86-docs-generate.mjs --xed <checkout>`; regenerate it that way rather than',
        'editing it.',
        '',
        'SPDX-License-Identifier: Apache-2.0; the licence is XED-LICENSE.txt beside this file.',
        'Modified: from the instruction records of the files below, only the ICLASS, EXTENSION,',
        'ISA_SET, CPL, IFORM and FLAGS fields are kept, one record per line, tab separated, IFORMs',
        'joined by commas ("-" where a field is absent); APX re-encodings and the instruction classes',
        'the documentation does not use are left out. Each file carries its own notice:',
        '',
        ...files.map(
            (file) => `  ${file.padEnd(width)}  ${notices.get(file) ?? 'Intel Corporation'}`
        ),
        '',
        COLUMNS.join('\t')
    ]
    const lines = records.map((record) =>
        [
            record.iclass,
            record.extension || '-',
            record.isaSet || '-',
            record.cpl || '-',
            record.iforms.length ? record.iforms.join(',') : '-',
            record.flags || '-'
        ].join('\t')
    )
    return `${header.map((line) => `#${line ? ` ${line}` : ''}`).join('\n')}\n${lines.join('\n')}\n`
}

/** Reads `xed-flags.txt` back: its source line and its records. */
export function readXedFlags(path = xedFlagsPath) {
    if (!existsSync(path)) {
        throw new Error(
            `missing ${path}; extract it from a checkout of ${XED_REPOSITORY} with --xed <checkout>`
        )
    }
    const text = readFileSync(path, 'utf8')
    const source = /^# Extracted from Intel XED \((\S+)\), (.*), commit\n# (\w+),/m.exec(text)
    if (!source) throw new Error(`${path} does not name the XED commit it came from`)
    const records = text
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
            const cells = line.split('\t')
            if (cells.length !== COLUMNS.length) throw new Error(`${path}: bad line ${line}`)
            const [iclass, extension, isaSet, cpl, iforms, flags] = cells.map((cell) =>
                cell === '-' ? '' : cell
            )
            return {
                iclass,
                extension,
                isaSet,
                cpl,
                iforms: iforms ? iforms.split(',') : [],
                flags
            }
        })
    return { repository: source[1], version: source[2], commit: source[3], records }
}

// --- the FLAGS field ------------------------------------------------------------------------------

/**
 * `IMM1 MUST [ of-mod cf-mod ], IMMx MUST [ of-u cf-mod ]` as a list of variants, each with its
 * condition (`IMM1`, or empty for the whole record), its qualifier and a map from flag to actions:
 * `{ condition: 'IMM1', qualifier: 'MUST', actions: Map { 'OF' => ['mod'], 'CF' => ['mod'] } }`.
 * A record with no `FLAGS` field is one variant that touches nothing.
 */
export function parseXedFlagsField(field) {
    if (!field.trim()) return [{ condition: '', qualifier: 'MUST', actions: new Map() }]
    return field.split(',').map((part) => {
        const match = /^\s*(?:(IMM\w+)\s+)?(MUST|MAY|READONLY)\s*\[([^\]]*)\]\s*$/.exec(part)
        if (!match) throw new Error(`unknown XED FLAGS field: ${field}`)
        const actions = new Map()
        for (const token of match[3].trim().split(/\s+/).filter(Boolean)) {
            const action = /^([a-z0-9]+)-(tst|mod|u|0|1|pop|ah)$/i.exec(token)
            if (!action) throw new Error(`unknown XED flag action ${token} in ${field}`)
            const flag = action[1].toUpperCase()
            actions.set(flag, [...(actions.get(flag) ?? []), action[2].toLowerCase()])
        }
        return { condition: match[1] ?? '', qualifier: match[2], actions }
    })
}
