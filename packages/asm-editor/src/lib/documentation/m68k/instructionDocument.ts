import {
    AffectedFlagKind,
    branchConditionsFlags,
    fromSizeToString,
    M68KFlag,
    M68KUncompoundedInstructions,
    type InstructionDocumentation
} from '#lib/languages/M68K/M68K-documentation.ts'
import { m68kInstructionForms, type M68KInstructionForm } from '#lib/languages/M68K/M68K-forms.ts'
import { plainText, summaryOf } from '../entries'
import { m68kFormTags } from '../instructions/formTags'
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
import { M68K_MODE_ORDER, M68K_MODE_SYMBOLS, m68kModeClass, m68kOperandLine } from './operands'

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
const CONDITION_FAMILIES: Readonly<Record<string, number>> = { bcc: 1, scc: 1, dbcc: 2 }

/** The entries whose lone `Ea/<label>` operand is a branch target, written `label`. */
const BRANCHES = new Set(['bra', 'bsr', 'bcc', 'dbcc', 'dbra'])

/** The entries whose operands are neither a source nor a destination. */
const UNNAMED_ROLES = new Set(['exg', 'chk'])

/** The modes a register list position takes: a list, or one register as a list of one. */
const LIST_MODES = new Set(['Dn', 'An', '<register list>'])

const SIZE_SUFFIXES: Record<M68KInstructionForm['sizes'][number], string> = {
    byte: '.b',
    word: '.w',
    long: '.l',
    short: '.s'
}

/** The 68000 reserves these for supervisor mode, which s68k does not enforce. */
const PRIVILEGED_EXPLANATION =
    'A 68000 runs these only in supervisor mode; s68k runs every program in supervisor mode, as EASy68K does, so they run here too.'

const MODE_RANK = new Map(M68K_MODE_ORDER.map((mode, index) => [mode, index]))

/** A position's modes as the pages write them, in the manual's order. */
function modeNames(modes: readonly string[]): string[] {
    return [...new Set(modes.map((mode) => M68K_MODE_SYMBOLS[mode] ?? mode))].sort(
        (a, b) => (MODE_RANK.get(a) ?? Infinity) - (MODE_RANK.get(b) ?? Infinity)
    )
}

/** How a row writes an operand position: its one mode, a register list, or `<ea>`. */
function positionSymbol(modes: readonly string[], branch: boolean): string {
    if (modes.length === 1) {
        const [mode] = modes
        if (mode === 'Ea/<label>' && branch) return 'label'
        return M68K_MODE_SYMBOLS[mode] ?? mode
    }
    if (modes.includes('<register list>') && modes.every((mode) => LIST_MODES.has(mode))) {
        return '<register list>'
    }
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

function formInput(
    name: string,
    entry: string | undefined,
    form: M68KInstructionForm,
    defaultSize: InstructionDocumentation['defaultSize']
): FormInput {
    const branch = entry !== undefined && BRANCHES.has(entry)
    const parts: InputPart[] = [literal(name)]
    const details: PatternDetail[] = []
    const symbols = form.operands.map((modes) => positionSymbol(modes, branch))
    form.operands.forEach((modes, index) => {
        const symbol = symbols[index]
        parts.push(literal(index === 0 ? ' ' : ', '))
        // Every form is its own row, so the member is the symbol itself.
        parts.push({ symbol, member: symbol, memberText: symbol, memberSymbolic: true })
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
        code: symbols.length > 0 ? `${name} ${symbols.join(', ')}` : name,
        parts,
        tags: m68kFormTags(form),
        facts: sizeFact(form, defaultSize),
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
 * The document of an M68K instruction page: any of the Documentation's names, a family's (`bcc`,
 * `asd`) and its members' (`beq`, `asl`) alike. Undefined for a name with no page.
 */
export function m68kInstructionDocument(name: string): InstructionDocument | undefined {
    const instruction = M68KUncompoundedInstructions.get(name)
    if (!instruction) return undefined
    const entry = m68kEntryName(name)
    // A member's own forms where s68k lists it (`beq`), else its family's (`asd` is no mnemonic),
    // as the instruction page reads them.
    const own = m68kInstructionForms({ name })
    const forms = own.length > 0 ? own : m68kInstructionForms(instruction)

    const result = buildFormPatterns(
        forms.map((form) => formInput(name, entry, form, instruction.defaultSize)),
        { tagExplanations: { privileged: PRIVILEGED_EXPLANATION } }
    )

    // The rows' own symbols, and `#imm` where an opened row lists it, since its range is the
    // instruction's own (`1` to `8` for a shift). The other modes an opened row lists are the
    // Addressing Modes Chapter's, which `<ea>` links to.
    const symbols = new Set<string>()
    let immediate = false
    for (const section of result.sections) {
        for (const group of section.groups) {
            for (const pattern of group.patterns) {
                for (const part of pattern.parts) if (part.symbol) symbols.add(part.text)
                for (const detail of pattern.details) immediate ||= detail.values.includes('#imm')
            }
        }
    }
    if (immediate) symbols.add('#imm')
    const listed = [...symbols]
    const operands: OperandSymbol[] = listed.flatMap((symbol) => {
        const line = m68kOperandLine(symbol, entry)
        return line ? [{ symbol, ...line }] : []
    })

    const summary = m68kSummary(name)
    return {
        name,
        longName: m68kLongName(name),
        summary,
        category: m68kInstructionCategory(name),
        tags: result.tags,
        headerFacts: result.headerFacts,
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
