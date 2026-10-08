import {
    compilationStatus,
    fileFingerprint,
    type CompilationRecord,
    type CompilationSourceMap
} from '$lib/sourceCompilation/records'
import type { ProjectFile, ProjectFiles } from '$lib/projectFiles'
import { isEnvironmentHeaderPath } from '$lib/sourceRuntime/environmentLibrary'
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
            fileFingerprint(assembly.displayedFile) !== map.outputFingerprint
        )
            continue
        //`<sim.h>` is the editor's, uploaded with the compilation and never a record's input, and
        //what is shown of it is the text this session uploaded
        if (isEnvironmentHeaderPath(source.displayedPath)) {
            if (source.displayedFile) return { source, assembly, map }
            continue
        }
        if (
            !record.inputs[source.displayedPath] ||
            fileFingerprint(source.displayedFile) !== record.inputs[source.displayedPath]
        )
            continue
        return { source, assembly, map }
    }
    return undefined
}
