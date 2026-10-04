/** Zero-based, inclusive line ranges with indices into an algorithmically generated palette. */
export type ColoredLineRange = {
    startLine: number
    endLine: number
    colorIndex: number
}

export type EditorLineColoring = {
    colors: readonly string[]
    ranges: readonly ColoredLineRange[]
}
