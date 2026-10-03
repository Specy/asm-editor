import type { ColoredLineRange, EditorLineColoring } from '$lib/monaco/lineColoring'
import type { CompilationSourceMap, SourceLocation } from './records'

export type SourceMapColoring = {
    assembly: EditorLineColoring
    source: ReadonlyMap<string, EditorLineColoring>
}

const GOLDEN_ANGLE = 180 * (3 - Math.sqrt(5))

/** Stable per original File/line, independent of compiler order or optimization. No fixed palette. */
function sourceColor({ path, line }: SourceLocation) {
    let hash = 2166136261
    for (let index = 0; index < path.length; index++) {
        hash = Math.imul(hash ^ path.charCodeAt(index), 16777619)
    }
    const offset = ((hash >>> 0) / 2 ** 32) * 360
    const hue = (offset + line * GOLDEN_ANGLE) % 360
    return `hsl(${hue.toFixed(6)} 65% 62%)`
}

/** One color per mapped source line; disjoint assembly blocks retain that same color. */
export function colorSourceMap(map: CompilationSourceMap): SourceMapColoring {
    const colors: string[] = []
    const assembly: ColoredLineRange[] = []
    const sourceLines = new Map<string, Map<number, number>>()
    for (let line = 0; line < map.lines.length; line++) {
        const location = map.lines[line]
        if (!location) continue
        let lines = sourceLines.get(location.path)
        if (!lines) {
            lines = new Map()
            sourceLines.set(location.path, lines)
        }
        let colorIndex = lines.get(location.line)
        if (colorIndex === undefined) {
            colorIndex = colors.length
            colors.push(sourceColor(location))
            lines.set(location.line, colorIndex)
        }
        const previous = assembly[assembly.length - 1]
        if (previous?.colorIndex === colorIndex && previous.endLine === line - 1) {
            previous.endLine = line
        } else {
            assembly.push({ startLine: line, endLine: line, colorIndex })
        }
    }
    return {
        assembly: { colors, ranges: assembly },
        source: new Map(
            [...sourceLines].map(([path, lines]) => [
                path,
                {
                    colors,
                    ranges: [...lines]
                        .sort(([a], [b]) => a - b)
                        .map(([line, colorIndex]) => ({
                            startLine: line,
                            endLine: line,
                            colorIndex
                        }))
                }
            ])
        )
    }
}
