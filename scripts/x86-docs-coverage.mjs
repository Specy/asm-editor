#!/usr/bin/env node
/**
 * Measures how much of an x86 instruction reference the sources we are allowed to ship actually
 * cover, which is the measurement behind `docs/design/x86-documentation.md`.
 *
 * It reads the same tables, through the same parsers, as `scripts/x86-docs-generate.mjs`, and
 * answers a different question: what the sources offer before any curation. The generator answers
 * what ships, after the size suffix aliases and the extension rule, and prints its own totals. The
 * two disagree on purpose, and the generator is the one to quote.
 *
 * Run this after a NASM update to see what moved in the sources.
 *
 *   node scripts/x86-docs-coverage.mjs [--fetch] [--missing] [--sample MNEMONIC]
 */

import {
    cached,
    expandTemplate,
    isTemplate,
    parseInsref,
    parseOpcodes,
    readBlinkSyscalls,
    readConditionCodes,
    readNasmNames,
    readNasmTable,
    readNasmTokens
} from './x86-docs/sources.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
    const at = args.indexOf(name)
    return at === -1 ? undefined : args[at + 1]
}

/** Assembler pseudo-ops. They are directives that happen to live in the instruction table. */
const PSEUDO = /^(d[bwdqtoyz]|res[bwdqtoyz]|incbin|equ)$/

/**
 * The headings whose instructions a program in this editor is written from. `X86-documentation.ts`
 * keeps the same list and then drops anything that needs an extension in every form, so the set it
 * publishes is smaller than the one counted here.
 */
const INTEGER_SECTIONS = [
    'Integer data move instructions',
    'Load effective address',
    'The basic 8 arithmetic operations',
    'Bitwise testing',
    'The basic shift and rotate operations',
    'Other basic integer arithmetic',
    'Double width shift',
    'Sign and zero extension',
    'Bit operations',
    'Endianness handling',
    'Decimal arithmetic',
    'Atomic operations',
    'Stack operations',
    'Jumps',
    'Conditional instructions',
    'Call and return',
    'Interrupts, system calls, and returns',
    'Flag register instructions',
    'String instructions',
    'No operation'
]

const accepted = readNasmNames()
const conditions = readConditionCodes()
const table = readNasmTable()
const tokens = readNasmTokens()
const syscalls = readBlinkSyscalls()
const insref = parseInsref(
    await cached('insref.src', { fetch: flag('--fetch') }),
    accepted,
    conditions
)
const opcodes = parseOpcodes(await cached('x86_64.xml', { fetch: flag('--fetch') }))

/** A template row (`Jcc`) stands for every name it expands to. */
const entryFor = new Map()
for (const [mnemonic, entry] of table.byMnemonic) {
    const names = isTemplate(mnemonic, accepted)
        ? expandTemplate(mnemonic, accepted, conditions)
        : [mnemonic]
    for (const name of names) {
        const merged = entryFor.get(name) ?? { sections: new Set(), forms: [] }
        for (const section of entry.sections) merged.sections.add(section)
        merged.forms.push(...entry.forms)
        entryFor.set(name, merged)
    }
}

const mnemonics = accepted.filter((name) => !PSEUDO.test(name)).sort()
const sectionOf = (name) => [...(entryFor.get(name)?.sections ?? [])][0] ?? ''
const documented = mnemonics.filter((name) => INTEGER_SECTIONS.includes(sectionOf(name)))

const withProse = mnemonics.filter((name) => insref.byMnemonic.has(name))
const withSummary = mnemonics.filter((name) => opcodes.has(name))
const withNeither = mnemonics.filter((name) => !insref.byMnemonic.has(name) && !opcodes.has(name))
const pct = (part, whole) => `${((part / whole) * 100).toFixed(1)}%`

console.log(`NASM 3.00        ${mnemonics.length} mnemonics, ${table.sections.length} sections`)
console.log(
    `insref 2.05.01   ${insref.entries.length} entries covering ${insref.byMnemonic.size} mnemonics`
)
console.log(`Opcodes          ${opcodes.size} mnemonics`)
console.log(
    `tokens.dat       ${tokens.reduce((n, group) => n + group.tokens.length, 0)} prefixes and specifiers`
)
console.log(`blink            ${syscalls.length} syscalls`)
console.log('')
console.log(
    `prose            ${withProse.length}/${mnemonics.length} (${pct(withProse.length, mnemonics.length)})`
)
console.log(
    `summary          ${withSummary.length}/${mnemonics.length} (${pct(withSummary.length, mnemonics.length)})`
)
console.log(
    `neither          ${withNeither.length}/${mnemonics.length} (${pct(withNeither.length, mnemonics.length)})`
)
console.log('')

const documentedProse = documented.filter((name) => insref.byMnemonic.has(name))
console.log(
    `integer sections ${documented.length} mnemonics, prose for ${documentedProse.length} (${pct(documentedProse.length, documented.length)}) before aliases`
)
console.log('')
console.log('section                                    mnemonics  prose  summary')
for (const section of INTEGER_SECTIONS) {
    const inSection = mnemonics.filter((name) => sectionOf(name) === section)
    const prose = inSection.filter((name) => insref.byMnemonic.has(name)).length
    const summary = inSection.filter((name) => opcodes.has(name)).length
    console.log(
        `${section.padEnd(42)} ${String(inSection.length).padStart(9)}  ${String(prose).padStart(5)}  ${String(summary).padStart(7)}`
    )
}

/** insref predates long mode, which is why the forms come from the table instead. */
const insrefForms = insref.entries.reduce((count, entry) => count + entry.forms.length, 0)
const insref64 = insref.entries.reduce(
    (count, entry) =>
        count +
        entry.forms.filter((form) => /reg64|r\/m64|\br(ax|bx|cx|dx|si|di|sp|bp)\b/i.test(form.form))
            .length,
    0
)
console.log('')
console.log(
    `insref forms     ${insrefForms}, of which ${insref64} name a 64 bit operand (${pct(insref64, insrefForms)})`
)

if (flag('--missing')) {
    console.log('')
    console.log('in an integer section, with no prose:')
    console.log(`  ${documented.filter((name) => !insref.byMnemonic.has(name)).join(' ')}`)
}

const sample = value('--sample')
if (sample) {
    const name = sample.toLowerCase()
    console.log('')
    console.log(
        JSON.stringify(
            {
                name,
                section: sectionOf(name),
                forms: entryFor.get(name)?.forms,
                summary: opcodes.get(name) ?? null,
                description: insref.byMnemonic.get(name)?.description ?? null
            },
            null,
            2
        )
    )
}
