import {
    describeX86Instruction,
    X86_FIRST_PROCESSOR,
    formatX86Cpu,
    formatX86Form,
    x86InstructionTitle,
    x86IntelReference,
    type X86Instruction,
    type X86InstructionForm
} from '#lib/languages/X86/X86-documentation.ts'
import { plainText, summaryOf } from '../entries'
import { x86FormTags } from '../instructions/formTags'
import { X86_FLAG_ORDER, X86_INSTRUCTION_FLAGS } from '#lib/languages/X86/generated/x86Flags.ts'
import {
    descriptionAfterSummary,
    type FlagMarks,
    type FlagStrip,
    type FormPattern,
    type InstructionDocument,
    type OmittedForms,
    type OperandSymbol
} from '../instructions/document'
import {
    buildFormPatterns,
    literal,
    type FormInput,
    type InputPart
} from '../instructions/formPatterns'
import { x86InstructionCategories } from './categories'
import { x86InstructionNames } from './instructionNames'
import { X86_OPERAND_MEANINGS } from './operands'

/**
 * An x86 instruction as the shared instruction view draws it
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), M2 and decisions 10, 14-16):
 * the forms this emulator runs, the operand sizes as chips, NASM's notes in words.
 */

/** Operands whose width is part of their name: `reg32`, `r/m8`, `imm16`, `mem64`. */
const SIZED = /^(reg|r\/m|mem|imm)(8|16|32|64|80|128)?(na)?$/

/** The accumulator a form names, which NASM gives its own shorter encodings. */
const ACCUMULATORS: Record<string, number> = { al: 8, ax: 16, eax: 32, rax: 64 }

/** NASM's operand decorators that a program writes, as it writes them. */
const WRITTEN_DECORATORS = new Set(['short', 'near', 'far'])

/** What a form's NASM notes say on its row; `LONG` goes, the list being 64-bit already. */
const NOTE_FACTS: Record<string, string> = {
    LOCK: 'takes `lock`',
    LOCK1: 'takes `lock`',
    OBSOLETE: 'removed from the architecture'
}

// These NASM operand-size restrictions are not carried by the table's NOLONG flag.
const LEGACY_32_BIT_STACK_INSTRUCTIONS = new Set(['pushfd', 'popfd', 'enterd', 'leaved'])

// JMPE ran only on Itanium's IA-32 layer; NASM accepts it, and x86 processors fault on it.
const ITANIUM_ONLY = new Set(['jmpe'])

function availableIn64BitMode(name: string, form: X86InstructionForm): boolean {
    if (form.notes.includes('NOLONG') || LEGACY_32_BIT_STACK_INSTRUCTIONS.has(name)) return false
    if (ITANIUM_ONLY.has(name)) return false
    if (name === 'push' || name === 'pop') {
        return !form.operands.some((operand) => /^(?:reg|r\/m|mem)32$/.test(operand))
    }
    if (
        (name === 'movzx' || name === 'movzxd') &&
        form.operands[0] === 'reg32' &&
        form.operands[1] === 'r/m32'
    ) {
        return false
    }
    return true
}

function operandMeaning(name: string, symbol: string): string | undefined {
    const branch = /^(?:call|jmp|j[a-z]+|loop[a-z]*)$/.test(name)
    if (branch && /^imm(?:8|16|32|64)?$/.test(symbol)) {
        const target =
            'A branch target, written as a label or address. NASM calculates the displacement from the end of the instruction.'
        if (symbol === 'imm8')
            return `${target} The displacement must fit a signed byte, \`-128\` to \`127\`.`
        if (symbol === 'imm16')
            return `${target} This legacy encoding uses a signed 16-bit displacement.`
        if (symbol === 'imm32' || symbol === 'imm64') {
            return `${target} In 64-bit mode the encoded displacement is signed 32-bit, \`-2147483648\` to \`2147483647\`, even though the target address is 64-bit.`
        }
        return `${target} NASM selects a short or near encoding according to the target’s reach and any size constraint.`
    }
    if (/^mov(?:sx|zx)/.test(name)) {
        if (symbol === 'reg')
            return 'The destination register. Its width is selected independently of the source width; widening uses a larger destination.'
        if (symbol === 'r/m')
            return 'The source register or memory value, whose width may differ from the destination’s. For example, a byte source can be extended to a 64-bit register. High-byte registers such as `ah` cannot be used with a REX prefix.'
    }
    if (name === 'push' && symbol === 'imm') {
        return 'A value to push. A default 64-bit push encodes a signed 8-bit or 32-bit immediate and sign-extends it to 64 bits. Use `word` for a 16-bit push. A full 64-bit immediate cannot be encoded.'
    }
    if (/^ret(?:n|f)?[wdq]?$/.test(name) && symbol === 'imm16') {
        return 'An unsigned 16-bit byte count, `0` to `65535`, added to the stack pointer after the return address is popped.'
    }
    return X86_OPERAND_MEANINGS[symbol]
}

function operandParts(operand: string): InputPart[] {
    // `{near|short}` offers either, which is the same as writing neither: only a lone keyword is
    // part of what a program writes.
    const decorators = [...operand.matchAll(/\{([^}]*)\}/g)]
        .map((match) => match[1].trim())
        .filter((word) => !word.includes('|'))
    const bare = operand.replace(/\s*\{[^}]*\}/g, '').trim()
    const written = decorators.filter((word) => WRITTEN_DECORATORS.has(word))
    const prefix = written.length > 0 ? [literal(`${written.join(' ')} `)] : []

    const sized = SIZED.exec(bare)
    if (sized) {
        const [, kind, width] = sized
        const memberText = width ? `${kind}${width}` : kind
        return [
            ...prefix,
            {
                symbol: kind,
                member: bare,
                memberText,
                memberSymbolic: true,
                width: width ? Number(width) : undefined
            }
        ]
    }
    if (bare in ACCUMULATORS) {
        return [
            ...prefix,
            {
                symbol: 'acc',
                member: bare,
                memberText: bare,
                memberSymbolic: false,
                width: ACCUMULATORS[bare]
            }
        ]
    }
    if (bare in X86_OPERAND_MEANINGS) {
        return [...prefix, { symbol: bare, member: bare, memberText: bare, memberSymbolic: true }]
    }
    return [...prefix, literal(bare)]
}

function formInput(name: string, form: X86InstructionForm): FormInput {
    const parts: InputPart[] = [literal(name)]
    form.operands.forEach((operand, index) => {
        parts.push(literal(index === 0 ? ' ' : ', '))
        parts.push(...operandParts(operand))
    })
    const code = form.operands.length
        ? `${name} ${form.operands.map((operand) => operand.replace(/\s*\{[^}]*\}/g, '')).join(', ')}`
        : name
    const facts = [
        ...(form.cpu ? [`${formatX86Cpu(form.cpu)} and later`] : []),
        ...[
            ...new Set(
                form.notes
                    .filter((note) => !(name === 'cmp' && (note === 'LOCK' || note === 'LOCK1')))
                    .map((note) => NOTE_FACTS[note])
                    .filter(Boolean)
            )
        ]
    ]
    return { code, parts, tags: x86FormTags(form), facts }
}

/** An operand written as itself, `cl`, `1` or `fs`, rather than a symbol or a keyword. */
function isFixedOperand(text: string): boolean {
    return /^[a-z0-9]+$/.test(text)
}

/** Whether a row is one of NASM's short encodings of a general row: the accumulator, `moffs`. */
export function isShortEncoding(pattern: Pick<FormPattern, 'parts'>): boolean {
    return pattern.parts.some(
        (part) => part.symbol && (part.text === 'acc' || part.text === 'moffs')
    )
}

/**
 * The manual's order: the general register, memory and immediate rows first, then those naming a
 * register or a count of their own (`shl r/m, cl`, `push fs`), then the short encodings.
 */
function rank(pattern: Pick<FormPattern, 'parts'>): number {
    if (isShortEncoding(pattern)) return 2
    return pattern.parts.slice(1).some((part) => !part.symbol && isFixedOperand(part.text)) ? 1 : 0
}

/** The strip, from XED; none for the three instructions it has no record of. */
function flagStrip(name: string): FlagStrip | undefined {
    const flags = X86_INSTRUCTION_FLAGS[name]
    if (!flags) return undefined
    const order = X86_FLAG_ORDER.filter((flag) => flag in flags.marks)
    const marks: FlagMarks = {}
    const notes: Record<string, string> = {}
    for (const flag of order) {
        const mark = flags.marks[flag as keyof typeof flags.marks]!
        marks[flag] = { kind: mark.kind }
        if (mark.note) notes[flag] = capitalize(mark.note)
    }
    return { order, marks, reads: flags.reads, notes, note: flags.note }
}

function capitalize(text: string): string {
    const sentence = text.charAt(0).toUpperCase() + text.slice(1)
    return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

function omittedForms(instruction: X86Instruction, dropped: X86InstructionForm[]): OmittedForms[] {
    const omitted: OmittedForms[] = []
    const written = (form: X86InstructionForm) => {
        const code = formatX86Form(instruction.name, form).replace(/\s*\{[^}]*\}/g, '')
        return form.features.length > 0 ? `${code}  (${form.features.join(', ')})` : code
    }
    const extension = dropped.filter((form) => form.features.length > 0)
    const legacy = dropped.filter((form) => form.features.length === 0)
    if (extension.length > 0) {
        const features = [...new Set(extension.flatMap((form) => form.features))]
        const named =
            features.length <= 3 ? features.join(', ') : 'additional instruction-set extensions'
        omitted.push({
            count: extension.length,
            reason: `require ${named}`,
            forms: [...new Set(extension.map(written))]
        })
    }
    if (legacy.length > 0) {
        omitted.push({
            count: legacy.length,
            reason: 'only assemble outside 64-bit mode',
            forms: [...new Set(legacy.map(written))]
        })
    }
    return omitted
}

export function x86InstructionDocument(instruction: X86Instruction): InstructionDocument {
    const name = instruction.name
    const base = instruction.forms.filter((form) => form.features.length === 0)
    const sixtyFour = base.filter((form) => availableIn64BitMode(name, form))
    // A mnemonic long mode dropped keeps its forms: they are all there is to say about it.
    const shown = sixtyFour.length > 0 ? sixtyFour : base
    const dropped = instruction.forms.filter((form) => !shown.includes(form))

    const inputs = shown.map((form) => formInput(name, form))
    const seen = new Set<string>()
    const unique = inputs.filter((input) => {
        const key = `${input.code}\u0000${input.tags.join(',')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    const names = x86InstructionNames[name]
    const described = describeX86Instruction(name)
    const longName = names?.longName ?? x86InstructionTitle(name)
    const summary = names?.summary ?? summaryOf(described)

    const result = buildFormPatterns(unique, { rank })

    const headerFacts = [...result.headerFacts]
    const since = X86_FIRST_PROCESSOR[name] ?? `${formatX86Cpu(instruction.cpu)} and later`
    const level = headerFacts.findIndex((fact) => fact.endsWith('and later'))
    if (level === -1) headerFacts.unshift(since)
    else if (name in X86_FIRST_PROCESSOR) headerFacts[level] = since
    // A row's processor says something only when it is newer than the instruction's, and never
    // "x86-64": every 64-bit form needs it, which its size already says.
    const trivial = new Set([since, `${formatX86Cpu('X86_64')} and later`])
    for (const section of result.sections) {
        for (const group of section.groups) {
            for (const pattern of group.patterns) {
                pattern.facts = pattern.facts.filter((fact) => !trivial.has(fact))
                for (const form of pattern.forms) {
                    form.facts = form.facts.filter((fact) => !trivial.has(fact))
                }
            }
        }
    }
    if (sixtyFour.length === 0) headerFacts.push('Not available in 64-bit mode')

    const symbols = new Set<string>()
    for (const section of result.sections) {
        for (const group of section.groups) {
            for (const pattern of group.patterns) {
                for (const part of pattern.parts) if (part.symbol) symbols.add(part.text)
            }
        }
    }
    const operands: OperandSymbol[] = [...symbols].flatMap((symbol) => {
        const meaning = operandMeaning(name, symbol)
        return meaning ? [{ symbol, meaning }] : []
    })

    return {
        name,
        longName,
        summary,
        category: x86InstructionCategories[name],
        tags: result.tags,
        headerFacts,
        flags: flagStrip(name),
        sections: result.sections,
        omitted: omittedForms(instruction, dropped),
        operands,
        // the appendix's first sentence is what the header's summary stands for, whether the
        // names table rewrote it or not
        description: descriptionAfterSummary(
            described === instruction.summary ? undefined : described,
            summaryOf(described),
            plainText
        ),
        reference: x86IntelReference(name)
    }
}
