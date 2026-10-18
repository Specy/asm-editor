import {
    categoryLabel,
    tagLabel,
    type InstructionCategory,
    type InstructionTag
} from './categories'
import { FLAG_MARK_GLYPHS, patternText, type InstructionDocument } from './document'

/**
 * The line every language's hover shows under an instruction's name: its **Instruction category**,
 * then the **Instruction tags** all of its forms have, as `*Arithmetic · Pseudo-instruction*`.
 * `more` carries what a language already wrote on its own italic line, which follows (x86's CPU
 * level). Empty when there is nothing to say, so a caller can filter it out.
 */
export function instructionHoverLine(
    category: InstructionCategory | undefined,
    tags: readonly InstructionTag[],
    ...more: string[]
): string {
    const parts = [
        ...(category ? [categoryLabel(category)] : []),
        ...tags.map(tagLabel),
        ...more.filter(Boolean)
    ]
    return parts.length > 0 ? `*${parts.join(' · ')}*` : ''
}

/**
 * The tags of the exact form a line uses, for a language that can tell which one it is (only the
 * Z80 for now). Empty when the form has none.
 */
export function formHoverLine(tags: readonly InstructionTag[]): string {
    return tags.length > 0 ? `*This form: ${tags.map(tagLabel).join(' · ')}*` : ''
}

/** How many Form patterns a hover lists before it points at the page. */
export const HOVER_ROWS = 6

/**
 * An instruction's hover from its shared document, block by block: the name and long name with the
 * italic line, the summary, the first Form patterns with their facts, and the page
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), decision 22). A row in a
 * tagged section says its tags, since a hover has no section headings.
 */
export function documentHover(
    document: InstructionDocument,
    options: { word?: string; href?: string; extra?: string[] } = {}
): string[] {
    const name = options.word ?? document.name
    const heading =
        document.longName.toLowerCase() === document.name.toLowerCase()
            ? `**${name}**`
            : `**${name}** ${document.longName}`
    const kind = instructionHoverLine(
        document.category,
        document.tags,
        ...document.headerFacts,
        ...(options.extra ?? [])
    )
    const rows = document.sections.flatMap((section) =>
        section.groups.flatMap((group) => group.patterns.map((pattern) => ({ section, pattern })))
    )
    const lines = rows.slice(0, HOVER_ROWS).map(({ section, pattern }) => {
        const chips = pattern.chips.map((chip) => chip.label).join(', ')
        const notes = [...(chips ? [chips] : []), ...pattern.facts, ...section.tags.map(tagLabel)]
        const code = `\`${patternText(pattern)}\``
        return notes.length > 0 ? `${code} · ${notes.join(' · ')}` : code
    })
    const hidden = rows.length - lines.length
    if (hidden > 0) lines.push(`… ${hidden} more on its page`)
    return [
        kind ? `${heading}\n\n${kind}` : heading,
        document.summary,
        flagsLine(document),
        lines.join('  \n'),
        ...(options.href ? [`[Documentation](${options.href})`] : [])
    ].filter(Boolean)
}

/** The flags strip as one line, `Flags: CF ● · ZF ● · OF –`; empty without one. */
function flagsLine(document: InstructionDocument): string {
    const flags = document.flags
    if (!flags?.marks) return ''
    const marks = flags.order.map(
        (flag) => `${flag} ${FLAG_MARK_GLYPHS[flags.marks?.[flag]?.kind ?? 'unchanged']}`
    )
    return `Flags: ${marks.join(' · ')}${flags.varies ? ' (most forms)' : ''}`
}
