/** The part of a Monaco selection that decides which lines it covers. */
export type LineSelection = {
    startLineNumber: number
    endLineNumber: number
    endColumn: number
}

/**
 * Zero-based lines covered by every editor selection, sorted and unique; a collapsed selection
 * covers its cursor's line. A selection ending at the start of a later line, as whole-line
 * selections do, does not cover that line.
 */
export function selectedLines(selections: readonly LineSelection[]): number[] {
    const lines = new Set<number>()
    for (const selection of selections) {
        const last =
            selection.endLineNumber > selection.startLineNumber && selection.endColumn === 1
                ? selection.endLineNumber - 1
                : selection.endLineNumber
        for (let line = selection.startLineNumber; line <= last; line++) lines.add(line - 1)
    }
    return [...lines].sort((a, b) => a - b)
}
