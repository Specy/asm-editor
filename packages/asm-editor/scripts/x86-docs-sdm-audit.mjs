#!/usr/bin/env node
/**
 * Checks the x86 instruction pages against Intel's preview SDM, whose pseudocode is executable
 * and was tested against hardware:
 *
 *   git clone --depth 1 https://github.com/intel/SDM <checkout>
 *   node scripts/x86-docs-sdm-audit.mjs <checkout>
 *
 * For every documented instruction Intel has a page for, it compares what the page shows with what
 * Intel's encodings of the same XED classes do: each flag on the strip, whether it can be used in
 * 64-bit mode (from the manual's opcode table), and whether it takes `lock`. It prints the
 * disagreements
 * and writes nothing. Intel's notice allows no derivative of the preview (`x86-docs/sdm.mjs`), so
 * a finding is fixed in our own words, in `X86-documentation.ts`, `instructionNames.ts` or the
 * generator; a difference that is ours on purpose goes in `EXPECTED` with the reason.
 *
 * The prose cannot be compared by a script. It was read against Intel's pages once, on
 * 2026-10-27, and `docs/design/x86-documentation.md` records what that changed.
 */

import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
    classOfIform,
    readSdmCheckout,
    readSdmDefinitions,
    readSdmOpcodeTable
} from './x86-docs/sdm.mjs'

const checkoutRoot = process.argv[2]
if (!checkoutRoot) {
    throw new Error('usage: node scripts/x86-docs-sdm-audit.mjs <checkout of intel/SDM>')
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

const load = (path) => import(pathToFileURL(join(packageRoot, path)).href)
const { X86_INSTRUCTION_FLAGS } = await load('src/lib/languages/X86/generated/x86Flags.ts')
const { x86DocumentedInstructions } = await load('src/lib/languages/X86/X86-documentation.ts')
const { x86InstructionDocument } = await load('src/lib/documentation/x86/instructionDocument.ts')

/** The flags a strip can show, in the order the registers panel lists them. */
const STRIP = ['CF', 'PF', 'AF', 'ZF', 'SF', 'TF', 'IF', 'DF', 'OF']

/**
 * Disagreements that are ours on purpose: the mnemonics, the checks (a flag, \`64-bit\` or
 * \`lock\`) and why. Each entry has to still match something, so a fix upstream or here shows up
 * as an entry to delete. The first two are the audit's own limit: it counts a flag Intel assigns
 * on one path as assigned on every path.
 */
const EXPECTED = [
    {
        names: ['brkpt', 'int', 'int03', 'int3', 'into', 'icebp', 'int01', 'int1'],
        checks: ['IF'],
        reason: 'delivery through an interrupt gate clears IF and through a trap gate leaves it, so changed is the true mark'
    },
    {
        names: ['into'],
        checks: ['TF'],
        reason: 'INTO interrupts only when OF is set, and only then clears TF'
    },
    {
        names: ['cli', 'sti'],
        checks: ['IF'],
        reason: 'with virtual interrupts enabled they change VIF and leave IF alone, so XED marks IF changed rather than cleared or set'
    },
    {
        names: ['shld', 'shrd'],
        checks: ['CF', 'PF', 'ZF', 'SF'],
        reason: 'undefined only for a 16-bit operand shifted by more than 16, which the strip says in its note'
    },
    {
        names: ['syscall'],
        checks: STRIP,
        reason: 'the strip shows the flags a Linux program sees once the call returns, which the kernel restores'
    },
    {
        names: ['jcxz'],
        checks: ['64-bit'],
        reason: "the forms shown, NASM's `jcxz target, ecx` and `jcxz target, rcx`, are `jecxz` and `jrcxz`; the plain `cx` form Intel lists is the one the page leaves out"
    }
]

// --- Intel's side ---------------------------------------------------------------------------------

/** Helpers that only report a fault: the flags they touch are the exception's, not the result's. */
const FAULTS = /^(Report_|Raise_|Signal_|Deliver_|Fault)/

function kindOf(value) {
    const text = value.replace(/;\s*$/, '').trim()
    if (/UNSPECIFIED/.test(text)) return 'undefined'
    if (text === '0b0') return 'cleared'
    if (text === '0b1') return 'set'
    return 'changed'
}

/** The weakest mark that is still true of all of them, as `flags.mjs` combines XED's records. */
function combine(kinds) {
    const distinct = new Set(kinds)
    if (distinct.size === 1) return [...distinct][0]
    return distinct.has('undefined') ? 'undefined' : 'changed'
}

/**
 * What one encoding does to each flag: its own code, the operation its `Instr_<name>` callee runs,
 * and every helper either calls that is not a fault report. A flag assigned under a condition
 * counts as assigned, as XED's `MAY` does, and the reads are not compared at all: the pseudocode
 * reads a flag to keep it (`var CF := RFLAGS.CF` before a shift by 0) as often as to use it.
 */
function encodingFlags(iform, page, definitions) {
    const lines = [...iform.code]
    const pending = [...iform.callees]
    for (const callee of iform.callees) {
        const name = /^Instr_(.+)$/.exec(callee)?.[1]
        for (const operation of page.operations.filter((operation) => operation.name === name)) {
            lines.push(...operation.code)
            pending.push(...operation.callees)
        }
    }
    const seen = new Set()
    while (pending.length) {
        const callee = pending.pop()
        if (seen.has(callee) || FAULTS.test(callee)) continue
        seen.add(callee)
        const definition = definitions.get(callee)
        if (!definition) continue
        lines.push(...definition.code)
        pending.push(...definition.callees)
    }
    const writes = new Map()
    let whole = false
    for (const line of lines) {
        const code = line.replace(/\/\/.*$/, '')
        const write = /\bRFLAGS\.([A-Z]+)\s*:=\s*(.*)$/.exec(code)
        if (write) writes.set(write[1], [...(writes.get(write[1]) ?? []), kindOf(write[2])])
        if (/\bRFLAGS\s*(\[[^\]]*\])?\s*:=/.test(code)) whole = true
    }
    const marks = {}
    for (const flag of STRIP) {
        marks[flag] = writes.has(flag) ? combine(writes.get(flag)) : whole ? 'changed' : 'unchanged'
    }
    return marks
}

const lockable = (iform) =>
    !iform.exceptions.some(
        (exception) => exception.condition === 'LockPrefix' && exception.fault === '#UD'
    )

// --- the comparison -------------------------------------------------------------------------------

const checkout = readSdmCheckout(checkoutRoot)
const definitions = readSdmDefinitions(checkoutRoot)
const classes = [...new Set(Object.values(X86_INSTRUCTION_FLAGS).flatMap((entry) => entry.xed))]

const encodings = new Map()
for (const page of checkout.pages) {
    for (const iform of page.iforms) {
        const iclass = classOfIform(iform.xedIform, classes)
        if (!iclass) continue
        encodings.set(iclass, [...(encodings.get(iclass) ?? []), { iform, page }])
    }
}

/** `<message>` to the mnemonics it holds for, so the condition spellings are said once. */
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
const noPage = []
for (const instruction of x86DocumentedInstructions) {
    const name = instruction.name
    const ours = X86_INSTRUCTION_FLAGS[name]
    // compared only where Intel has the instruction it chiefly is, as the link is (`cmpsd`, the
    // string compare, has no page, and the SSE2 compare's would say nothing about it)
    if (!ours || !encodings.has(ours.xed[0])) {
        noPage.push(name)
        continue
    }
    const intel = ours.xed.flatMap((iclass) => encodings.get(iclass) ?? [])
    compared++
    const document = x86InstructionDocument(instruction)
    const each = intel.map(({ iform, page }) => encodingFlags(iform, page, definitions))

    for (const flag of STRIP) {
        const theirs = combine(each.map((marks) => marks[flag]))
        const mine = document.flags?.marks?.[flag]?.kind ?? 'unchanged'
        if (theirs !== mine) report(name, flag, `${flag}: the strip says ${mine}, Intel ${theirs}`)
    }

    // The table's rows for this spelling; a size-suffixed name NASM adds (`enterd`) has none.
    const rows = [...new Set(intel.map(({ page }) => page.page))]
        .flatMap((page) => readSdmOpcodeTable(checkoutRoot, page))
        .filter((row) => row.instruction.split(/[\s,]/)[0].toLowerCase() === name)
    const ours64 = !document.headerFacts.includes('Not available in 64-bit mode')
    const intel64 = rows.some((row) => row.mode64.startsWith('Valid'))
    if (rows.length > 0 && ours64 !== intel64) {
        report(
            name,
            '64-bit',
            ours64
                ? 'the page offers it in 64-bit mode, Intel has no 64-bit encoding'
                : 'the page says it is not in 64-bit mode, Intel encodes it there'
        )
    }

    const oursLock = JSON.stringify(document).includes('takes `lock`')
    const intelLock = intel.some(({ iform }) => lockable(iform))
    if (oursLock !== intelLock) {
        report(
            name,
            'lock',
            oursLock
                ? 'a form says it takes `lock`, every Intel encoding faults with it'
                : 'no form says it takes `lock`, an Intel encoding accepts it'
        )
    }
}

console.log(`# x86 pages against Intel's SDM preview`)
console.log('')
console.log(`ia-spec ${checkout.version}, commit ${checkout.commit}`)
console.log('')
console.log(
    `${compared} documented instructions compared; no Intel encodings for ${noPage.length}: ${noPage.join(', ')}`
)
console.log('')
if (findings.size === 0) console.log('No disagreements.')
for (const [message, names] of [...findings].sort(([, a], [, b]) => a[0].localeCompare(b[0]))) {
    console.log(`- ${names.join(', ')}: ${message}`)
}
const stale = EXPECTED.filter((entry) => !expectedSeen.has(entry))
if (stale.length) {
    console.log('')
    console.log('EXPECTED entries that no longer happen, to delete:')
    for (const entry of stale) console.log(`- ${entry.names.join(', ')}: ${entry.reason}`)
}
