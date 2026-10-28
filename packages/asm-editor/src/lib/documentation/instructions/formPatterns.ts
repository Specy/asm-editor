import { INSTRUCTION_TAGS, mnemonicTags, type InstructionTag } from './categories'
import type {
    ConcreteForm,
    FlagMarks,
    FormPattern,
    FormSection,
    NoteGroup,
    PatternChip,
    PatternDetail,
    SyntaxPart
} from './document'

/**
 * The one grouping every language's adapter uses to turn its **Instruction forms** into **Form
 * patterns** ([the design record](../../../../../../docs/design/instruction-layout.md), decisions
 * 2-4). The adapter says what each operand is; this decides the rows, their facts, their notes and
 * the sections they sit in.
 */

/** A literal piece of a form's syntax: the mnemonic, a comma, a fixed register such as `cl`. */
export type LiteralPart = { text: string }

/**
 * An operand that belongs to a class: Z80 `b` is the member `b` of `r`, x86 `r/m32` the member
 * `r/m32` of `r/m` at width 32. Forms that differ only in their members are one row.
 */
export type ClassPart = {
    /** What the row writes when it stands for several members: `r`, `r/m`, `imm`. */
    symbol: string
    /** Which one this form has, compared to tell members apart. */
    member: string
    /** What the row writes when every form of it has this member: `b`, `r/m32`, `imm16`. */
    memberText: string
    /** Whether `memberText` is a symbol the legend explains (`imm16`) or plain code (`hl`). */
    memberSymbolic: boolean
    /** The operand size, for the row's chips (x86). */
    width?: number
}

export type InputPart = LiteralPart | ClassPart

export type FormInput = {
    /** The form as a program writes it, shown when its row is expanded. */
    code: string
    parts: InputPart[]
    tags: InstructionTag[]
    /** Its own sentence. */
    note?: string
    /** What the row's fact line says about it: "2 bytes · 7 cycles". */
    facts?: string[]
    /** Anything that must keep it off another form's row: different cycles, different flags. */
    split?: string
    flags?: FlagMarks
    expansion?: string[]
    details?: PatternDetail[]
}

export type PatternOptions = {
    /** The members a symbol can stand for, so a row covering only some says which. */
    universe?: (symbol: string) => readonly string[] | undefined
    /**
     * A form's sentence with the row's members replaced by its symbols, so that "Loads B into A"
     * and "Loads C into A" both read "Loads `r'` into `r`". Without it, a row has a note only
     * when every form's sentence is the same.
     */
    templateNote?: (form: FormInput, merged: MergedMember[]) => string | undefined
    /** Notes that say no more than the instruction's description, dropped from the rows. */
    redundantNotes?: readonly string[]
    /** Orders rows within a section; rows of equal rank keep the source's order. */
    rank?: (pattern: FormPattern) => number
    /** What a section's tags mean in this language. */
    tagExplanations?: Partial<Record<InstructionTag, string>>
    /** Whether a section starts closed on the page. */
    collapse?: (tags: readonly InstructionTag[]) => boolean
}

/** One member a row's symbol replaced in a form, for `templateNote`. */
export type MergedMember = { symbol: string; member: string; memberText: string }

export type PatternResult = {
    /** The tags every form has, said beside the name rather than on a section. */
    tags: InstructionTag[]
    /** Facts every row shares, moved to the header. */
    headerFacts: string[]
    /** The flags most rows affect the same way; the rows that differ carry their own. */
    flags?: FlagMarks
    /** Whether some rows carry flags of their own. */
    flagsVary: boolean
    sections: FormSection[]
}

const DEFAULT_TAG_EXPLANATIONS: Record<InstructionTag, string> = {
    pseudo: 'The assembler turns these into one or more real instructions.',
    'rv64-only': 'Only on the RV64 target.',
    undocumented:
        "Left out of the processor's manual, but the processor and this emulator run them.",
    privileged: 'The processor reserves these for supervisor or kernel mode.',
    '68010': 'A 68010 or a later processor has these.',
    '68020': 'Only a 68020 has these.'
}

const TAG_ORDER = new Map<InstructionTag, number>(
    INSTRUCTION_TAGS.map((tag, index) => [tag.id, index])
)

function isClassPart(part: InputPart): part is ClassPart {
    return 'symbol' in part
}

/** A sentence as compared: no surrounding or doubled spaces, no final full stop, any case. */
export function normalizeNote(note: string): string {
    return note
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.\s]+$/, '')
        .toLowerCase()
}

function sortTags(tags: readonly InstructionTag[]): InstructionTag[] {
    return [...new Set(tags)].sort((a, b) => (TAG_ORDER.get(a) ?? 0) - (TAG_ORDER.get(b) ?? 0))
}

function formKey(form: FormInput): string {
    const syntax = form.parts
        .map((part) => (isClassPart(part) ? `\u0001${part.symbol}` : part.text))
        .join('\u0000')
    return [syntax, sortTags(form.tags).join(','), form.split ?? ''].join('\u0002')
}

function sameFlags(a: FlagMarks | undefined, b: FlagMarks | undefined): boolean {
    if (!a || !b) return a === b
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
        if (a[key]?.kind !== b[key]?.kind || a[key]?.title !== b[key]?.title) return false
    }
    return true
}

/** The facts all of `lists` have, in the first list's order. */
function sharedFacts(lists: readonly (readonly string[])[]): string[] {
    const [first, ...rest] = lists
    if (!first) return []
    return first.filter((fact) => rest.every((list) => list.includes(fact)))
}

type Draft = {
    pattern: FormPattern
    tags: InstructionTag[]
    inputs: FormInput[]
    note?: string
}

function buildPattern(inputs: FormInput[], options: PatternOptions): Draft {
    const first = inputs[0]
    const parts: SyntaxPart[] = []
    const merged: { index: number; members: ClassPart[] }[] = []
    first.parts.forEach((part, index) => {
        if (!isClassPart(part)) {
            parts.push({ text: part.text })
            return
        }
        const members = new Map<string, ClassPart>()
        for (const input of inputs) {
            const own = input.parts[index] as ClassPart
            if (!members.has(own.member)) members.set(own.member, own)
        }
        if (members.size === 1) {
            parts.push({ text: part.memberText, symbol: part.memberSymbolic || undefined })
        } else {
            parts.push({ text: part.symbol, symbol: true })
            merged.push({ index, members: [...members.values()] })
        }
    })

    const facts = sharedFacts(inputs.map((input) => input.facts ?? []))

    for (const { members } of merged) {
        const symbol = members[0].symbol
        const universe = options.universe?.(symbol)
        if (!universe || members.some((member) => member.width !== undefined)) continue
        const covered = new Set(members.map((member) => member.member))
        if (universe.every((member) => covered.has(member))) continue
        // in the class's own order, `a b c d e`, not the order the forms happen to come in
        const order = (member: ClassPart) => {
            const index = universe.indexOf(member.member)
            return index < 0 ? universe.length : index
        }
        const listed = [...members].sort((a, b) => order(a) - order(b))
        facts.push(`${symbol}: ${listed.map((member) => member.memberText).join(' ')}`)
    }

    const chips: PatternChip[] = []
    const sized = merged.find(({ members }) => members.some((member) => member.width !== undefined))
    if (sized) {
        const widths = [
            ...new Set(
                inputs
                    .map((input) => (input.parts[sized.index] as ClassPart).width)
                    .filter((width): width is number => width !== undefined)
            )
        ].sort((a, b) => a - b)
        if (widths.length > 1) {
            for (const width of widths) {
                const own = inputs.filter(
                    (input) => (input.parts[sized.index] as ClassPart).width === width
                )
                const only = sharedFacts(own.map((input) => input.facts ?? [])).filter(
                    (fact) => !facts.includes(fact)
                )
                chips.push({
                    label: String(width),
                    title: only.length > 0 ? only.join(' · ') : undefined
                })
            }
        }
    }

    const notes = inputs.map((input) => {
        if (!options.templateNote) return input.note
        const members: MergedMember[] = merged.map(({ index }) => {
            const own = input.parts[index] as ClassPart
            return { symbol: own.symbol, member: own.member, memberText: own.memberText }
        })
        return options.templateNote(input, members) ?? input.note
    })
    const firstNote = notes[0]
    const shared =
        firstNote !== undefined &&
        notes.every(
            (note) => note !== undefined && normalizeNote(note) === normalizeNote(firstNote)
        )
            ? firstNote
            : undefined

    const forms: ConcreteForm[] = inputs.map((input) => ({
        code: input.code,
        note: shared === undefined ? input.note : undefined,
        facts: (input.facts ?? []).filter((fact) => !facts.includes(fact)),
        expansion: input.expansion
    }))

    return {
        pattern: {
            parts,
            chips,
            facts,
            flags: first.flags,
            forms,
            details: first.details ?? []
        },
        tags: sortTags(first.tags),
        inputs,
        note: shared
    }
}

/**
 * The rows, sections and header facts for one mnemonic's forms, in the forms' order. Forms with
 * different tags, or a different `split`, are never one row.
 */
export function buildFormPatterns(
    forms: readonly FormInput[],
    options: PatternOptions = {}
): PatternResult {
    const byKey = new Map<string, FormInput[]>()
    for (const form of forms) {
        const key = formKey(form)
        const group = byKey.get(key)
        if (group) group.push(form)
        else byKey.set(key, [form])
    }
    const drafts = [...byKey.values()].map((inputs) => buildPattern(inputs, options))

    const redundant = new Set((options.redundantNotes ?? []).map(normalizeNote))
    const isRedundant = (note: string | undefined) =>
        note !== undefined && (note.trim() === '' || redundant.has(normalizeNote(note)))
    for (const draft of drafts) {
        if (isRedundant(draft.note)) draft.note = undefined
        // In a row whose forms each keep their own sentence, one that repeats the description
        // still tells its form apart from the others (`li $t1,-100` beside `li $t1,100`), so they
        // go only all together.
        const forms = draft.pattern.forms
        if (forms.every((form) => form.note === undefined || isRedundant(form.note))) {
            for (const form of forms) form.note = undefined
        }
    }

    const headerFacts = sharedFacts(drafts.map((draft) => draft.pattern.facts))
    for (const draft of drafts) {
        draft.pattern.facts = draft.pattern.facts.filter((fact) => !headerFacts.includes(fact))
    }

    // The strip says what most rows do; a row that does otherwise carries its own flags.
    const flagged = drafts.filter((draft) => draft.pattern.flags !== undefined)
    let common: FlagMarks | undefined
    let commonCount = 0
    for (const draft of flagged) {
        const count = flagged.filter((other) =>
            sameFlags(other.pattern.flags, draft.pattern.flags)
        ).length
        if (count > commonCount) {
            common = draft.pattern.flags
            commonCount = count
        }
    }
    const flagsVary = commonCount < flagged.length
    for (const draft of drafts) {
        if (sameFlags(draft.pattern.flags, common)) draft.pattern.flags = undefined
    }

    const tags = mnemonicTags(forms.map((form) => form.tags))
    const sectionsByKey = new Map<string, { tags: InstructionTag[]; drafts: Draft[] }>()
    for (const draft of drafts) {
        const own = draft.tags.filter((tag) => !tags.includes(tag))
        const key = own.join(',')
        const section = sectionsByKey.get(key)
        if (section) section.drafts.push(draft)
        else sectionsByKey.set(key, { tags: own, drafts: [draft] })
    }
    const ordered = [...sectionsByKey.values()].sort((a, b) => {
        if (a.tags.length !== b.tags.length) return a.tags.length - b.tags.length
        for (let i = 0; i < a.tags.length; i++) {
            const order = (TAG_ORDER.get(a.tags[i]) ?? 0) - (TAG_ORDER.get(b.tags[i]) ?? 0)
            if (order !== 0) return order
        }
        return 0
    })

    const explanations = { ...DEFAULT_TAG_EXPLANATIONS, ...options.tagExplanations }
    const sections: FormSection[] = ordered.map((section) => {
        const ranked = options.rank
            ? section.drafts
                  .map((draft, index) => ({ draft, index, rank: options.rank!(draft.pattern) }))
                  .sort((a, b) => a.rank - b.rank || a.index - b.index)
                  .map(({ draft }) => draft)
            : section.drafts
        const groups: NoteGroup[] = []
        const byNote = new Map<string, NoteGroup>()
        for (const draft of ranked) {
            const key = draft.note === undefined ? '\u0000' : normalizeNote(draft.note)
            let group = byNote.get(key)
            if (!group) {
                group = { note: draft.note, patterns: [] }
                byNote.set(key, group)
                groups.push(group)
            }
            group.patterns.push(draft.pattern)
        }
        const explanation = section.tags
            .map((tag) => explanations[tag])
            .filter(Boolean)
            .join(' ')
        return {
            tags: section.tags,
            explanation: explanation || undefined,
            collapsed: options.collapse
                ? options.collapse(section.tags)
                : section.tags.includes('undocumented'),
            groups
        }
    })

    return {
        tags,
        headerFacts,
        flags: common,
        flagsVary,
        sections
    }
}

/** A literal part; most of a form is literal. */
export function literal(text: string): LiteralPart {
    return { text }
}
