import type { CompilationSourceMap, SourceLocation } from './records'

/**
 * Source locations a person selected through either pane of a mapped pair. A click selects one
 * line and a range or multi-cursor selection several; every consumer treats them as one set.
 */
export type MappingSelection = readonly SourceLocation[]

function locationKey({ path, line }: SourceLocation) {
    return `${line}:${path}`
}

/** Source locations behind the given assembly lines, deduplicated; unmapped lines add nothing. */
export function sourceLocationsOf(
    map: CompilationSourceMap,
    assemblyLines: readonly number[]
): SourceLocation[] {
    const seen = new Set<string>()
    return assemblyLines.flatMap((line) => {
        const location = map.lines[line]
        if (!location) return []
        const key = locationKey(location)
        if (seen.has(key)) return []
        seen.add(key)
        return [location]
    })
}

/** Every assembly line, in order, mapped to any of the given Source locations. */
export function assemblyLinesOf(
    map: CompilationSourceMap,
    locations: readonly SourceLocation[]
): number[] {
    const keys = new Set(locations.map(locationKey))
    return map.lines.flatMap((location, line) =>
        location && keys.has(locationKey(location)) ? [line] : []
    )
}

export function sameLocations(
    a: readonly SourceLocation[] | undefined,
    b: readonly SourceLocation[] | undefined
) {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    return a.every((location, index) => locationKey(location) === locationKey(b[index]))
}
