import type { BuildSources } from '#lib/projectFiles.ts'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectFileAnalysisStatus
} from '../protocol'

/**
 * Why the sources cannot be checked, which is why a Build refuses them too: their resolution
 * failure, such as a Project with no Program, or an Entry file that is missing, as a Program's is
 * after its File goes by other means than the host
 * ([programs.md](../../../../../../docs/design/programs.md), decision 7). Undefined when they can be.
 */
export function unresolvedSources(sources: BuildSources): string | undefined {
    if (sources.assemblyError) return sources.assemblyError
    if (!Object.hasOwn(sources.files, sources.entry))
        return `Entry file not found: ${sources.entry}`
    return undefined
}

/**
 * The sources' resolution failure as the one error, on the Entry's first line, and nothing checked:
 * a Core never sees sources it would only report a missing Entry for, nor a failure the worker logs.
 */
export function unresolvedSnapshot(
    sources: BuildSources,
    message: string,
    sessionId: string,
    revision: number,
    target: ProjectAnalysisTarget,
    source: string
): ProjectAnalysisSnapshot {
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] = file.encoding === 'plain' ? 'unknown' : 'binary'
    }
    return {
        sessionId,
        revision,
        target,
        diagnostics: [
            {
                severity: 'error',
                source,
                location: {
                    path: sources.entry,
                    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } }
                },
                message
            }
        ],
        symbols: [],
        occurrences: [],
        fileStatus
    }
}
