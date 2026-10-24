import {
    z80InstructionMap,
    type Z80InstructionVariant
} from '#lib/languages/Z80/Z80-documentation.ts'
import {
    Z80_FLAG_STRING_LEGEND,
    Z80_FLAG_STRING_ORDER,
    Z80_FLAGS
} from '#lib/languages/Z80/Z80-model.ts'
import type { InstructionTag } from '../instructions/categories'
import {
    documentPatterns,
    patternText,
    type FlagMark,
    type FlagMarks,
    type FormPattern,
    type InstructionDocument,
    type OperandSymbol
} from '../instructions/document'
import {
    buildFormPatterns,
    literal,
    type ClassPart,
    type FormInput,
    type InputPart
} from '../instructions/formPatterns'
import { z80FormTags } from '../instructions/formTags'
import { z80InstructionCategories } from './categories'
import { z80InstructionNames } from './instructionNames'
import {
    Z80_CARRY_CONDITION_NOTE,
    Z80_CONDITION_MEANINGS,
    Z80_OPERAND_LINES,
    Z80_REFRESH_REGISTER_NOTE
} from './operands'

/**
 * A Z80 instruction as the shared instruction view draws it
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), M2 and decision 17): the
 * register, pair, condition and bit operands as Zilog's `r`, `rr`, `cc` and `b`, every IY form on
 * the row of its IX twin, bytes and cycles on the fact line, flags from the Core's flag strings.
 */

const REGISTERS = ['a', 'b', 'c', 'd', 'e', 'h', 'l']
/** The undocumented halves of the index registers, which a DD or FD prefix makes of `h` and `l`. */
const HALVES = ['ixh', 'ixl', 'iyh', 'iyl']
/** Each pair with the registers its high and low bytes are, as the Core's sentences name them. */
const PAIRS: Record<string, string[]> = {
    bc: ['b', 'c'],
    de: ['d', 'e'],
    hl: ['h', 'l'],
    sp: [],
    af: ['a', 'f']
}
const CONDITIONS = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm']
/** The assembler's other names for `po` and `pe`, which are pseudo spellings. */
const CONDITION_ALIASES = ['nv', 'v']
const BITS = ['0', '1', '2', '3', '4', '5', '6', '7']

/** Mnemonics whose first operand may be a condition, which is how `c` stops meaning register C. */
const BRANCHES = new Set(['jp', 'jr', 'call', 'ret'])
const BIT_MNEMONICS = new Set(['bit', 'res', 'set'])
/** Operand placeholders written as they are, which the legend explains. */
const PLACEHOLDERS = new Set(['nn', 'nnnn', 'offset'])

/** How the Core's sentences say a condition holds: "If the zero flag is unset, …". */
const CONDITION_PROSE: Record<string, string> = {
    nz: 'the zero flag is unset',
    z: 'the zero flag is set',
    nc: 'the carry flag is unset',
    c: 'the carry flag is set',
    po: 'the parity/overflow flag is unset',
    pe: 'the parity/overflow flag is set',
    p: 'the sign flag is unset',
    m: 'the sign flag is set',
    nv: 'the parity/overflow flag is unset',
    v: 'the parity/overflow flag is set'
}

/** The order a legend lists a class's members in, whatever order the rows met them. */
const MEMBER_ORDER: Record<string, readonly string[]> = {
    r: REGISTERS,
    rr: Object.keys(PAIRS),
    cc: [...CONDITIONS, ...CONDITION_ALIASES]
}

/**
 * A word of a form's sentence that names one of its operands, and what the row's note writes in
 * its place, `{symbol}` being the row's symbol: `B` in "Loads B into A" becomes "`r'`". A pair has
 * three, for itself and its two halves ("B is stored into the memory location pointed to by SP").
 */
type NoteToken = { prose: string; as: string }

/** An operand that belongs to a class, with the words its sentence names it by. */
type Slot = {
    part: ClassPart
    tokens: NoteToken[]
    /** Whether a second operand of the class in one row is primed: `ld r, r'`. */
    primes: boolean
}

type Operand = { parts: InputPart[]; slot?: Slot }

type Draft = { input: FormInput; slots: Slot[] }

/** The form as a program writes it: its own operands, so a pseudo spelling reads as accepted. */
export function z80FormCode(variant: Pick<Z80InstructionVariant, 'mnemonic' | 'params'>): string {
    return variant.params.length > 0
        ? `${variant.mnemonic} ${variant.params.join(', ')}`
        : variant.mnemonic
}

function slotOperand(part: ClassPart, tokens: NoteToken[], primes: boolean): Operand {
    const slot = { part, tokens, primes }
    return { parts: [part], slot }
}

function member(symbol: string, name: string, memberSymbolic = false): ClassPart {
    return { symbol, member: name, memberText: name, memberSymbolic }
}

/** `ix` and `iy` read the same in every sentence, so an IY form's note matches its IX twin's. */
function indexTokens(register: 'ix' | 'iy'): NoteToken[] {
    const own = register.toUpperCase()
    return ['', 'H', 'L'].map((half) => ({ prose: `${own}${half}`, as: `IX${half}` }))
}

function pairTokens(pair: string): NoteToken[] {
    const [high, low] = PAIRS[pair]
    const tokens: NoteToken[] = [{ prose: pair.toUpperCase(), as: '`{symbol}`' }]
    if (high) tokens.push({ prose: high.toUpperCase(), as: 'the high byte of `{symbol}`' })
    if (low) tokens.push({ prose: low.toUpperCase(), as: 'the low byte of `{symbol}`' })
    return tokens
}

function operand(mnemonic: string, params: readonly string[], index: number): Operand {
    const param = params[index]
    if (BRANCHES.has(mnemonic) && index === 0 && param in CONDITION_PROSE) {
        return slotOperand(
            member('cc', param),
            [{ prose: CONDITION_PROSE[param], as: 'the condition `{symbol}` is true' }],
            false
        )
    }
    if (BIT_MNEMONICS.has(mnemonic) && index === 0) {
        return slotOperand(
            member('b', param),
            [{ prose: `bit ${param}`, as: 'bit `{symbol}`' }],
            false
        )
    }
    if (REGISTERS.includes(param)) {
        return slotOperand(
            member('r', param),
            [{ prose: param.toUpperCase(), as: '`{symbol}`' }],
            true
        )
    }
    if (HALVES.includes(param)) {
        return slotOperand(
            member('ixh/l', param),
            [{ prose: param.toUpperCase(), as: '`{symbol}`' }],
            true
        )
    }
    if (param in PAIRS) return slotOperand(member('rr', param), pairTokens(param), true)
    if (param === 'ix' || param === 'iy') {
        return slotOperand(member('ix', param), indexTokens(param), false)
    }
    if (param === '(ix)' || param === '(iy)') {
        const register = param === '(ix)' ? 'ix' : 'iy'
        const inner = slotOperand(member('ix', register), indexTokens(register), false)
        return { parts: [literal('('), ...inner.parts, literal(')')], slot: inner.slot }
    }
    if (param === '(ix+dd)' || param === '(iy+dd)') {
        const register = param === '(ix+dd)' ? 'ix' : 'iy'
        const part = {
            ...member('(ix+dd)', register),
            memberText: param,
            memberSymbolic: register === 'ix'
        }
        return slotOperand(part, indexTokens(register), false)
    }
    // `jp (hl)` jumps to the address in `hl` and `ld bc, (hl)` reads two bytes: neither is the
    // byte `(hl)` the legend describes.
    if (param === '(hl)' && mnemonic !== 'jp' && !params.some((other) => other in PAIRS)) {
        return { parts: [member('(hl)', '(hl)', true)] }
    }
    if (PLACEHOLDERS.has(param)) return { parts: [member(param, param, true)] }
    const address = /^\((nn|nnnn)\)$/.exec(param)
    if (address)
        return { parts: [literal('('), member(address[1], address[1], true), literal(')')] }
    return { parts: [literal(param)] }
}

function cycles(variant: Z80InstructionVariant): string {
    const { taken, notTaken } = variant.cycles
    return taken === notTaken ? `${taken}` : `${taken}/${notTaken}`
}

function factLine(variant: Z80InstructionVariant): string {
    return `${variant.bytes} ${variant.bytes === 1 ? 'byte' : 'bytes'} · ${cycles(variant)} cycles`
}

/**
 * The flag string's characters as marks. The Core writes `*` for an effect of the instruction's
 * own, which its sentence describes (`ccf` inverts C, `ldi` sets P/V while BC is not zero, `ld a, i`
 * copies IFF2 into P/V), and a space for a flag left undefined (`bit` and S).
 */
const FLAG_MARKS: Record<string, FlagMark> = {
    '-': { kind: 'unchanged' },
    '+': { kind: 'changed' },
    '0': { kind: 'cleared' },
    '1': { kind: 'set' },
    '*': { kind: 'changed', title: 'changed in a way of its own, as the form says' },
    ' ': { kind: 'undefined' },
    V: { kind: 'changed', title: Z80_FLAG_STRING_LEGEND.V },
    P: { kind: 'changed', title: Z80_FLAG_STRING_LEGEND.P }
}

/** The register panel's order, S Z H P/V N C, rather than the flag string's. */
const FLAG_ORDER = Z80_FLAGS.map((flag) => flag.name)

function flagMarks(flags: string): FlagMarks {
    return Object.fromEntries(
        FLAG_ORDER.map((name) => {
            const effect = flags[Z80_FLAG_STRING_ORDER.indexOf(name)] ?? '-'
            return [name, { ...(FLAG_MARKS[effect] ?? { kind: 'undefined' }) }]
        })
    )
}

/** The real forms of every mnemonic by opcode, to say what a pseudo spelling becomes. */
const realForms = new Map<string, Z80InstructionVariant>()
for (const variants of z80InstructionMap.values()) {
    for (const variant of variants) {
        if (!variant.isPseudo && !realForms.has(variant.opcodes))
            realForms.set(variant.opcodes, variant)
    }
}

/**
 * What a pseudo spelling assembles to: the real form with the same opcode (`add c` is `add a, c`),
 * or the operand-less forms its opcodes are one after the other (`ld bc, hl` is `ld b, h` then
 * `ld c, l`).
 */
function expansionOf(variant: Z80InstructionVariant): string[] | undefined {
    const same = realForms.get(variant.opcodes)
    if (same) return [z80FormCode(same)]
    const sequence: string[] = []
    for (let rest = variant.opcodes; rest.length > 0;) {
        const real = [8, 6, 4, 2]
            .map((length) => realForms.get(rest.slice(0, length)))
            .find((form) => form !== undefined && form.bytes * 2 === form.opcodes.length)
        if (!real) return undefined
        sequence.push(z80FormCode(real))
        rest = rest.slice(real.opcodes.length)
    }
    return sequence
}

function draft(variant: Z80InstructionVariant): Draft {
    const parts: InputPart[] = [literal(variant.mnemonic)]
    const slots: Slot[] = []
    variant.params.forEach((_, index) => {
        parts.push(literal(index === 0 ? ' ' : ', '))
        const own = operand(variant.mnemonic, variant.params, index)
        parts.push(...own.parts)
        if (own.slot) slots.push(own.slot)
    })
    return {
        input: {
            code: z80FormCode(variant),
            parts,
            tags: z80FormTags(variant),
            note: variant.description,
            facts: [factLine(variant)],
            // 281 of the 284 rows agree on these anyway; the three that do not are register splits
            // that read better apart (`ld (nnnn), hl` is a byte shorter than `ld (nnnn), rr`)
            split: `${variant.bytes}|${cycles(variant)}|${variant.flags}`,
            flags: flagMarks(variant.flags),
            expansion: variant.isPseudo ? expansionOf(variant) : undefined
        },
        slots
    }
}

/** The row a form goes on, as the shared grouping decides it, before any symbol is primed. */
function rowKey({ input }: Draft): string {
    const syntax = input.parts
        .map((part) => ('symbol' in part ? `\u0001${part.symbol}` : part.text))
        .join('\u0000')
    return [syntax, input.tags.join(','), input.split ?? ''].join('\u0002')
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/** Where a word stands alone: `B` in "into B." but not in "BC" or "IXB". */
function occurrences(text: string, prose: string): { start: number; end: number }[] {
    const pattern = new RegExp(`(?<![\\w'])${escapeRegExp(prose)}(?![\\w'])`, 'g')
    return [...text.matchAll(pattern)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length
    }))
}

type Region = { start: number; end: number; options: { slot: number; token: number }[] }

/** Each way of reading a sentence's matching words as operands, the most replaced first. */
function readings(regions: Region[]): number[][] {
    let all: number[][] = [[]]
    for (const region of regions) {
        all = all.flatMap((choice) =>
            [-1, ...region.options.keys()].map((option) => [...choice, option])
        )
    }
    const count = (choice: number[]) => choice.filter((option) => option >= 0).length
    return all.sort((a, b) => count(b) - count(a))
}

/** Where a template holds an operand's word: private-use characters, which no sentence has. */
const HOLE = /\uE000(\d+)\.(\d+)\uE001/g

/**
 * The one sentence a row's forms share once their members are the row's symbols, or undefined
 * when there is none. It is read off one form's sentence and kept only when putting each form's
 * own members back into it gives that form's sentence word for word, which is what tells the
 * register A from the article in "A byte from the port … is written to A".
 */
function rowNote(group: Draft[], varying: number[]): string | undefined {
    if (varying.length === 0) return undefined
    for (const source of group) {
        const note = source.input.note ?? ''
        const regions: Region[] = []
        for (const slot of varying) {
            source.slots[slot].tokens.forEach((token, index) => {
                for (const { start, end } of occurrences(note, token.prose)) {
                    const region = regions.find((r) => r.start === start && r.end === end)
                    if (region) region.options.push({ slot, token: index })
                    else regions.push({ start, end, options: [{ slot, token: index }] })
                }
            })
        }
        regions.sort((a, b) => a.start - b.start)
        // a sentence naming its operands more than six times is not one sentence for a row
        if (regions.length > 6) continue
        for (const reading of readings(regions)) {
            let template = ''
            let at = 0
            let overlaps = false
            reading.forEach((option, index) => {
                const region = regions[index]
                if (option < 0) return
                if (region.start < at) overlaps = true
                const { slot, token } = region.options[option]
                template += `${note.slice(at, region.start)}\uE000${slot}.${token}\uE001`
                at = region.end
            })
            if (overlaps) continue
            template += note.slice(at)
            const fits = group.every((form) => {
                let missing = false
                const filled = template.replace(HOLE, (_, slot: string, token: string) => {
                    const prose = form.slots[Number(slot)].tokens[Number(token)]?.prose
                    if (prose === undefined) missing = true
                    return prose ?? ''
                })
                return !missing && filled === form.input.note
            })
            if (!fits) continue
            const written = template.replace(HOLE, (_, slot: string, token: string) => {
                const own = source.slots[Number(slot)]
                return own.tokens[Number(token)].as.replace('{symbol}', own.part.symbol)
            })
            return written.charAt(0).toUpperCase() + written.slice(1)
        }
    }
    return undefined
}

/** `ld` in the order of Zilog's manual: the 8-bit loads, then the 16-bit ones. */
const LD_ORDER = [
    "ld r, r'",
    'ld r, nn',
    'ld r, (hl)',
    'ld r, (ix+dd)',
    'ld (hl), r',
    'ld (ix+dd), r',
    'ld (hl), nn',
    'ld (ix+dd), nn',
    'ld a, (bc)',
    'ld a, (de)',
    'ld a, (nnnn)',
    'ld (bc), a',
    'ld (de), a',
    'ld (nnnn), a',
    'ld a, i',
    'ld a, r',
    'ld i, a',
    'ld r, a',
    'ld rr, nnnn',
    'ld ix, nnnn',
    'ld hl, (nnnn)',
    'ld rr, (nnnn)',
    'ld ix, (nnnn)',
    'ld (nnnn), hl',
    'ld (nnnn), rr',
    'ld (nnnn), ix',
    'ld sp, hl',
    'ld sp, ix'
]

/** Mnemonics with 8-bit and 16-bit forms, whose manual lists the 8-bit ones first. */
const NARROW_FIRST = new Set(['add', 'adc', 'sbc', 'inc', 'dec'])
const WIDE_OPERANDS = new Set(['rr', 'bc', 'de', 'hl', 'sp', 'ix'])

/**
 * Where a row goes in its section, so the panel's first six are the common ones: the 8-bit forms
 * before the 16-bit ones, IX after the main registers, an unconditional branch before its
 * conditions and both before the jumps through a register. Rows of equal rank keep the Core's order.
 */
function rank(mnemonic: string, pattern: FormPattern): number {
    const text = patternText(pattern)
    if (mnemonic === 'ld') {
        const index = LD_ORDER.indexOf(text)
        return index === -1 ? LD_ORDER.length : index
    }
    const first = pattern.parts[2]?.text
    let rank = 0
    if (NARROW_FIRST.has(mnemonic) && first !== undefined && WIDE_OPERANDS.has(first)) rank += 4
    if (/ix/.test(text)) rank += 2
    if (BRANCHES.has(mnemonic)) {
        if (pattern.parts.some((part) => part.symbol && part.text === 'cc')) rank += 1
        else if (first?.startsWith('(')) rank += 2
    }
    return rank
}

/** Mnemonics that repeat until a counter runs out, whose two counts are a repeat and the last pass. */
const REPEATS = new Set(['ldir', 'lddr', 'cpir', 'cpdr', 'inir', 'indr', 'otir', 'otdr'])

/**
 * What the two numbers of `12/7 cycles` mean, said once on a page that has them; shorter when the
 * header gives the count already.
 */
function cyclesExplanation(
    mnemonic: string,
    variants: Z80InstructionVariant[],
    headerFacts: readonly string[]
): string | undefined {
    const pairs = [
        ...new Set(
            variants
                .filter((variant) => variant.cycles.taken !== variant.cycles.notTaken)
                .map(cycles)
        )
    ]
    if (pairs.length === 0) return undefined
    const [taken, notTaken] = pairs.length === 1 ? pairs[0].split('/') : ['the first', 'the second']
    const said =
        pairs.length === 1 && headerFacts.some((fact) => fact.endsWith(`${pairs[0]} cycles`))
    const counts =
        pairs.length === 1 ? `${pairs[0]} cycles: ${taken}` : `Two cycle counts: ${taken}`
    const first = said ? `${taken} cycles` : counts
    if (REPEATS.has(mnemonic)) return `${first} for a pass that repeats, ${notTaken} for the last`
    const verb = mnemonic === 'call' ? 'calls' : mnemonic === 'ret' ? 'returns' : 'jumps'
    return `${first} when it ${verb}, ${notTaken} when it does not`
}

const TAG_EXPLANATIONS: Partial<Record<InstructionTag, string>> = {
    pseudo: 'Other spellings the assembler accepts; each form shows the instruction it becomes.',
    undocumented: "Left out of Zilog's manual, but the Z80 runs them, and so does this emulator."
}

function formatList(items: string[]): string {
    return items.length > 1
        ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`
        : (items[0] ?? '')
}

function legendLine(symbol: string, members: string[], variants: Z80InstructionVariant[]): string {
    const line = Z80_OPERAND_LINES[symbol].meaning
    const order = MEMBER_ORDER[symbol.replace(/'+$/, '')] ?? []
    const sorted = [...members].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const listed =
        symbol === 'cc'
            ? sorted.map((name) => `\`${name}\` (${Z80_CONDITION_MEANINGS[name]})`)
            : sorted.map((name) => `\`${name}\``)
    const extra: string[] = []
    if (symbol === 'cc' && members.includes('c')) extra.push(Z80_CARRY_CONDITION_NOTE)
    if (symbol === 'r' && variants.some((variant) => variant.params.includes('r'))) {
        extra.push(Z80_REFRESH_REGISTER_NOTE)
    }
    return [line.replace('{members}', formatList(listed)), ...extra].join(' ')
}

/**
 * The document of one Z80 mnemonic. Throws for a mnemonic the Core does not have: the page's
 * `load` checks the mnemonic first (it needs the forms for its example too), and the entries are
 * built from the Core's own list.
 */
export function z80InstructionDocument(mnemonic: string): InstructionDocument {
    const variants = z80InstructionMap.get(mnemonic)
    if (!variants) throw new Error(`The Z80 has no instruction ${mnemonic}`)

    const drafts = variants.map(draft)
    const groups = new Map<string, Draft[]>()
    for (const own of drafts) {
        const key = rowKey(own)
        const group = groups.get(key)
        if (group) group.push(own)
        else groups.set(key, [own])
    }

    // Within a row, the operands whose member changes take the row's symbol, the second of a
    // class primed (`ld r, r'`); an operand every form of the row shares stays itself (`add a, r`).
    const notes = new Map<FormInput, string>()
    const members = new Map<string, Set<string>>()
    for (const group of groups.values()) {
        const [first] = group
        const varying = first.slots
            .map((_, index) => index)
            .filter((index) => new Set(group.map((own) => own.slots[index].part.member)).size > 1)
        const seen = new Map<string, number>()
        for (const index of varying) {
            const base = first.slots[index].part.symbol
            const count = seen.get(base) ?? 0
            seen.set(base, count + 1)
            const symbol = first.slots[index].primes ? `${base}${"'".repeat(count)}` : base
            const used = members.get(symbol) ?? new Set()
            for (const own of group) {
                own.slots[index].part.symbol = symbol
                used.add(own.slots[index].part.member)
            }
            members.set(symbol, used)
        }
        const note = rowNote(group, varying)
        if (note !== undefined) for (const own of group) notes.set(own.input, note)
    }

    const pairs = Object.keys(PAIRS).filter((pair) =>
        variants.some((variant) => variant.params.includes(pair))
    )
    const universes: Record<string, readonly string[]> = {
        r: REGISTERS,
        "r'": REGISTERS,
        rr: pairs,
        "rr'": pairs,
        'ixh/l': HALVES,
        "ixh/l'": HALVES,
        cc: CONDITIONS,
        b: BITS
    }

    const result = buildFormPatterns(
        drafts.map((own) => own.input),
        {
            universe: (symbol) => universes[symbol],
            templateNote: (form) => notes.get(form),
            rank: (pattern) => rank(mnemonic, pattern),
            tagExplanations: TAG_EXPLANATIONS
        }
    )

    const headerFacts = [...result.headerFacts]
    const explained = cyclesExplanation(mnemonic, variants, headerFacts)
    if (explained) headerFacts.push(explained)

    const symbols = new Set<string>()
    for (const pattern of documentPatterns(result)) {
        for (const part of pattern.parts) if (part.symbol) symbols.add(part.text)
    }
    const operands: OperandSymbol[] = [...symbols].flatMap((symbol) => {
        const line = Z80_OPERAND_LINES[symbol]
        if (!line) return []
        const meaning = legendLine(symbol, [...(members.get(symbol) ?? [])], variants)
        return [line.href ? { symbol, meaning, href: line.href } : { symbol, meaning }]
    })

    const names = z80InstructionNames[mnemonic]
    const longName = names?.longName ?? mnemonic.toUpperCase()
    const summary = names?.summary ?? ''

    return {
        name: mnemonic,
        longName,
        summary,
        category: z80InstructionCategories[mnemonic],
        tags: result.tags,
        headerFacts,
        flags: { order: FLAG_ORDER, marks: result.flags, varies: result.flagsVary },
        sections: result.sections,
        omitted: [],
        operands,
        description: undefined
    }
}
