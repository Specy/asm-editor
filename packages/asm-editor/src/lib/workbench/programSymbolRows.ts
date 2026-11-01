import { addressQuery, symbolAddress } from '#lib/listing/listingSymbols.ts'
import type { LabelDefinition, ProgramLabel, ProgramString } from '#lib/languages/programSymbols.ts'

/**
 * The rows of the Symbols panel for a program the editor built
 * ([workbench.md](../../../../../docs/design/workbench.md), Symbols in every Target): what its
 * filter keeps, what a row's tooltip says, and which label the cursor is under, as
 * [listingSymbols.ts](../listing/listingSymbols.ts) has them for an Executable.
 */

/** The labels whose name, what their row shows, or address holds a filter made by `symbolQuery`. */
export function filterLabels(labels: ProgramLabel[], query: string): ProgramLabel[] {
    if (!query) return labels
    const digits = addressQuery(query)
    const holds = (text: string) => text.toLowerCase().includes(query)
    return labels.filter(
        (label) =>
            holds(label.name) ||
            holds(label.display) ||
            (digits !== undefined && label.address.toString(16).includes(digits))
    )
}

/** The strings whose text, as stored or as escaped, label or address holds a filter. */
export function filterProgramStrings(strings: ProgramString[], query: string): ProgramString[] {
    if (!query) return strings
    const digits = addressQuery(query)
    const holds = (text: string) => text.toLowerCase().includes(query)
    return strings.filter(
        (string) =>
            holds(string.text) ||
            holds(string.escaped) ||
            holds(string.label) ||
            (digits !== undefined && string.address.toString(16).includes(digits))
    )
}

/** Where a label is defined, as a person reads it: its File and 1-based line. */
function definedAt(definition: LabelDefinition | undefined): string {
    return definition
        ? `defined in ${definition.file} at line ${definition.line + 1}`
        : 'not found in the source'
}

/**
 * A label's tooltip: its name, address, with the Target's prefix, and size, then whether it is
 * code or data and where it is defined; a demangled name with its raw name on a line of its own.
 */
export function labelTooltip(label: ProgramLabel, prefix: string): string {
    const size = `${label.size} byte${label.size === 1n ? '' : 's'}`
    const kind = label.kind === 'code' ? 'Code' : 'Data'
    const raw = label.display === label.name ? '' : `\n${label.name}`
    const at = symbolAddress(label.address, prefix)
    return `${label.display} at ${at}, ${size}${raw}\n${kind}, ${definedAt(label.definition)}`
}

/** A string's tooltip: all of its text, its address and label, and where it is defined. */
export function programStringTooltip(string: ProgramString, prefix: string): string {
    const at = symbolAddress(string.address, prefix)
    return `"${string.escaped}" at ${at}\n${string.label}, ${definedAt(string.definition)}`
}

/**
 * The label a line of a File is under: the last the File defines at or above it, of all the
 * program's labels.
 */
export function labelAtLine(
    labels: readonly ProgramLabel[],
    file: string,
    line: number
): ProgramLabel | undefined {
    let found: ProgramLabel | undefined
    for (const label of labels) {
        const at = label.definition
        if (at?.file !== file || at.line > line) continue
        if (!found || at.line > found.definition!.line) found = label
    }
    return found
}
