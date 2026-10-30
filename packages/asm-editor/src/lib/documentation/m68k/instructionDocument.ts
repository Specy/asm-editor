import {
    AffectedFlagKind,
    branchConditionsFlags,
    fromSizeToString,
    M68KFlag,
    M68KUncompoundedInstructions,
    type InstructionDocumentation
} from '#lib/languages/M68K/M68K-documentation.ts'
import { m68kInstructionForms, type M68KInstructionForm } from '#lib/languages/M68K/M68K-forms.ts'
import { m68kDialectHas, m68kFormShown, type M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
import { plainText, summaryOf } from '../entries'
import { M68K_BIT_FIELD_MODE, m68kFormTags } from '../instructions/formTags'
import {
    descriptionAfterSummary,
    type FlagMarkKind,
    type FlagMarks,
    type FlagStrip,
    type InstructionDocument,
    type OperandSymbol,
    type PatternDetail
} from '../instructions/document'
import {
    buildFormPatterns,
    literal,
    type FormInput,
    type InputPart
} from '../instructions/formPatterns'
import { m68kEntryName, m68kInstructionCategory } from './families'
import { m68kDescription, m68kLongName, m68kSummary } from './instructionNames'
import {
    M68020_INDEXED,
    M68K_MODE_ORDER,
    M68K_MODE_SYMBOLS,
    m68kModeClass,
    m68kOperandLine,
    withoutThe68020
} from './operands'

/**
 * An M68K instruction as the shared instruction view draws it
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), M2 and decision 18): one
 * row per form s68k lists, an operand with one addressing mode written as that mode and one with
 * several as `<ea>`, the modes and their 68000 class in the opened row, the sizes in the header
 * when every row shares them, and the flags of the hand-written Documentation as the strip.
 */

/** The flags in the order of the M68K register panel, which is the status register's. */
const FLAG_ORDER = [
    M68KFlag.Extend,
    M68KFlag.Negative,
    M68KFlag.Zero,
    M68KFlag.Overflow,
    M68KFlag.Carry
]

const FLAG_KINDS: Record<AffectedFlagKind, FlagMarkKind> = {
    [AffectedFlagKind.Edits]: 'changed',
    [AffectedFlagKind.ToZero]: 'cleared',
    [AffectedFlagKind.ToOne]: 'set',
    [AffectedFlagKind.Unaffected]: 'unchanged'
}

/** The instructions that read a flag besides their condition, by Documentation entry. */
const READS: Readonly<Record<string, string[]>> = {
    addx: ['X'],
    subx: ['X'],
    negx: ['X'],
    abcd: ['X'],
    sbcd: ['X'],
    nbcd: ['X'],
    roxd: ['X'],
    trapv: ['V']
}

/** The families whose members test a condition, and where the condition starts in the mnemonic. */
const CONDITION_FAMILIES: Readonly<Record<string, number>> = { bcc: 1, scc: 1, dbcc: 2, trapcc: 4 }

/** The entries whose lone `Ea/<label>` operand is a branch target, written `label`. */
const BRANCHES = new Set(['bra', 'bsr', 'bcc', 'dbcc', 'dbra'])

/** The entries whose operands are neither a source nor a destination. */
const UNNAMED_ROLES = new Set(['exg', 'chk', 'chk2', 'cmp2'])

/** The modes a register list position takes: a list, or one register as a list of one. */
const LIST_MODES = new Set(['Dn', 'An', '<register list>'])

/** The 68000's indexed modes, where the 68020 takes its own indexed modes too. */
const INDEXED_MODES = new Set(['d(An,Xn)', 'd(PC,Xn)'])

/** The modes `movec` names a control register by: the USP, or VBR, SFC and DFC. */
const CONTROL_MODES = new Set(['usp', 'Rc'])

/** s68k's name for the 68020's pair of data registers, `d1:d2`. */
const REGISTER_PAIR = 'Dx:Dy'

/**
 * How a row writes a pair of data registers, in the manual's letters for what each holds: a
 * product's high and low longs, `cas2`'s compare and update registers, and otherwise a division's
 * remainder and quotient.
 */
function registerPairSymbol(entry: string | undefined, index: number): string {
    if (entry === 'cas2') return index === 0 ? 'Dc1:Dc2' : 'Du1:Du2'
    if (entry === 'muls' || entry === 'mulu') return 'Dh:Dl'
    return 'Dr:Dq'
}

/**
 * The 68020's long multiplies and divides write one data register or a pair, which s68k lists as
 * one form and the manual as two rows, `muls.l <ea>, Dl` and `muls.l <ea>, Dh:Dl`: a form whose
 * position takes both is split into one form each.
 */
function splitPairs(form: M68KInstructionForm): M68KInstructionForm[] {
    const at = form.operands.findIndex((modes) => modes.length > 1 && modes.includes(REGISTER_PAIR))
    if (at < 0) return [form]
    return form.operands[at].map((mode) => ({
        ...form,
        operands: form.operands.map((modes, index) => (index === at ? [mode] : modes))
    }))
}

const SIZE_SUFFIXES: Record<M68KInstructionForm['sizes'][number], string> = {
    byte: '.b',
    word: '.w',
    long: '.l',
    short: '.s'
}

/** The 68000 reserves these for supervisor mode, and s68k enforces it. */
const PRIVILEGED_EXPLANATION =
    'These forms require supervisor mode, the mode a program starts in. In user mode they raise a privilege violation. See [user and supervisor mode](/documentation/m68k/exceptions#modes).'

/**
 * What the forms a later processor brought need: the `opt p=` line that writes the program for it
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3), or for the bit
 * fields EASy68K's `opt bit`.
 */
const PROCESSOR_EXPLANATIONS = {
    '68010':
        'These forms are available on the 68010 and 68020. Select `opt p=68010` or `opt p=68020` before any code or data.',
    '68020': 'These forms require the 68020. Select `opt p=68020` before any code or data.',
    'opt-bit':
        'These forms are also available in a 68000 or 68010 program with `opt bit`, EASy68K’s option for bit-field instructions.'
} as const

/**
 * What a row says of a form a later processor made privileged that its own first processor did not,
 * `move sr, <ea>`, read from the table's `privilegedFrom`: the 68000 runs it in user mode.
 */
const PRIVILEGED_FROM = {
    '68010': 'Privileged on the 68010 and 68020',
    '68020': 'Privileged on the 68020'
} as const

/** The processors that have what a later one brought: s68k's family ends at the 68020. */
const PROCESSOR_ONLY = {
    '68010': '68010 and 68020 only',
    '68020': '68020 only'
} as const

/** A processor after the 68000, which a program chooses with `opt p=`. */
export type M68kLaterProcessor = keyof typeof PROCESSOR_ONLY

export function isM68kLaterProcessor(name: string): name is M68kLaterProcessor {
    return Object.hasOwn(PROCESSOR_ONLY, name)
}

/**
 * Which processors have an instruction only a later one brought: "68020 only". A bit field, which
 * `opt bit` gives the 68000 and the 68010, says so.
 */
export function m68kProcessorOnly(processor: M68kLaterProcessor, bitField = false): string {
    return bitField ? '68020, or 68000 and 68010 with opt bit' : PROCESSOR_ONLY[processor]
}

/**
 * What the header, the hover and completion say of an instruction every form of which a later
 * processor brought, `extb`: the program has to be written for that processor. A bit field's
 * program can be one for the 68000 or the 68010 with `opt bit`, as in EASy68K.
 */
export function m68kProcessorFact(processor: M68kLaterProcessor, bitField = false): string {
    if (bitField)
        return 'Select `opt p=68020`, or use `opt bit` with the 68000 or 68010, before any code or data'
    return `${PROCESSOR_ONLY[processor]}: select \`opt p=${processor}\` before any code or data`
}

/** Whether a tag is one the processor fact says again: a later processor, or `opt bit`. */
export function isM68kProcessorTag(tag: string): boolean {
    return tag === 'opt-bit' || isM68kLaterProcessor(tag)
}

const MODE_RANK = new Map(M68K_MODE_ORDER.map((mode, index) => [mode, index]))

/** A position's modes as the pages write them, in the manual's order. */
function modeNames(modes: readonly string[]): string[] {
    return [...new Set(modes.map((mode) => M68K_MODE_SYMBOLS[mode] ?? mode))].sort(
        (a, b) => (MODE_RANK.get(a) ?? Infinity) - (MODE_RANK.get(b) ?? Infinity)
    )
}

/**
 * How a row writes an operand position: its one mode, a register list, or `<ea>`; a pair in the
 * letters of what it holds. A bit field's position is written by what the field is in, and the
 * field after it.
 */
function positionSymbol(
    allModes: readonly string[],
    branch: boolean,
    entry: string | undefined,
    index: number
): string {
    const modes = allModes.filter((mode) => mode !== M68K_BIT_FIELD_MODE)
    if (modes.length === 1) {
        const [mode] = modes
        if (mode === 'Ea/<label>' && branch) return 'label'
        if (mode === REGISTER_PAIR) return registerPairSymbol(entry, index)
        return M68K_MODE_SYMBOLS[mode] ?? mode
    }
    if (modes.includes('<register list>') && modes.every((mode) => LIST_MODES.has(mode))) {
        return '<register list>'
    }
    // the manual's `Rc` and `Rn`, which keep `movec`'s and `moves`'s two directions apart
    if (modes.every((mode) => CONTROL_MODES.has(mode))) return 'Rc'
    if (modes.length === 2 && modes.includes('Dn') && modes.includes('An')) return 'Rn'
    return '<ea>'
}

function roleLabel(entry: string | undefined, index: number, count: number): string {
    if (count === 1) return 'Operand'
    if (count > 2 || (entry !== undefined && UNNAMED_ROLES.has(entry)))
        return `Operand ${index + 1}`
    return index === 0 ? 'Source' : 'Destination'
}

/** "Sizes .b .w .l, .w by default", or the one size a form takes. */
function sizeFact(
    form: M68KInstructionForm,
    defaultSize: InstructionDocumentation['defaultSize']
): string[] {
    if (form.sizes.length === 0) return []
    const suffixes = form.sizes.map((size) => SIZE_SUFFIXES[size] ?? size)
    if (suffixes.length === 1) return [`Size ${suffixes[0]}`]
    const fallback = defaultSize === undefined ? undefined : fromSizeToString(defaultSize, true)
    const byDefault = form.sizes.find((size) => size === fallback)
    return [
        `Sizes ${suffixes.join(' ')}${byDefault ? `, ${SIZE_SUFFIXES[byDefault]} by default` : ''}`
    ]
}

/**
 * "Privileged on the 68010 and 68020", for a form only a later processor reserves; nothing in a
 * program for a processor before it, which runs the form in user mode.
 */
function privilegedFromFact(form: M68KInstructionForm, dialect?: M68kDialect): string[] {
    const from = form.privilegedFrom
    if (form.privileged || from === undefined || !isM68kLaterProcessor(from)) return []
    if (dialect && !m68kDialectHas(dialect, { processor: from })) return []
    return [PRIVILEGED_FROM[from]]
}

function formInput(
    name: string,
    entry: string | undefined,
    form: M68KInstructionForm,
    defaultSize: InstructionDocumentation['defaultSize'],
    dialect?: M68kDialect
): FormInput {
    const branch = entry !== undefined && BRANCHES.has(entry)
    const parts: InputPart[] = [literal(name)]
    const details: PatternDetail[] = []
    const symbols = form.operands.map((modes, index) => positionSymbol(modes, branch, entry, index))
    const written = form.operands.map((modes, index) =>
        modes.includes(M68K_BIT_FIELD_MODE)
            ? `${symbols[index]}${M68K_BIT_FIELD_MODE}`
            : symbols[index]
    )
    form.operands.forEach((allModes, index) => {
        const symbol = symbols[index]
        parts.push(literal(index === 0 ? ' ' : ', '))
        // Every form is its own row, so the member is the symbol itself.
        parts.push({ symbol, member: symbol, memberText: symbol, memberSymbolic: true })
        //the field straight after what it is in, as s68k names it: `<ea>{offset:width}`
        if (allModes.includes(M68K_BIT_FIELD_MODE)) {
            parts.push({
                symbol: M68K_BIT_FIELD_MODE,
                member: M68K_BIT_FIELD_MODE,
                memberText: M68K_BIT_FIELD_MODE,
                memberSymbolic: true
            })
        }
        const modes = allModes.filter((mode) => mode !== M68K_BIT_FIELD_MODE)
        if (modes.length > 1) {
            const values = modeNames(modes)
            details.push({
                label: roleLabel(entry, index, form.operands.length),
                values,
                name: m68kModeClass(values)
            })
        }
    })
    return {
        code: written.length > 0 ? `${name} ${written.join(', ')}` : name,
        parts,
        tags: m68kFormTags(form),
        facts: [...sizeFact(form, defaultSize), ...privilegedFromFact(form, dialect)],
        // Two forms with the same symbols take different modes: they stay apart.
        split: JSON.stringify([form.operands, form.sizes]),
        details
    }
}

function flagStrip(
    name: string,
    entry: string | undefined,
    instruction: InstructionDocumentation
): FlagStrip {
    const marks: FlagMarks = {}
    for (const flag of FLAG_ORDER)
        marks[flag] = { kind: FLAG_KINDS[instruction.affectsFlags[flag]] }
    const reads = new Set(entry === undefined ? [] : (READS[entry] ?? []))
    const start = entry === undefined || entry === name ? undefined : CONDITION_FAMILIES[entry]
    if (start !== undefined) {
        const test = branchConditionsFlags.get(name.slice(start)) ?? ''
        for (const letter of test.toUpperCase().match(/[XNZVC]/g) ?? []) reads.add(letter)
    }
    return {
        order: [...FLAG_ORDER],
        marks,
        reads: reads.size > 0 ? FLAG_ORDER.filter((flag) => reads.has(flag)) : undefined
    }
}

/**
 * The forms an instruction's document draws: a member's own where s68k lists it (`beq`), else its
 * family's (`asd` is no mnemonic), as the instruction page reads them, and with a `dialect` only
 * those a program written for it can write.
 */
export function m68kDocumentForms(name: string, dialect?: M68kDialect): M68KInstructionForm[] {
    const instruction = M68KUncompoundedInstructions.get(name)
    if (!instruction) return []
    const own = m68kInstructionForms({ name })
    const forms = own.length > 0 ? own : m68kInstructionForms(instruction)
    return dialect ? forms.filter((form) => m68kFormShown(form, dialect)) : forms
}

/**
 * The document of an M68K instruction page: any of the Documentation's names, a family's (`bcc`,
 * `asd`) and its members' (`beq`, `asl`) alike. Undefined for a name with no page.
 *
 * With a `dialect`, it is the document the Workbench's Documentation panel shows a program written
 * for it, without what a later processor brought: the rows of its forms, the privilege only a
 * later processor gives a form, and what the legend says of the 68020 alone
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36). Undefined then
 * too for an instruction the program cannot write in any form.
 */
export function m68kInstructionDocument(
    name: string,
    dialect?: M68kDialect
): InstructionDocument | undefined {
    const instruction = M68KUncompoundedInstructions.get(name)
    if (!instruction) return undefined
    const entry = m68kEntryName(name)
    const forms = m68kDocumentForms(name, dialect)
    if (dialect && forms.length === 0) return undefined

    const result = buildFormPatterns(
        forms
            .flatMap(splitPairs)
            .map((form) => formInput(name, entry, form, instruction.defaultSize, dialect)),
        { tagExplanations: { privileged: PRIVILEGED_EXPLANATION, ...PROCESSOR_EXPLANATIONS } }
    )
    const laterProcessor = result.tags.find(isM68kLaterProcessor)
    const processorFact = laterProcessor
        ? m68kProcessorFact(laterProcessor, result.tags.includes('opt-bit'))
        : undefined

    // The rows' own symbols, and `#imm` where an opened row lists it, since its range is the
    // instruction's own (`1` to `8` for a shift). The other modes an opened row lists are the
    // Addressing Modes Chapter's, which `<ea>` links to.
    const symbols = new Set<string>()
    let immediate = false
    //an `<ea>` that takes an indexed mode takes the 68020's too, which no row lists
    let indexed = false
    for (const section of result.sections) {
        for (const group of section.groups) {
            for (const pattern of group.patterns) {
                for (const part of pattern.parts) if (part.symbol) symbols.add(part.text)
                for (const detail of pattern.details) {
                    immediate ||= detail.values.includes('#imm')
                    indexed ||= detail.values.some((mode) => INDEXED_MODES.has(mode))
                }
            }
        }
    }
    if (immediate) symbols.add('#imm')
    const listed = [...symbols]
    const m68020 = !dialect || m68kDialectHas(dialect, { processor: '68020' })
    const operands: OperandSymbol[] = listed.flatMap((symbol) => {
        const written = m68kOperandLine(symbol, entry)
        if (!written) return []
        const line = m68020 ? written : withoutThe68020(written)
        if (symbol === '<ea>' && indexed && m68020) {
            return [{ symbol, ...line, meaning: `${line.meaning} ${M68020_INDEXED}` }]
        }
        return [{ symbol, ...line }]
    })

    const summary = m68kSummary(name)
    return {
        name,
        longName: m68kLongName(name),
        summary,
        category: m68kInstructionCategory(name),
        tags: result.tags,
        //last, since it goes on to say what to do
        headerFacts: processorFact ? [...result.headerFacts, processorFact] : result.headerFacts,
        flags: flagStrip(name, entry, instruction),
        sections: result.sections,
        omitted: [],
        operands,
        // the Documentation's first sentence is what the header's summary stands for, whether
        // the names table rewrote it or not
        description: descriptionAfterSummary(
            m68kDescription(name),
            summaryOf(m68kDescription(name) ?? ''),
            plainText
        )
    }
}
