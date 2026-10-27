import { plainText, summaryOf } from '../entries'
import type { CategoryTable, InstructionTag } from '../instructions/categories'
import type { InstructionContent } from '../instructions/content'
import {
    descriptionAfterSummary,
    documentPatterns,
    type FormPattern,
    type InstructionDocument,
    type InstructionReference,
    type OperandSymbol
} from '../instructions/document'
import {
    buildFormPatterns,
    literal,
    type ClassPart,
    type FormInput,
    type InputPart
} from '../instructions/formPatterns'
import { mipsFormTags, riscvFormTags } from '../instructions/formTags'
import { mipsInstructionCategories } from '../mips/categories'
import { mipsInstructionNames } from '../mips/instructionNames'
import { riscvInstructionCategories } from '../riscv/categories'
import { riscvInstructionNames } from '../riscv/instructionNames'
import { riscvManualReference } from '../riscv/manualReference'
import { rewriteExpansion, type ExpansionOperand } from './expansion'
import {
    immediateMeaning,
    MIPS_OPERAND_MEANINGS,
    registerKind,
    registerMeaning,
    RISCV_OPERAND_MEANINGS,
    type MarsLanguage,
    type RegisterKind
} from './operands'

/**
 * A MIPS or RISC-V instruction as the shared instruction view draws it
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), M2 and decisions 13-14):
 * MARS's and RARS's forms as Form patterns, their register placeholders kept, their example values
 * written as symbols, each form's own sentence as its note.
 *
 * It takes the forms rather than looking them up, so that it imports neither Core: the MIPS page
 * and panel load MARS only and the RISC-V ones RARS only, as the data modules are loaded on demand.
 */

/** A form as `MIPS-documentation.ts` and `RISC-V-documentation.ts` list it. */
export type MarsForm = {
    name: string
    args: { type: string; value: string }[][]
    description: string
    example: string
    isPseudo: boolean
    /** RISC-V only: RV32 does not accept the form. */
    isRv64Only?: boolean
    /**
     * The Core's templates of a pseudo-instruction (MARS's `expansion`, RARS's `getExpansion()`),
     * once the data modules carry them; empty or absent for a real instruction.
     */
    expansion?: readonly string[]
}

type InstructionNames = Readonly<Record<string, { longName?: string; summary?: string }>>

type Dialect = {
    language: MarsLanguage
    /** The member symbol each immediate token type is written as. */
    immediates: Readonly<Record<string, string>>
    meanings: Readonly<Record<string, string>>
    tags: (form: MarsForm) => InstructionTag[]
    categories: CategoryTable
    names: InstructionNames
    /** The architecture's own page for a mnemonic, where the language links one. */
    reference?: (mnemonic: string) => InstructionReference | undefined
}

const MIPS_DIALECT: Dialect = {
    language: 'mips',
    immediates: {
        INTEGER_5: 'imm5',
        INTEGER_16: 'imm16',
        INTEGER_16U: 'uimm16',
        INTEGER_32: 'imm32'
    },
    meanings: MIPS_OPERAND_MEANINGS,
    tags: mipsFormTags,
    categories: mipsInstructionCategories,
    names: mipsInstructionNames
}

const RISCV_DIALECT: Dialect = {
    language: 'risc-v',
    immediates: {
        INTEGER_5: 'imm5',
        INTEGER_6: 'imm6',
        INTEGER_12: 'imm12',
        INTEGER_20: 'imm20',
        INTEGER_32: 'imm32',
        INTEGER_64: 'imm64'
    },
    meanings: RISCV_OPERAND_MEANINGS,
    tags: (form) => riscvFormTags({ isPseudo: form.isPseudo, isRv64Only: !!form.isRv64Only }),
    categories: riscvInstructionCategories,
    reference: riscvManualReference,
    names: riscvInstructionNames
}

const REGISTER_TYPES = new Set(['REGISTER_NAME', 'FP_REGISTER_NAME', 'REGISTER_NUMBER'])

/** Tokens after which the next one follows with no comma: `(`, `+`, `%hi`, `%lo`. */
const OPENS = new Set(['LEFT_PAREN', 'PLUS', 'HI', 'LO'])

/** Written as the Core spells them. */
const PUNCTUATION: Readonly<Record<string, string>> = {
    LEFT_PAREN: '(',
    RIGHT_PAREN: ')',
    PLUS: '+',
    HI: '%hi',
    LO: '%lo'
}

/**
 * Words a title keeps in capitals when it is turned to sentence case: the acronyms and the
 * operator names MARS and RARS write in capitals on purpose.
 */
const ACRONYMS = new Set([
    'AND',
    'ASCII',
    'CSR',
    'EPC',
    'FCSR',
    'FP',
    'FPU',
    'HI',
    'IEEE',
    'IO',
    'LO',
    'NaN',
    'NOP',
    'NOR',
    'NOT',
    'OR',
    'OS',
    'PC',
    'XOR'
])

function symbolic(text: string): ClassPart {
    return { symbol: text, member: text, memberText: text, memberSymbolic: true }
}

/** The text between a comma-separated operand and the next token, as the rows write it. */
function separator(previous: string | undefined, current: string): string {
    if (previous === undefined) return ' '
    if (OPENS.has(previous)) return ''
    if (current === 'RIGHT_PAREN' || current === 'PLUS') return ''
    // `-100($t2)` and `%lo(label)($t2)`: a base register in parentheses follows its offset directly
    if (current === 'LEFT_PAREN' && !REGISTER_TYPES.has(previous)) return ''
    return ', '
}

/** MARS's and RARS's description of a form: "Load Word : Set $t1 to …", the title optional. */
export function splitDescription(description: string): { title?: string; body: string } {
    const text = description.replace(/\s+/g, ' ').trim()
    const match = /^([^:.]{1,80}?)\s*:\s+(.+)$/.exec(text)
    if (!match) return { body: text }
    return { title: match[1].trim(), body: match[2].trim() }
}

/**
 * A title in sentence case, where MARS shouts the letters it builds the mnemonic from:
 * "ADDition" is "Addition" and "Branch if EQual" is "Branch if equal"; acronyms stay.
 */
export function sentenceCase(title: string): string {
    const cleaned = title
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s.:]+$/, '')
    let first = true
    return cleaned.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
        const isFirst = first
        first = false
        if (ACRONYMS.has(word) || /\d/.test(word)) return word
        if (word.length === 1 && !isFirst) return word
        const lower = word.toLowerCase()
        return isFirst ? lower[0].toUpperCase() + lower.slice(1) : lower
    })
}

/** A summary as one plain sentence: a capital first and a full stop last. */
function asSentence(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) return trimmed
    const capital = trimmed[0].toUpperCase() + trimmed.slice(1)
    return /[.!?…]$/.test(capital) ? capital : `${capital}.`
}

/** The Core's templates of a pseudo-instruction; none for a real instruction. */
function expansionTemplates(form: MarsForm): readonly string[] | undefined {
    return form.expansion && form.expansion.length > 0 ? form.expansion : undefined
}

/** Where an immediate's text goes in an expansion until its row says whether it is `imm` or `imm16`. */
const MARKER = /\uE000(\d+)\uE000/g

type Built = {
    input: FormInput
    /** The immediate members the form takes, for the line of a merged `imm`. */
    immediates: string[]
    /** Its register placeholders, with the token type each came from. */
    registers: { text: string; type: string }[]
}

function formInput(dialect: Dialect, mnemonic: string, form: MarsForm): Built {
    const parts: InputPart[] = [literal(mnemonic)]
    const operands: ExpansionOperand[] = [{ type: 'OPERATOR', text: mnemonic }]
    const immediates: string[] = []
    const registers: { text: string; type: string }[] = []
    let previous: string | undefined
    for (const [token] of form.args) {
        const gap = separator(previous, token.type)
        if (gap) parts.push(literal(gap))
        previous = token.type
        const immediate = dialect.immediates[token.type]
        if (REGISTER_TYPES.has(token.type)) {
            parts.push(symbolic(token.value))
            registers.push({ text: token.value, type: token.type })
            operands.push({ type: token.type, text: token.value })
        } else if (token.type === 'IDENTIFIER') {
            parts.push(symbolic('label'))
            operands.push({ type: token.type, text: 'label' })
        } else if (token.type === 'CSR_NAME') {
            parts.push(symbolic('csr'))
            operands.push({ type: token.type, text: 'csr' })
        } else if (token.type === 'ROUNDING_MODE') {
            parts.push(symbolic('rm'))
            operands.push({ type: token.type, text: 'rm' })
        } else if (
            dialect.language === 'mips' &&
            token.type === 'INTEGER_5' &&
            /condition flag/i.test(form.description)
        ) {
            // MARS writes the flag number of `c.eq.s 1,$f0,$f1` and `bc1t 1,label` as a 5-bit integer
            parts.push(symbolic('cc'))
            operands.push({ type: token.type, text: 'cc' })
        } else if (immediate) {
            operands.push({ type: token.type, text: `\uE000${parts.length}\uE000` })
            parts.push({
                symbol: 'imm',
                member: immediate,
                memberText: immediate,
                memberSymbolic: true
            })
            immediates.push(immediate)
        } else {
            const text = PUNCTUATION[token.type] ?? token.value
            parts.push(literal(text))
            operands.push({ type: token.type, text })
        }
    }
    const templates = expansionTemplates(form)
    // RARS calls a second spelling an "Alias for fscsr t1"; say what it is the same as, as code
    const own = splitDescription(form.description).body.replace(
        /^Alias for (.+?)\.?$/,
        (_, spelling: string) => `Same as \`${spelling.trim()}\`.`
    )
    return {
        input: {
            code: form.example.replace(/\s+/g, ' ').trim(),
            parts,
            tags: dialect.tags(form),
            // MARS starts some sentences in lower case: "set $t1 to ($t2 plus 32-bit immediate)"
            note: own
                ? own.replace(/^[a-z]{2,}\b/, (word) => word[0].toUpperCase() + word.slice(1))
                : undefined,
            expansion: templates
                ? rewriteExpansion(templates, operands, dialect.language)
                : undefined
        },
        immediates,
        registers
    }
}

/** The row's own texts in place of the markers, now that the rows are known. */
function fillExpansions(patterns: readonly FormPattern[]): void {
    for (const pattern of patterns) {
        for (const form of pattern.forms) {
            form.expansion = form.expansion?.map((line) =>
                line.replace(
                    MARKER,
                    (_, index: string) => pattern.parts[Number(index)]?.text ?? 'imm'
                )
            )
        }
    }
}

/** Whether a description with no title reads as a name: short, and naming no operand. */
function readsAsName(text: string, registers: ReadonlySet<string>): boolean {
    const words = text.split(' ')
    return (
        words.length <= 7 &&
        !/[.!?]$/.test(text) &&
        !words.some((word) => registers.has(word.replace(/[(),]/g, '')))
    )
}

function longNameOf(mnemonic: string, main: MarsForm, forms: readonly MarsForm[]): string {
    const own = splitDescription(main.description)
    if (own.title) return sentenceCase(own.title)
    const registers = new Set(
        forms.flatMap((form) =>
            form.args
                .map(([token]) => token)
                .filter((token) => REGISTER_TYPES.has(token.type))
                .map((token) => token.value)
        )
    )
    if (own.body && readsAsName(own.body, registers)) return sentenceCase(own.body)
    const titled = forms.map((form) => splitDescription(form.description).title).find(Boolean)
    if (titled) return sentenceCase(titled)
    return mnemonic
}

function marsDocument(
    dialect: Dialect,
    mnemonic: string,
    forms: readonly MarsForm[],
    content: InstructionContent | undefined
): InstructionDocument {
    const main = forms.find((form) => !form.isPseudo) ?? forms[0]
    const mainDescription = main ? splitDescription(main.description) : { body: '' }
    const bodies = new Set(forms.map((form) => splitDescription(form.description).body))
    // A real form's body is MARS's description of the instruction; a pseudo form's is about that
    // form only, unless every form says the same.
    const mainSource =
        main && (!main.isPseudo || bodies.size === 1)
            ? mainDescription.body || undefined
            : undefined
    // An authored description follows the header's summary, so it is shown whole; MARS's starts
    // with the sentence the summary stands for.
    const authored = content?.description?.trim() ? content.description.trim() : undefined
    const source = authored ?? mainSource

    const names = dialect.names[mnemonic]
    const longName = names?.longName ?? (main ? longNameOf(mnemonic, main, forms) : mnemonic)
    const derived = summaryOf(mainDescription.body || mainDescription.title || longName)
    const summary = names?.summary ?? asSentence(authored ? summaryOf(authored) : derived)

    const seen = new Set<string>()
    const built = forms
        .map((form) => formInput(dialect, mnemonic, form))
        .filter(({ input }) => {
            const key = `${input.code}\u0000${input.tags.join(',')}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    const inputs = built.map(({ input }) => input)

    const result = buildFormPatterns(inputs, {
        redundantNotes: [derived, summary, ...(source ? [source] : [])]
    })
    const patterns = documentPatterns(result)
    fillExpansions(patterns)

    return {
        name: mnemonic,
        longName,
        summary,
        category: dialect.categories[mnemonic],
        tags: result.tags,
        headerFacts: result.headerFacts,
        flags: undefined,
        sections: result.sections,
        omitted: [],
        operands: legend(dialect, mnemonic, patterns, built),
        // MARS's first sentence is what the header's summary stands for, whether the table
        // rewrote it or not
        description: authored ?? descriptionAfterSummary(mainSource, derived, plainText),
        reference: dialect.reference?.(mnemonic)
    }
}

/** The legend lines of the symbols the rows use, in the order they first appear. */
function legend(
    dialect: Dialect,
    mnemonic: string,
    patterns: readonly FormPattern[],
    built: readonly Built[]
): OperandSymbol[] {
    const registerTypes = new Map(
        built.flatMap(({ registers }) => registers.map((r) => [r.text, r.type] as const))
    )
    const immediatesByCode = new Map<string, string[]>()
    for (const { input, immediates } of built) {
        immediatesByCode.set(input.code, [
            ...(immediatesByCode.get(input.code) ?? []),
            ...immediates
        ])
    }
    const symbols: string[] = []
    const merged = new Set<string>()
    for (const pattern of patterns) {
        for (const part of pattern.parts) {
            if (part.symbol && !symbols.includes(part.text)) symbols.push(part.text)
        }
        if (pattern.parts.some((part) => part.symbol && part.text === 'imm')) {
            for (const form of pattern.forms) {
                for (const width of immediatesByCode.get(form.code) ?? []) merged.add(width)
            }
        }
    }
    const firstOfKind = new Map<RegisterKind, string>()
    return symbols.flatMap((symbol): OperandSymbol[] => {
        const type = registerTypes.get(symbol)
        if (type !== undefined && !(symbol in dialect.meanings)) {
            const kind = registerKind(dialect.language, type, symbol, mnemonic)
            if (!firstOfKind.has(kind)) firstOfKind.set(kind, symbol)
            return [
                {
                    symbol,
                    meaning: registerMeaning(dialect.language, symbol, kind, firstOfKind.get(kind))
                }
            ]
        }
        if (symbol === 'imm') return [{ symbol, meaning: immediateMeaning([...merged]) }]
        const meaning = dialect.meanings[symbol]
        return meaning ? [{ symbol, meaning }] : []
    })
}

/**
 * A MIPS mnemonic's document from its forms (`mipsInstructionMap.get(mnemonic)`) and its authored
 * content (`mipsInstructionContent[mnemonic]`), whose description replaces MARS's when it has one.
 */
export function mipsInstructionDocument(
    mnemonic: string,
    forms: readonly MarsForm[],
    content?: InstructionContent
): InstructionDocument {
    return marsDocument(MIPS_DIALECT, mnemonic, forms, content)
}

/** A RISC-V mnemonic's document, as `mipsInstructionDocument` for RARS's forms. */
export function riscvInstructionDocument(
    mnemonic: string,
    forms: readonly MarsForm[],
    content?: InstructionContent
): InstructionDocument {
    return marsDocument(RISCV_DIALECT, mnemonic, forms, content)
}
