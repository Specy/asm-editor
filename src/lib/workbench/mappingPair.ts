import {
    compilationStatus,
    fileFingerprint,
    type CompilationRecord,
    type CompilationSourceMap
} from '$lib/sourceCompilation/records'
import type { ProjectFile, ProjectFiles } from '$lib/projectFiles'
import type { AvailableLanguages } from '$lib/Project.svelte'

export type MappingPane = { displayedPath: string; displayedFile: ProjectFile | undefined }

/** Resolve a pair from visible files, in either order, without changing editor layout. */
export function resolveMappingPair<T extends MappingPane>(
    panes: readonly T[],
    maps: Readonly<Record<string, CompilationSourceMap>>,
    records: readonly CompilationRecord[],
    files: ProjectFiles,
    target: AvailableLanguages,
    /** The Source map of a Runtime library member shown in a pane, which no record owns. */
    libraryMap?: (path: string) => CompilationSourceMap | undefined
): { source: T; assembly: T; map: CompilationSourceMap } | undefined {
    if (panes.length !== 2) return undefined
    for (const assembly of panes) {
        const source = panes.find((pane) => pane !== assembly)!
        //the library never changes under a Build, so its map is never stale
        const library = libraryMap?.(assembly.displayedPath)
        if (library?.lines.some((location) => location?.path === source.displayedPath))
            return { source, assembly, map: library }
        const map = Object.prototype.hasOwnProperty.call(maps, assembly.displayedPath)
            ? maps[assembly.displayedPath]
            : undefined
        const record = records.find((item) => item.outputPath === assembly.displayedPath)
        if (
            !map ||
            !record ||
            !map.lines.some((location) => location?.path === source.displayedPath)
        )
            continue
        const status = compilationStatus(record, files, target)
        if (
            status.stale ||
            status.edited ||
            fileFingerprint(assembly.displayedFile) !== map.outputFingerprint ||
            !record.inputs[source.displayedPath] ||
            fileFingerprint(source.displayedFile) !== record.inputs[source.displayedPath]
        )
            continue
        return { source, assembly, map }
    }
    return undefined
}
