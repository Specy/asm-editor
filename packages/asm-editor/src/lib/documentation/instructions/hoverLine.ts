import { tagLabel, type InstructionTag } from './categories'
import {
    FLAG_MARK_GLYPHS,
    FLAG_MARK_MEANINGS,
    patternText,
    type FlagMarkKind,
    type InstructionDocument
} from './document'

/**
 * The line every language's hover shows under an instruction's name: the **Instruction tags** all
 * of its forms have, as `*Privileged · Pseudo-instruction*`. `more` carries what a language
 * already wrote on its own italic line, which follows (x86's CPU level). It names no **Instruction
 * category**, which the Documentation groups by and a hover, a reminder at the line, has no use
 * for (the owner's call, 2026-10-30). Empty when there is nothing to say, so a caller can filter
 * it out.
 */
export function instructionHoverLine(tags: readonly InstructionTag[], ...more: string[]): string {
    const parts = [...tags.map(tagLabel), ...more.filter(Boolean)]
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
 * Markdown whose links into the Documentation, `/documentation/mips/instruction/add`, are written
 * with this page's origin, as a hover's must be: Monaco renders a link without a scheme as plain
 * text. The editor's link opener (`openDocumentationLink`) takes them to a Workbench's
 * Documentation panel. Left as paths where there is no page, as on the server.
 */
export function absoluteDocumentationLinks(markdown: string): string {
    const origin = globalThis.location?.origin
    if (!origin) return markdown
    return markdown.replace(/\]\((\/documentation\/[^)\s]*)\)/g, `](${origin}$1)`)
}

/**
 * An instruction's hover from its shared document, block by block: the name and long name with the
 * italic line, the summary, the flags and the first Form patterns, each a table, and the page
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), decision 22). A row in a
 * tagged section says its tags, since a hover has no section headings. Its links into the
 * Documentation are absolute, so the editor shows them as links.
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
        document.tags,
        ...document.headerFacts,
        ...(options.extra ?? [])
    )
    return [
        kind ? `${heading}\n\n${kind}` : heading,
        document.summary,
        flagsTable(document),
        formsTable(document),
        [
            ...(options.href ? [`[Documentation](${options.href})`] : []),
            ...(document.reference
                ? [`[${document.reference.label}](${document.reference.href})`]
                : [])
        ].join(' · ')
    ]
        .filter(Boolean)
        .map(absoluteDocumentationLinks)
}

/** A row of a Markdown table, whose cells cannot hold its column separator unescaped. */
function tableRow(cells: string[]): string {
    return `| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`
}

/**
 * The flags strip as a table, each flag over its mark, and under it what the marks it uses mean:
 * `● set from the result · – not changed`; one line for an instruction that changes none, whose
 * table would be a row of dashes. Empty without a strip.
 */
function flagsTable(document: InstructionDocument): string {
    const flags = document.flags
    if (!flags?.marks) return ''
    const kinds = flags.order.map((flag): FlagMarkKind => flags.marks?.[flag]?.kind ?? 'unchanged')
    if (!flags.varies && kinds.every((kind) => kind === 'unchanged'))
        return '*Leaves every flag unchanged*'
    const legend = [...new Set(kinds)]
        .map((kind) => `${FLAG_MARK_GLYPHS[kind]} ${FLAG_MARK_MEANINGS[kind]}`)
        .join(' · ')
    return [
        tableRow(flags.order),
        tableRow(flags.order.map(() => ':-:')),
        tableRow(kinds.map((kind) => FLAG_MARK_GLYPHS[kind])),
        '',
        `*${flags.varies ? 'Most forms. ' : ''}${legend}*`
    ].join('\n')
}

/**
 * The first Form patterns as a table: each row's syntax, its sizes where a language gives them as
 * chips (x86), and what else it says, its facts and its section's tags; then how many more its
 * page lists. A list of the syntax alone when no row says anything more.
 */
function formsTable(document: InstructionDocument): string {
    const rows = document.sections.flatMap((section) =>
        section.groups.flatMap((group) => group.patterns.map((pattern) => ({ section, pattern })))
    )
    const shown = rows.slice(0, HOVER_ROWS).map(({ section, pattern }) => ({
        code: `\`${patternText(pattern)}\``,
        sizes: pattern.chips.map((chip) => chip.label).join(', '),
        details: [...pattern.facts, ...section.tags.map(tagLabel)].join(' · ')
    }))
    const hidden = rows.length - shown.length
    const more = hidden > 0 ? [`… ${hidden} more on its page`] : []
    const withSizes = shown.some((row) => row.sizes)
    const withDetails = shown.some((row) => row.details)
    if (!withSizes && !withDetails) return [...shown.map((row) => row.code), ...more].join('  \n')
    const columns = (row: { code: string; sizes: string; details: string }) => [
        row.code,
        ...(withSizes ? [row.sizes] : []),
        ...(withDetails ? [row.details] : [])
    ]
    const header = ['Form', ...(withSizes ? ['Sizes'] : []), ...(withDetails ? ['Details'] : [])]
    return [
        tableRow(header),
        tableRow(header.map(() => '---')),
        ...shown.map((row) => tableRow(columns(row))),
        ...(more.length > 0 ? ['', ...more] : [])
    ].join('\n')
}
