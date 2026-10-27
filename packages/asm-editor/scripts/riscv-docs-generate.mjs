#!/usr/bin/env node
/**
 * Writes `src/lib/languages/RISC-V/generated/riscvManual.ts`: for every mnemonic the RISC-V Core
 * accepts, the instruction the RISC-V ISA manual describes for it and where, for the link on its
 * documentation page and in its hover. The output is committed, so this runs when the Core's
 * instruction set or the pinned manual changes, not as part of the build:
 *
 *   node scripts/riscv-docs-generate.mjs [--udb <checkout>]
 *
 * A real instruction links to the rule that defines it (`x86-docs-generate.mjs` does the same for
 * Intel's manual); a pseudo-instruction links to the instruction it becomes, `mv` to `add`. Which
 * page of the manual holds an instruction depends on its extension, which the RISC-V Unified
 * Database names: `--udb <checkout>` (a clone of https://github.com/riscv/riscv-unified-db) reads
 * it, fetches the manual's pages into `.cache/riscv-docs`, and rewrites the extract
 * `riscv-docs/manual-links.txt`. Without it the run needs no network.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
    anchorFor,
    EXTENSION_PAGES,
    formatManualLinks,
    MANUAL_URL,
    manualLinksPath,
    manualPage,
    pageAnchors,
    readManualLinks
} from './riscv-docs/manual.mjs'
import { readUdbCheckout, UDB_REPOSITORY } from './riscv-docs/udb.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(packageRoot, 'src/lib/languages/RISC-V/generated')
const cacheDir = join(packageRoot, '.cache', 'riscv-docs', 'manual')
const udbCheckout = process.argv.includes('--udb')
    ? process.argv[process.argv.indexOf('--udb') + 1]
    : null
if (process.argv.includes('--udb') && !udbCheckout) throw new Error('--udb needs a checkout')

// The instruction list is the editor's TypeScript, which Node runs by stripping its types; what it
// does not do is resolve extensionless relative imports the way Vite does (as in
// `sim-header/generate.mjs`).
registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ? fileURLToPath(context.parentURL) : packageRoot
        const base =
            /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)
                ? join(dirname(parent), specifier)
                : undefined
        if (base !== undefined)
            for (const candidate of [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts')])
                if (existsSync(candidate) && /\.[cm]?[jt]s$/.test(candidate))
                    return nextResolve(pathToFileURL(candidate).href, context)
        return nextResolve(specifier, context)
    }
})

const { riscvInstructionMap } = await import(
    pathToFileURL(join(packageRoot, 'src/lib/languages/RISC-V/RISC-V-documentation.ts')).href
)
const names = [...riscvInstructionMap.keys()]
const isReal = (name) => riscvInstructionMap.get(name).some((form) => !form.isPseudo)

/** Older spellings the Core still accepts, by the name the manual and the database use now. */
const RENAMED = { 'fmv.s.x': 'fmv.w.x', 'fmv.x.s': 'fmv.x.w' }

// --- the extract ---------------------------------------------------------------------------------

if (udbCheckout) {
    const udb = readUdbCheckout(udbCheckout)
    const links = []
    const unknown = []
    for (const name of names.filter(isReal)) {
        const current = RENAMED[name] ?? name
        const own = udb.instructions.get(current)
        if (!own) {
            unknown.push(`${name} (not in the database)`)
            continue
        }
        const page =
            (own.xlen === 64 ? EXTENSION_PAGES[`${own.extension}.64`] : undefined) ??
            EXTENSION_PAGES[own.extension]
        if (!page) {
            unknown.push(`${name} (extension ${own.extension} has no page here)`)
            continue
        }
        const anchor = anchorFor(current, pageAnchors(await manualPage(page, cacheDir)))
        links.push({ mnemonic: name, page, anchor: anchor ?? '' })
    }
    writeFileSync(manualLinksPath, formatManualLinks({ udbCommit: udb.commit, links }))
    if (unknown.length) console.log(`no page in the manual: ${unknown.join(', ')}`)
}

// --- the join ------------------------------------------------------------------------------------

/**
 * Pseudo-instructions whose expansion's last instruction is not the one that says what they do:
 * `la` is `auipc` then `addi`, and the manual explains PC-relative addresses under `auipc`.
 */
const PSEUDO_TARGETS = { la: 'auipc' }

/**
 * The instruction a pseudo-instruction becomes: the one its first form expands to, or the last of
 * several (`call` is `auipc` then `jalr`), which is the one that does the work.
 */
function targetOf(name) {
    if (PSEUDO_TARGETS[name]) return PSEUDO_TARGETS[name]
    const forms = riscvInstructionMap.get(name)
    const single = forms.find((form) => form.expansion.length === 1)
    const expansion = single?.expansion ?? forms[0].expansion
    return expansion.at(-1)?.trim().split(/\s+/)[0]
}

const links = new Map(readManualLinks().map((link) => [link.mnemonic, link]))
const entries = []
const unlinked = []
for (const name of names) {
    const instruction = isReal(name) ? name : targetOf(name)
    const link = instruction ? links.get(instruction) : undefined
    if (!link) {
        unlinked.push(name)
        continue
    }
    entries.push([
        name,
        { instruction, page: link.page, ...(link.anchor ? { anchor: link.anchor } : {}) }
    ])
}

mkdirSync(outDir, { recursive: true })
writeFileSync(
    join(outDir, 'riscvManual.ts'),
    `/**
 * Where the RISC-V ISA manual describes each mnemonic the Core accepts, for the link to it.
 *
 * Generated by \`node scripts/riscv-docs-generate.mjs\`; edit that script, never this file.
 *
 * Pages and anchors: the RISC-V ISA manual (${MANUAL_URL}, CC BY 4.0), through the
 * extract \`${relative(packageRoot, manualLinksPath)}\`, which chose them by the extension the RISC-V
 * Unified Database (${UDB_REPOSITORY}) names. Names only.
 */

/** Where the manual's pages are: \`\${RISCV_MANUAL_URL}\${page}.html#\${anchor}\`. */
export const RISCV_MANUAL_URL = ${JSON.stringify(MANUAL_URL)}

export type RiscvManualLink = {
    /** The instruction the manual describes there: the mnemonic itself, or what a pseudo-instruction becomes. */
    instruction: string
    page: string
    /** The rule or section that defines it; none where the page has no anchor for it. */
    anchor?: string
}

/** Per mnemonic. ${unlinked.length ? `\`${unlinked.join('`, `')}\` ${unlinked.length === 1 ? 'has' : 'have'} none: the manual no longer describes it.` : ''} */
export const RISCV_MANUAL_LINKS: Record<string, RiscvManualLink> = {
${entries.map(([name, link]) => `    ${JSON.stringify(name)}: ${JSON.stringify(link)}`).join(',\n')}
}
`
)

const anchored = entries.filter(([, link]) => link.anchor).length
console.log(
    `riscvManual.ts  ${entries.length} of ${names.length} mnemonics linked, ${anchored} to an anchor; none for: ${unlinked.join(', ')}`
)
console.log(
    `without an anchor: ${entries
        .filter(([, link]) => !link.anchor)
        .map(([name]) => name)
        .join(', ')}`
)
