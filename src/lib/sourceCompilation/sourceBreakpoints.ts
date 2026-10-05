import type { SourceBreakpoint } from '$lib/languages/commonLanguageFeatures.svelte'
import type { AvailableLanguages } from '$lib/Project.svelte'
import type { ProjectFiles } from '$lib/projectFiles'
import {
    compilationStatus,
    editorFileLanguage,
    fileFingerprint,
    type CompilationRecord,
    type CompilationSourceMap,
    type SourceLocation
} from './records'

/** A Source map whose Generated assembly and inputs are exactly the Files given to it. */
export type CurrentSourceMap = { outputPath: string; map: CompilationSourceMap }

/**
 * The Source maps that describe these Files: their Generated assembly and every input are unchanged
 * since Source compilation. A Breakpoint expands only through these, so a stale map never places
 * one on a line that no longer means what it did.
 */
export function currentSourceMaps(
    maps: Readonly<Record<string, CompilationSourceMap>>,
    records: readonly CompilationRecord[],
    files: ProjectFiles,
    target: AvailableLanguages
): CurrentSourceMap[] {
    return records.flatMap((record) => {
        const map = Object.prototype.hasOwnProperty.call(maps, record.outputPath)
            ? maps[record.outputPath]
            : undefined
        if (!map) return []
        const status = compilationStatus(record, files, target)
        if (
            status.stale ||
            status.edited ||
            fileFingerprint(files[record.outputPath]) !== map.outputFingerprint
        )
            return []
        return [{ outputPath: record.outputPath, map }]
    })
}

/**
 * The assembly lines where a source line is entered: the first instruction of each block of
 * Generated assembly mapped to it, in order. A block ends at an instruction mapped to another source
 * location; directives and labels map to nothing and do not end it, since compilers interleave CFI
 * and `.loc` directives with a single line's instructions.
 */
export function blockEntryLines(map: CompilationSourceMap, location: SourceLocation): number[] {
    const entries: number[] = []
    let inBlock = false
    for (let line = 0; line < map.lines.length; line++) {
        const mapped = map.lines[line]
        if (!mapped) continue
        const matches = mapped.path === location.path && mapped.line === location.line
        if (matches && !inBlock) entries.push(line)
        inBlock = matches
    }
    return entries
}

/** Whether a Breakpoint is on a higher-level source File rather than on the Target's assembly. */
export function isSourceBreakpoint(breakpoint: SourceBreakpoint, target: AvailableLanguages) {
    return editorFileLanguage(breakpoint.file, target) !== target
}

/**
 * The assembly Breakpoints that source Breakpoints stand for, one per block entry of each mapped
 * line, without duplicates. Breakpoints already on assembly are not included.
 */
export function mappedBreakpoints(
    breakpoints: readonly SourceBreakpoint[],
    maps: readonly CurrentSourceMap[],
    target: AvailableLanguages
): SourceBreakpoint[] {
    const seen = new Set<string>()
    const result: SourceBreakpoint[] = []
    for (const breakpoint of breakpoints) {
        if (!isSourceBreakpoint(breakpoint, target)) continue
        for (const { outputPath, map } of maps) {
            for (const line of blockEntryLines(map, {
                path: breakpoint.file,
                line: breakpoint.line
            })) {
                const key = `${line}:${outputPath}`
                if (seen.has(key)) continue
                seen.add(key)
                result.push({ file: outputPath, line })
            }
        }
    }
    return result
}

/**
 * The Breakpoints a Core runs with: those on assembly as they are, and those on source Files
 * replaced by the assembly lines they stand for. A Core knows nothing of source Files.
 */
export function coreBreakpoints(
    breakpoints: readonly SourceBreakpoint[],
    maps: readonly CurrentSourceMap[],
    target: AvailableLanguages
): SourceBreakpoint[] {
    const assembly = breakpoints.filter((breakpoint) => !isSourceBreakpoint(breakpoint, target))
    const keys = new Set(assembly.map(({ file, line }) => `${line}:${file}`))
    return [
        ...assembly,
        ...mappedBreakpoints(breakpoints, maps, target).filter(
            ({ file, line }) => !keys.has(`${line}:${file}`)
        )
    ]
}
