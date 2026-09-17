import type { SourcePosition, SourceRange } from './sourceModel'

export function zeroBasedLineToMonaco(line: number): number {
    return line + 1
}

export function sourcePositionToMonaco(position: SourcePosition) {
    return { lineNumber: position.line + 1, column: position.column + 1 }
}

export function sourceRangeToMonaco(range: SourceRange) {
    return {
        startLineNumber: range.start.line + 1,
        startColumn: range.start.column + 1,
        endLineNumber: range.end.line + 1,
        endColumn: range.end.column + 1
    }
}
