import { createX86Emulator, type MonacoError } from '@specy/x86'
import type { BuildSources } from '$lib/projectFiles'
import { x86ReachableFiles } from '$lib/languages/X86/x86Project'
import { x86CoreProject } from '$lib/languages/X86/x86StartUnit'
import type { ProjectAnalysisSnapshot, ProjectFileAnalysisStatus } from '../protocol'
import type { LanguageDiagnostic } from '../sourceModel'

export function x86DiagnosticToLanguageDiagnostic(
    error: MonacoError,
    entry: string
): LanguageDiagnostic {
    const source = { path: error.file || entry, line: error.lineIndex }
    const column = Math.max(0, error.column - 1)
    //NASM reports no column at all, so the Core finds the name the message quotes in the line and
    //hands back its extent; a range here is zero based where the Core's `endColumn` is one based
    //and exclusive, and a message that named nothing findable keeps the single character this drew
    const end =
        error.endColumn === undefined ? column + 1 : Math.max(column + 1, error.endColumn - 1)
    return {
        //The Core reports its own severity: a NASM warning is not an error, and painting it red
        //here contradicted the amber squiggle the same finding gets after a Build.
        severity: error.severity ?? 'error',
        source: 'nasm',
        location: {
            path: source.path,
            range: {
                start: { line: source.line, column },
                end: { line: source.line, column: end }
            }
        },
        message: error.message
    }
}

let checker: Awaited<ReturnType<typeof createX86Emulator>> | undefined

/** Runs NASM against the Core's virtual Project filesystem. */
export async function analyzeX86Project(
    sources: BuildSources,
    sessionId: string,
    revision: number
): Promise<ProjectAnalysisSnapshot> {
    //sources the Build refuses are not checked either: why they cannot be built is the one error
    if (sources.assemblyError)
        return unresolvedSnapshot(sources, sources.assemblyError, sessionId, revision)
    checker ??= await createX86Emulator({ mode: 'NASM_trunk' })
    const diagnostics = await checker.checkProject(x86CoreProject(sources))
    // NASM reports no reached set, so the editor follows literal includes for file-status hints.
    const reached = x86ReachableFiles(sources)
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        if (file.encoding !== 'plain') fileStatus[path] = 'binary'
        else if (reached) fileStatus[path] = reached.has(path) ? 'assembled' : 'not-reachable'
        //Nothing walked the includes, so there is no honest claim to make. Saying `assembled` here
        //told the user a File was part of the program when nothing had checked.
        else fileStatus[path] = 'unknown'
    }
    return {
        sessionId,
        revision,
        target: 'X86',
        diagnostics: diagnostics.map((diagnostic) =>
            x86DiagnosticToLanguageDiagnostic(diagnostic, sources.entry)
        ),
        symbols: [],
        occurrences: [],
        fileStatus
    }
}

/** The sources' resolution failure as an error on the Entry's first line, and nothing checked. */
function unresolvedSnapshot(
    sources: BuildSources,
    message: string,
    sessionId: string,
    revision: number
): ProjectAnalysisSnapshot {
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] = file.encoding === 'plain' ? 'unknown' : 'binary'
    }
    return {
        sessionId,
        revision,
        target: 'X86',
        diagnostics: [
            {
                severity: 'error',
                source: 'nasm-project',
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
