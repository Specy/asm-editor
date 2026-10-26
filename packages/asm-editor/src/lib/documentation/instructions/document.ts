import type { InstructionCategory, InstructionTag } from './categories'

/**
 * The one shape every language's instruction **Documentation entry** is drawn from, on its page
 * and in the Workbench's Documentation panel alike ([the design record](../../../../../../docs/design/instruction-layout.md),
 * [ADR 0052](../../../../../../docs/adr/0052-instruction-documents-are-built-in-the-editor-from-core-facts.md)).
 * Each language's adapter (`<language>/instructionDocument.ts`) builds it from that language's data;
 * the view reads nothing else. Plain data throughout, because a page's `load` sends it to the browser.
 */
export type InstructionDocument = {
    /** The mnemonic, as the language writes it. */
    name: string
    /** What the mnemonic stands for: "Load word", "Move if less or equal". */
    longName: string
    /** One plain sentence about the whole mnemonic, never one form's. */
    summary: string
    category?: InstructionCategory
    /** The **Instruction tags** every form has, said once beside the name. */
    tags: InstructionTag[]
    /** Facts every row shares, said once in the header: "Pentium Pro and later". */
    headerFacts: string[]
    flags?: FlagStrip
    /** Untagged Form patterns first, then one section per set of tags. */
    sections: FormSection[]
    /** Forms the list leaves out because this language's emulator does not run them. */
    omitted: OmittedForms[]
    /** The symbols the rows use, in the order they first appear. */
    operands: OperandSymbol[]
    /** Markdown, when the language has more to say than the summary. */
    description?: string
}

export type FormSection = {
    /** The tags every Form pattern of the section has, besides the mnemonic's own. */
    tags: InstructionTag[]
    /** What the tags mean here, said once under the heading. */
    explanation?: string
    /** Starts closed on the page: the Undocumented forms, which the manual leaves out. */
    collapsed: boolean
    groups: NoteGroup[]
}

/** Form patterns that share a note, which is said once above them. */
export type NoteGroup = { note?: string; patterns: FormPattern[] }

/** One row of the list: the **Instruction forms** that differ only in a width or a register. */
export type FormPattern = {
    /** The row's syntax: the mnemonic, punctuation and the operands' symbols. */
    parts: SyntaxPart[]
    /** The sizes the row comes in (x86), each with the facts only its forms have. */
    chips: PatternChip[]
    /** Facts every form of the row shares and not every row does: "2 bytes · 7 cycles". */
    facts: string[]
    /** Only when the mnemonic's rows affect the flags differently. */
    flags?: FlagMarks
    /** The forms the row stands for, shown when it is expanded. */
    forms: ConcreteForm[]
    /** Per operand, the addressing modes it takes (M68K). */
    details: PatternDetail[]
}

/** `symbol` marks a part the Operands legend explains; plain text otherwise. */
export type SyntaxPart = { text: string; symbol?: boolean }

export type PatternChip = { label: string; title?: string }

export type PatternDetail = {
    label: string
    values: string[]
    /** The 68000's name for the set, when it is one: "data alterable". */
    name?: string
}

export type ConcreteForm = {
    /** The form as a program writes it. */
    code: string
    /** Its own sentence, when the row's note does not cover it. */
    note?: string
    /** Its own facts, when the row's do not cover them. */
    facts: string[]
    /** The real instructions a pseudo-instruction becomes, in the row's symbols. */
    expansion?: string[]
}

export type FlagMarkKind = 'changed' | 'cleared' | 'set' | 'undefined' | 'unchanged'

export type FlagMark = {
    kind: FlagMarkKind
    /** A language's own word for it: "holds the signed overflow" for the Z80's P/V. */
    title?: string
}

export type FlagMarks = Record<string, FlagMark>

export type FlagStrip = {
    /** The flags in the order of the language's register panel. */
    order: string[]
    /** What most rows do to the flags; a row that does otherwise has its own marks. */
    marks?: FlagMarks
    /** Whether some rows have marks of their own. */
    varies?: boolean
    /** Flags the instruction reads, such as a conditional move's condition. */
    reads?: string[]
    /** Notes about one flag: "Defined only for a count of 1." */
    notes?: Record<string, string>
    /** What holds for every flag: "A count of 0 leaves every flag unchanged." */
    note?: string
}

export type OmittedForms = {
    count: number
    /** "need an extension this emulator does not run". */
    reason: string
    /** The forms themselves, listed when the reader opens the line. */
    forms: string[]
}

export type OperandSymbol = {
    symbol: string
    /** One line, markdown: what it stands for and its range. */
    meaning: string
    /** The symbol's own **Documentation entry**, where there is one. */
    href?: string
}

/** What each flag mark means, for the strip's legend. */
export const FLAG_MARK_MEANINGS: Record<FlagMarkKind, string> = {
    changed: 'set from the result',
    cleared: 'always 0',
    set: 'always 1',
    undefined: 'undefined afterwards',
    unchanged: 'not changed'
}

/** The character each mark is drawn with. */
export const FLAG_MARK_GLYPHS: Record<FlagMarkKind, string> = {
    changed: '●',
    cleared: '0',
    set: '1',
    undefined: '?',
    unchanged: '–'
}

/** The syntax of a row as one string, for tests and for the copy a reader takes away. */
export function patternText(pattern: Pick<FormPattern, 'parts'>): string {
    return pattern.parts.map((part) => part.text).join('')
}

/** Stands in for the dot of an "e.g." or an "i.e." while the end of a sentence is looked for. */
const HELD_DOT = '\u2024'

/**
 * A description without its first sentence when that sentence is the summary the header already
 * shows; undefined when nothing is left. Any other description comes back whole.
 */
export function descriptionAfterSummary(
    markdown: string | undefined,
    summary: string,
    plain: (markdown: string) => string
): string | undefined {
    if (!markdown?.trim()) return undefined
    const held = markdown.replace(/\b(e\.g|i\.e)\.(?=\s)/g, `$1${HELD_DOT}`)
    const match = /^([\s\S]+?[.!?])(\s+|$)/.exec(held)
    if (!match) return plain(markdown) === summary ? undefined : markdown
    const first = plain(match[1].split(HELD_DOT).join('.'))
    // A summary cut to fit a row ends in "…" and is the start of the sentence it was cut from.
    const cut = summary.endsWith('…') && first.startsWith(summary.slice(0, -1).trimEnd())
    if (first !== summary && !cut) return markdown
    const rest = held.slice(match[0].length).split(HELD_DOT).join('.').trim()
    return rest || undefined
}

/** How many Form patterns a row's signature names before it trails off. */
const SIGNATURE_PATTERNS = 3

/**
 * What a Documentation panel row shows after the mnemonic: the operands of its first untagged Form
 * patterns, `r/m, reg | reg, r/m | r/m, imm | …`, and `[imm16]` when the operands are optional, as
 * `ret` and `ret imm16` are. Undefined for an instruction that takes none.
 */
export function documentSignature(
    document: InstructionDocument,
    /** Rows a language leaves out of its signature, such as x86's short encodings. */
    skip: (pattern: FormPattern) => boolean = () => false
): string | undefined {
    const untagged =
        document.sections.find((section) => section.tags.length === 0) ?? document.sections[0]
    if (!untagged) return undefined
    const operands = [
        ...new Set(
            untagged.groups.flatMap((group) =>
                group.patterns
                    .filter((pattern) => !skip(pattern))
                    .map((pattern) => patternText(pattern).slice(document.name.length).trim())
            )
        )
    ]
    const written = operands.filter(Boolean)
    if (written.length === 0) return undefined
    const shown = written.slice(0, SIGNATURE_PATTERNS).join(' | ')
    const cut = written.length > SIGNATURE_PATTERNS ? `${shown} | …` : shown
    return written.length < operands.length ? `[${cut}]` : cut
}

/** Whether a row has anything to show when opened: other forms, their own words, its modes. */
export function patternOpens(pattern: Pick<FormPattern, 'forms' | 'details'>): boolean {
    return (
        pattern.forms.length > 1 ||
        pattern.details.length > 0 ||
        pattern.forms.some((form) => form.expansion?.length || form.note || form.facts.length > 0)
    )
}

/** Every Form pattern of a document, section by section. */
export function documentPatterns(document: Pick<InstructionDocument, 'sections'>): FormPattern[] {
    return document.sections.flatMap((section) => section.groups.flatMap((group) => group.patterns))
}
