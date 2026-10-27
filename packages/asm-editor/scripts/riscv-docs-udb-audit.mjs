#!/usr/bin/env node
/**
 * Checks the RISC-V Core and its documentation pages against the RISC-V Unified Database, whose
 * instruction files are checked against riscv-opcodes and LLVM:
 *
 *   git clone --depth 1 https://github.com/riscv/riscv-unified-db <checkout>
 *   node scripts/riscv-docs-udb-audit.mjs <checkout>
 *
 * For every real form of every mnemonic the Core accepts, it assembles the form's own example at
 * each width that has it and checks the word against the database's encoding, and it checks that
 * the pages say "RV64 only" exactly where the database says only RV64 has the instruction. It
 * prints the disagreements and writes nothing; a difference that is the Core's on purpose goes in
 * `EXPECTED` with the reason.
 *
 * The prose cannot be compared by a script; `docs/design/mips-riscv-references.md` records how
 * the descriptions are checked instead.
 */

import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { matchesEncoding, readUdbCheckout } from './riscv-docs/udb.mjs'

const checkoutRoot = process.argv[2]
if (!checkoutRoot) {
    throw new Error('usage: node scripts/riscv-docs-udb-audit.mjs <checkout of riscv-unified-db>')
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// The editor's modules are TypeScript, which Node runs by stripping the types; what it does not do
// is resolve their extensionless relative imports the way Vite does (as in `sim-header/generate.mjs`).
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
const { makeRiscVFromFiles } = await import('@specy/risc-v')

/** Older spellings the Core still accepts, by the name the database uses now. */
const RENAMED = { 'fmv.s.x': 'fmv.w.x', 'fmv.x.s': 'fmv.x.w' }

/**
 * Disagreements that are the Core's on purpose: the mnemonics, the checks (`missing`, `width`,
 * `encoding`) and why. Each entry has to still match something, so a fix shows up as an entry to
 * delete.
 */
const EXPECTED = [
    {
        names: ['uret'],
        checks: ['missing'],
        reason: "RARS keeps the N extension's return for its user-level trap handlers; the ratified ISA dropped the extension"
    }
]

/**
 * The first word the Core assembles for `example`, alone in a program, at one width. The examples
 * branch to `label` or `target`, which are defined after it, and RARS writes a shift amount the way
 * RV64 takes it (`slli t1,t2,33`): at RV32 a number out of range is tried again in five bits.
 */
function assembled(example, is64Bit) {
    const first = assembledOnce(example, is64Bit)
    if (is64Bit || !first.error?.includes('out of range')) return first
    return assembledOnce(
        example.replace(/\b\d+\b(?!\()/g, (number) => String(Number(number) & 31)),
        is64Bit
    )
}

function assembledOnce(example, is64Bit) {
    const source = `.text\n${example}\nlabel:\ntarget:\n`
    const core = makeRiscVFromFiles({ 'main.s': source }, 'main.s', { is64Bit })
    const result = core.assemble()
    if (result.hasErrors) return { error: result.errors.map((error) => error.message).join('; ') }
    const [first] = core.getCompiledStatements()
    return first ? { word: first.binaryStatement >>> 0 } : { error: 'nothing assembled' }
}

const udb = readUdbCheckout(checkoutRoot)
const findings = new Map()
const expectedSeen = new Set()
function report(name, check, message) {
    const expected = EXPECTED.find(
        (entry) => entry.names.includes(name) && entry.checks.includes(check)
    )
    if (expected) {
        expectedSeen.add(expected)
        return
    }
    findings.set(message, [...(findings.get(message) ?? []), name])
}

let compared = 0
for (const [name, forms] of riscvInstructionMap) {
    const real = forms.filter((form) => !form.isPseudo)
    if (real.length === 0) continue
    const own = udb.instructions.get(RENAMED[name] ?? name)
    if (!own) {
        report(name, 'missing', 'not in the database')
        continue
    }
    compared++
    const rv64Only = real.every((form) => form.isRv64Only)
    if (rv64Only !== (own.xlen === 64)) {
        report(
            name,
            'width',
            rv64Only
                ? 'the page says RV64 only, the database has it at both widths'
                : 'the page offers it on RV32, the database has it only on RV64'
        )
    }
    for (const form of real) {
        for (const width of form.isRv64Only ? [64] : [32, 64]) {
            const pattern = own.encodings[width]
            if (!pattern) continue
            const { word, error } = assembled(form.example, width === 64)
            if (error) {
                report(
                    name,
                    'encoding',
                    `\`${form.example}\` does not assemble at RV${width}: ${error}`
                )
            } else if (!matchesEncoding(word, pattern)) {
                report(
                    name,
                    'encoding',
                    `\`${form.example}\` assembles at RV${width} to ${word.toString(2).padStart(32, '0')}, the database's pattern is ${pattern}`
                )
            }
        }
    }
}

console.log(`# RISC-V Core against the RISC-V Unified Database`)
console.log('')
console.log(`commit ${udb.commit}; ${compared} mnemonics with real forms compared`)
console.log('')
if (findings.size === 0) console.log('No disagreements.')
for (const [message, names] of findings) console.log(`- ${names.join(', ')}: ${message}`)
const stale = EXPECTED.filter((entry) => !expectedSeen.has(entry))
if (stale.length) {
    console.log('')
    console.log('EXPECTED entries that no longer happen, to delete:')
    for (const entry of stale) console.log(`- ${entry.names.join(', ')}: ${entry.reason}`)
}
