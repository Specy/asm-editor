import type { DocumentationLanguage } from '#lib/search/scope.ts'

/**
 * The **Instruction categories** and **Instruction tags** every language draws from
 * ([the design record](../../../../../../docs/design/instruction-categories.md),
 * [ADR 0051](../../../../../../docs/adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md)).
 *
 * A category is the one kind of work a mnemonic does, chosen by the editor in each language's
 * `categories.ts`; a tag is a fact about one of its forms, read from the Core that assembles it.
 * The list's order is the order the Instructions Chapter and the sidebar show the groups in.
 */
export const INSTRUCTION_CATEGORIES = [
    {
        id: 'data-movement',
        label: 'Data movement',
        usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80']
    },
    { id: 'load-and-store', label: 'Load and store', usedBy: ['m68k', 'mips', 'risc-v'] },
    { id: 'stack', label: 'Stack', usedBy: ['m68k', 'x86', 'z80'] },
    { id: 'arithmetic', label: 'Arithmetic', usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80'] },
    { id: 'logic', label: 'Logic', usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80'] },
    {
        id: 'shifts-and-rotates',
        label: 'Shifts and rotates',
        usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80']
    },
    { id: 'comparison', label: 'Comparison', usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80'] },
    {
        id: 'control-flow',
        label: 'Control flow',
        usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80']
    },
    { id: 'floating-point', label: 'Floating point', usedBy: ['mips', 'risc-v'] },
    { id: 'atomic', label: 'Atomic', usedBy: ['m68k', 'mips', 'risc-v', 'x86'] },
    { id: 'block-and-string', label: 'Block and string', usedBy: ['x86', 'z80'] },
    { id: 'input-output', label: 'Input/output', usedBy: ['x86', 'z80'] },
    { id: 'system', label: 'System', usedBy: ['m68k', 'mips', 'risc-v', 'x86', 'z80'] }
] as const satisfies readonly {
    id: string
    label: string
    usedBy: readonly DocumentationLanguage[]
}[]

export type InstructionCategory = (typeof INSTRUCTION_CATEGORIES)[number]['id']

/** A language's mnemonics, each with its one category. */
export type CategoryTable = Readonly<Record<string, InstructionCategory>>

export const INSTRUCTION_TAGS = [
    { id: 'pseudo', label: 'Pseudo-instruction' },
    { id: 'rv64-only', label: 'RV64 only' },
    { id: 'undocumented', label: 'Undocumented' },
    { id: 'privileged', label: 'Privileged' },
    //the first M68K processor that has a form, where it is a later one than the 68000
    { id: '68010', label: '68010' },
    { id: '68020', label: '68020' },
    //the 68020's bit fields, which EASy68K's `opt bit` gives a program for the 68000 or the 68010
    { id: 'opt-bit', label: '68000 with opt bit' }
] as const

export type InstructionTag = (typeof INSTRUCTION_TAGS)[number]['id']

const categoryLabels = new Map<string, string>(INSTRUCTION_CATEGORIES.map((c) => [c.id, c.label]))
const tagLabels = new Map<string, string>(INSTRUCTION_TAGS.map((t) => [t.id, t.label]))

export function categoryLabel(category: InstructionCategory): string {
    return categoryLabels.get(category) ?? category
}

export function tagLabel(tag: InstructionTag): string {
    return tagLabels.get(tag) ?? tag
}

/**
 * The tags every one of a mnemonic's forms has, in the list's order: the ones shown beside its
 * name. A tag only some forms have stays on those forms, so `lw` is never called a
 * pseudo-instruction for its `lw $t1, label` form.
 */
export function mnemonicTags(formTags: readonly (readonly InstructionTag[])[]): InstructionTag[] {
    if (formTags.length === 0) return []
    return INSTRUCTION_TAGS.map((tag) => tag.id).filter((tag) =>
        formTags.every((tags) => tags.includes(tag))
    )
}

/**
 * Items grouped by category in the list's order, keeping their order within each group, so
 * alphabetical entries stay alphabetical under each heading. Empty groups are left out.
 */
export function groupByCategory<T>(
    items: readonly T[],
    categoryOf: (item: T) => InstructionCategory | undefined
): { category: InstructionCategory; items: T[] }[] {
    const groups = new Map<InstructionCategory, T[]>()
    for (const item of items) {
        const category = categoryOf(item)
        if (!category) continue
        const group = groups.get(category)
        if (group) group.push(item)
        else groups.set(category, [item])
    }
    return INSTRUCTION_CATEGORIES.flatMap(({ id }) => {
        const group = groups.get(id)
        return group ? [{ category: id, items: group }] : []
    })
}

/**
 * What is wrong with a language's table: a documented mnemonic without a category, a key that is
 * not a documented mnemonic, or a category the shared list does not give that language. Empty
 * when every documented mnemonic has exactly one category the language uses.
 */
export function categoryProblems(
    table: CategoryTable,
    documented: readonly string[],
    language: DocumentationLanguage
): string[] {
    const problems: string[] = []
    const known = new Set(documented)
    for (const name of documented) {
        if (!Object.hasOwn(table, name)) problems.push(`${name} has no category`)
    }
    for (const [name, category] of Object.entries(table)) {
        if (!known.has(name)) problems.push(`${name} is not a documented mnemonic`)
        const entry = INSTRUCTION_CATEGORIES.find((c) => c.id === category)
        if (!entry) problems.push(`${name} has an unknown category ${category}`)
        else if (!(entry.usedBy as readonly string[]).includes(language)) {
            problems.push(`${name} is ${category}, which ${language} does not use`)
        }
    }
    return problems
}
