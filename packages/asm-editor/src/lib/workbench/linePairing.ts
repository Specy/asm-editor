import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { PseudocodeDocument } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import {
    colorPseudocodeMap,
    listingLinesOfLocations,
    pseudocodeLinesOf,
    pseudocodeLocationsOf,
    type PseudocodeMap
} from '#lib/pseudocode/pseudocodeMap.ts'
import type { FileView } from '#lib/fileViews.ts'
import { assemblyLinesOf, sourceLocationsOf } from '#lib/sourceCompilation/mappingSelection.ts'
import type { CompilationSourceMap, SourceLocation } from '#lib/sourceCompilation/records.ts'
import { colorSourceMap, type SourceMapColoring } from '#lib/sourceCompilation/sourceColoring.ts'

/**
 * Two panes whose lines are linked, as the Workbench draws and selects them: a C File and its
 * Generated assembly through a Source map, or a function's Pseudocode and the Listing beside it
 * through the decompiler's addresses ([file-views.md](../../../../../docs/design/file-views.md),
 * decision 5). The source side's lines are what a selection names; the assembly's are found from
 * them. Every lookup of a Pseudocode pair stays inside its function's lines.
 */
export type LinePairing<T> = {
    /** A C File, or a Pseudocode. */
    source: T
    /** Generated assembly, or the Listing. */
    assembly: T
    /** What the pairing reads its links from, which changes when they do. */
    map: CompilationSourceMap | PseudocodeMap
    coloring: SourceMapColoring
    /** The source lines behind assembly lines, deduplicated; unmapped lines add nothing. */
    sourceLocationsOf(lines: readonly number[]): SourceLocation[]
    /** The assembly lines, ascending, of any of the given source lines. */
    assemblyLinesOf(locations: readonly SourceLocation[]): number[]
    /** The source line of the instruction on an assembly line, if it has one. */
    locationAt(line: number): SourceLocation | undefined
}

/** A C File and its Generated assembly, as `resolveMappingPair` found them. */
export function sourceMapPairing<T>(pair: {
    source: T
    assembly: T
    map: CompilationSourceMap
}): LinePairing<T> {
    const { map } = pair
    return {
        source: pair.source,
        assembly: pair.assembly,
        map,
        coloring: colorSourceMap(map),
        sourceLocationsOf: (lines) => sourceLocationsOf(map, lines),
        assemblyLinesOf: (locations) => assemblyLinesOf(map, locations),
        locationAt: (line) => map.lines[line] ?? undefined
    }
}

export type PseudocodePane = {
    displayedPath: string
    displayedView: FileView
    /** The Listing a pane shows, when its view is the Listing. */
    displayedListing: ListingDocument | undefined
    /** The Listing a Pseudocode pane decompiles from, when its view is the Pseudocode. */
    pseudocodeListing: ListingDocument | undefined
    displayedPseudocode: PseudocodeDocument | undefined
}

/**
 * The Pseudocode and the Listing it pairs with: two panes showing one Executable, one its
 * Pseudocode and the other its Listing, from the same Listing document, once the function is
 * decompiled.
 */
export function resolvePseudocodePair<T extends PseudocodePane>(
    panes: readonly T[]
): { source: T; assembly: T; map: PseudocodeMap } | undefined {
    if (panes.length !== 2) return undefined
    const source = panes.find((pane) => pane.displayedView === 'pseudocode')
    const assembly = panes.find((pane) => pane !== source)
    const map = source?.displayedPseudocode?.map
    if (
        !source ||
        !assembly ||
        !map ||
        assembly.displayedView !== 'listing' ||
        assembly.displayedPath !== source.displayedPath ||
        assembly.displayedListing !== source.pseudocodeListing
    )
        return undefined
    return { source, assembly, map }
}

/** A Pseudocode pair as a pairing; its source locations are lines of the Pseudocode document. */
export function pseudocodePairing<T extends { displayedPath: string }>(pair: {
    source: T
    assembly: T
    map: PseudocodeMap
}): LinePairing<T> {
    const { map } = pair
    const path = pair.source.displayedPath
    return {
        source: pair.source,
        assembly: pair.assembly,
        map,
        coloring: colorPseudocodeMap(map, path),
        sourceLocationsOf: (lines) => pseudocodeLocationsOf(map, path, lines),
        assemblyLinesOf: (locations) => listingLinesOfLocations(map, path, locations),
        locationAt: (line) => {
            const row = pseudocodeLinesOf(map, line)[0]
            return row === undefined ? undefined : { path, line: row }
        }
    }
}
