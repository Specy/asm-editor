import type { DecompiledLine, DecompiledToken } from '@specy/decompiler'
import {
    functionStartingAt,
    instructionAddressAt,
    lineOfAddress,
    type Listing,
    type ListingFunction,
    type ListingLabel
} from '#lib/listing/listing.ts'
import { ListingIndex } from '#lib/listing/listingNavigation.ts'
import type { SourceLocation } from '#lib/sourceCompilation/records.ts'
import { blockEntries } from '#lib/sourceCompilation/sourceBreakpoints.ts'
import { sourceColor, type SourceMapColoring } from '#lib/sourceCompilation/sourceColoring.ts'
import type { ColoredLineRange } from '#lib/monaco/lineColoring.ts'

/**
 * How one function's Pseudocode and the Listing beside it are linked line by line
 * ([file-views.md](../../../../../docs/design/file-views.md), decision 5; the plan's decision 14):
 * through the instruction addresses the decompiler gives each of its lines, each found in the
 * Listing by `lineOfAddress`. It covers the function's Listing lines only, so nothing that reads
 * it walks a whole Listing (libc's has 473,000 lines). Lines are 0-based lines of the Pseudocode
 * document, whose header comes before the decompiler's first line, and of the Listing. A line of
 * comments alone, a person's or the decompiler's warning, is no code: its words carry the address
 * the comment is at, but it maps to nothing, so the program counter, a Breakpoint and the pairing
 * land on the statement below it.
 */
export type PseudocodeMap = {
    /** The document line of the decompiler's first line. */
    firstLine: number
    /**
     * The Listing lines the map covers, end exclusive: the function's, and any other a line of
     * its Pseudocode maps to.
     */
    listingStart: number
    listingEnd: number
    /** By document line, the link-time addresses of its instructions, ascending. */
    addresses: readonly (readonly number[])[]
    /** By document line, the Listing lines of those instructions, ascending, each once. */
    listingLines: readonly (readonly number[])[]
    /** By Listing line from `listingStart`, the document lines holding its instruction, ascending. */
    pseudocodeLines: readonly (readonly number[])[]
}

const NONE: readonly number[] = []

/** The map of a function's Pseudocode, its decompiled `lines` starting at document line `firstLine`. */
export function pseudocodeMap(
    listing: Listing,
    fn: ListingFunction,
    lines: readonly DecompiledLine[],
    firstLine: number
): PseudocodeMap {
    const addresses: (readonly number[])[] = Array.from({ length: firstLine }, () => NONE)
    const listingLines: (readonly number[])[] = [...addresses]
    let start = fn.line
    let end = fn.endLine
    for (const line of lines) {
        const code = isCodeLine(line)
        addresses.push(code && line.addresses.length ? [...line.addresses] : NONE)
        const found: number[] = []
        for (const address of code ? line.addresses : NONE) {
            const at = lineOfAddress(listing, address)
            if (at < 0 || found.includes(at)) continue
            found.push(at)
            start = Math.min(start, at)
            end = Math.max(end, at + 1)
        }
        listingLines.push(found.length ? found.sort((a, b) => a - b) : NONE)
    }
    const pseudocodeLines: number[][] = Array.from({ length: Math.max(0, end - start) }, () => [])
    listingLines.forEach((mapped, row) => {
        for (const line of mapped) pseudocodeLines[line - start].push(row)
    })
    return {
        firstLine,
        listingStart: start,
        listingEnd: end,
        addresses,
        listingLines,
        pseudocodeLines: pseudocodeLines.map((rows) => (rows.length ? rows : NONE))
    }
}

/** Whether a decompiled line holds code: it is not a comment's line, all of whose words are. */
function isCodeLine(line: DecompiledLine): boolean {
    return !line.tokens.length || line.tokens.some((token) => token.kind !== 'comment')
}

/** The document lines holding the instruction on a Listing line, none outside the map's range. */
export function pseudocodeLinesOf(map: PseudocodeMap, listingLine: number): readonly number[] {
    return listingLine >= map.listingStart && listingLine < map.listingEnd
        ? map.pseudocodeLines[listingLine - map.listingStart]
        : NONE
}

/**
 * The first document line whose instructions hold a link-time address, as the program counter's
 * line is found; -1 when none does, as for an instruction the decompiler folded into another's.
 */
export function pseudocodeLineOfAddress(
    map: PseudocodeMap,
    listing: Listing,
    address: number
): number {
    return pseudocodeLinesOf(map, lineOfAddress(listing, address))[0] ?? -1
}

/**
 * Where a Breakpoint set on a Pseudocode line goes ([file-views.md](../../../../../docs/design/file-views.md),
 * decision 10): the link-time address of the first instruction of each block of the function's
 * Listing lines mapped to it, by the rule a C File's lines follow (`blockEntries`). A Listing line
 * on several Pseudocode lines belongs to each of them; one on none neither starts nor ends a block.
 */
export function pseudocodeBreakpointAddresses(
    map: PseudocodeMap,
    listing: Listing,
    line: number
): number[] {
    if (!map.listingLines[line]?.length) return []
    const entries = blockEntries(map.listingStart, map.listingEnd, (listingLine) => {
        const rows = map.pseudocodeLines[listingLine - map.listingStart]
        return rows.length ? rows.includes(line) : undefined
    })
    return entries.flatMap((entry) => {
        const address = instructionAddressAt(listing, entry)
        return address === undefined ? [] : [address]
    })
}

/**
 * The Breakpoint addresses, of those given, on a Pseudocode line's instructions: what marks the
 * line, and what a click on its mark removes, wherever they were set.
 */
export function pseudocodeBreakpointsOn(
    map: PseudocodeMap,
    listing: Listing,
    line: number,
    addresses: readonly number[]
): number[] {
    const lines = map.listingLines[line] ?? NONE
    if (!lines.length) return []
    return addresses.filter((address) => lines.includes(lineOfAddress(listing, address)))
}

/** The Pseudocode lines whose instructions carry a Breakpoint at one of these addresses, ascending. */
export function pseudocodeBreakpointLines(
    map: PseudocodeMap,
    listing: Listing,
    addresses: readonly number[]
): number[] {
    const rows = new Set<number>()
    for (const address of addresses)
        for (const row of pseudocodeLinesOf(map, lineOfAddress(listing, address))) rows.add(row)
    return [...rows].sort((a, b) => a - b)
}

/** The Pseudocode lines behind Listing lines, deduplicated, as the pairing's Source locations. */
export function pseudocodeLocationsOf(
    map: PseudocodeMap,
    path: string,
    listingLines: readonly number[]
): SourceLocation[] {
    const rows = new Set<number>()
    for (const line of listingLines) for (const row of pseudocodeLinesOf(map, line)) rows.add(row)
    return [...rows].map((line) => ({ path, line }))
}

/** Every Listing line, ascending, of the instructions of the given Pseudocode lines. */
export function listingLinesOfLocations(
    map: PseudocodeMap,
    path: string,
    locations: readonly SourceLocation[]
): number[] {
    const lines = new Set<number>()
    for (const location of locations)
        if (location.path === path)
            for (const line of map.listingLines[location.line] ?? NONE) lines.add(line)
    return [...lines].sort((a, b) => a - b)
}

/**
 * The pair's colours, as a C File's Source map colours its pair: one for each Pseudocode line with
 * instructions, which the Listing lines of those instructions share; a Listing line on several
 * Pseudocode lines takes the first's. `path` names the Pseudocode's File, which the colours of its
 * lines are kept under.
 */
export function colorPseudocodeMap(map: PseudocodeMap, path: string): SourceMapColoring {
    const colors: string[] = []
    const rows = new Map<number, number>()
    const source: ColoredLineRange[] = []
    map.listingLines.forEach((mapped, line) => {
        if (!mapped.length) return
        const colorIndex = colors.length
        colors.push(sourceColor({ path, line }))
        rows.set(line, colorIndex)
        source.push({ startLine: line, endLine: line, colorIndex })
    })
    const assembly: ColoredLineRange[] = []
    for (let line = map.listingStart; line < map.listingEnd; line++) {
        const first = map.pseudocodeLines[line - map.listingStart][0]
        if (first === undefined) continue
        const colorIndex = rows.get(first)!
        const previous = assembly[assembly.length - 1]
        if (previous?.colorIndex === colorIndex && previous.endLine === line - 1)
            previous.endLine = line
        else assembly.push({ startLine: line, endLine: line, colorIndex })
    }
    return {
        assembly: { colors, ranges: assembly },
        source: new Map([[path, { colors, ranges: source }]]),
        indices: new Map([[path, rows]])
    }
}

/**
 * The function a Pseudocode shows when nothing chose one: `main`, else the entry point's, else
 * the Listing's first.
 */
export function defaultPseudocodeFunction(listing: Listing): ListingFunction | undefined {
    return (
        (listing.main === undefined ? undefined : functionStartingAt(listing, listing.main)) ??
        functionStartingAt(listing, listing.entry) ??
        listing.functions[0]
    )
}

/**
 * The name under a 0-based column of a line of the Pseudocode document that refers to something
 * (a called function, a global, a string), with its link-time `target`; none for a name without
 * one, such as Ghidra's own operations (`syscall`, `cpuid`), or any other token.
 */
export function pseudocodeTargetAt(
    lines: readonly DecompiledLine[],
    firstLine: number,
    line: number,
    column: number
): (DecompiledToken & { target: number }) | undefined {
    //a comment's words are text, whatever they say (annotations-and-search.md, decision 11)
    const named = (lines[line - firstLine]?.tokens ?? []).filter(
        (token): token is DecompiledToken & { target: number } =>
            token.target !== undefined && token.kind !== 'comment'
    )
    //a position just after a name, where a click past its last letter puts the cursor, is on it
    return (
        named.find((token) => token.start <= column && column < token.end) ??
        named.find((token) => token.end === column)
    )
}

/**
 * The name of one of the function's local variables or parameters under a 0-based column of a
 * line of the Pseudocode document, with its id in the function's `variables`
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 15): what Rename… renames. A position just after it is on it, as for {@link pseudocodeTargetAt}.
 */
export function pseudocodeVariableAt(
    lines: readonly DecompiledLine[],
    firstLine: number,
    line: number,
    column: number
): (DecompiledToken & { variable: string }) | undefined {
    const named = (lines[line - firstLine]?.tokens ?? []).filter(
        (token): token is DecompiledToken & { variable: string } => token.variable !== undefined
    )
    return (
        named.find((token) => token.start <= column && column < token.end) ??
        named.find((token) => token.end === column)
    )
}

/**
 * The document line of a function's declaration (`undefined8 main(void)`): the first line naming
 * the function itself, at its link-time `address`, below any header comments; -1 for none.
 */
export function pseudocodeDeclarationLine(
    lines: readonly DecompiledLine[],
    firstLine: number,
    address: number
): number {
    const at = lines.findIndex((line) =>
        line.tokens.some((token) => token.kind === 'function' && token.target === address)
    )
    return at < 0 ? -1 : at + firstLine
}

/**
 * What a Comment… on a line of a function's Pseudocode edits
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions
 * 13 and 14), at link-time addresses: on the declaration line, or a line of the function comment
 * above it, the function comment; on a person's comment, that comment, at its address (one Ghidra
 * could not place among them); on a statement, the comment at the line's first mapped instruction,
 * the address a Breakpoint set there takes first. Undefined on any other line: braces,
 * declarations, the decompiler's warnings.
 */
export type PseudocodeCommentPlace =
    | { kind: 'function'; address: number }
    | { kind: 'line'; address: number }

export function pseudocodeCommentPlace(
    map: PseudocodeMap,
    listing: Listing,
    lines: readonly DecompiledLine[],
    fn: Pick<ListingFunction, 'address'>,
    line: number
): PseudocodeCommentPlace | undefined {
    const declaration = pseudocodeDeclarationLine(lines, map.firstLine, fn.address)
    if (line === declaration) return { kind: 'function', address: fn.address }
    const decompiled = lines[line - map.firstLine]
    if (!decompiled) return undefined
    const comment = decompiled.tokens.find((token) => token.kind === 'comment')
    if (comment && !isCodeLine(decompiled)) {
        if (comment.comment !== 'user' || comment.address === undefined) return undefined
        //above the declaration, the function comment comes before Ghidra's heading of the
        //comments it could not place, which are line comments
        const heading = lines.findIndex((candidate) =>
            candidate.tokens.some((token) => token.comment === 'warning')
        )
        const header = declaration >= 0 && line < declaration
        const beforeHeading = heading < 0 || line - map.firstLine < heading
        return header && beforeHeading && comment.address === fn.address
            ? { kind: 'function', address: fn.address }
            : { kind: 'line', address: comment.address }
    }
    const [address] = pseudocodeBreakpointAddresses(map, listing, line)
    return address === undefined ? undefined : { kind: 'line', address }
}

/**
 * The token under a 0-based column of a line of the Pseudocode document, of any kind, for a
 * hover: a constant, a type, a variable.
 */
export function pseudocodeTokenAt(
    lines: readonly DecompiledLine[],
    firstLine: number,
    line: number,
    column: number
): DecompiledToken | undefined {
    return lines[line - firstLine]?.tokens.find(
        (token) => token.start <= column && column < token.end
    )
}

/**
 * The Listing line a target is shown on: a function's label, else the label operands use for
 * the address (the last there, after its aliases), else the line holding it; -1 for none.
 */
export function listingLineOfTarget(listing: Listing, target: number): number {
    return (
        functionStartingAt(listing, target)?.line ??
        ListingIndex.of(listing).operandLabel(target)?.line ??
        lineOfAddress(listing, target)
    )
}

/**
 * The label the Listing gives a target, for a hover: its function's, else the one operands use
 * for the address (the last there). Its `fullName` is the Listing's name for it, its `demangled`
 * the forms of a C++ name.
 */
export function listingLabelOfTarget(listing: Listing, target: number): ListingLabel | undefined {
    const fn = functionStartingAt(listing, target)
    const index = ListingIndex.of(listing)
    return fn ? index.label(fn.name, fn.line) : index.operandLabel(target)
}
