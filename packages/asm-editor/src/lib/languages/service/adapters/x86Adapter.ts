import { executableKind } from '#lib/executables.ts'
import { createX86Emulator, ResourceDownloadError, type MonacoError } from '@specy/x86'
import type { BuildSources } from '#lib/projectFiles.ts'
import { x86ReachableFiles } from '#lib/languages/X86/x86Project.ts'
import { x86CoreProject, prepareX86Runtime } from '#lib/languages/X86/x86StartUnit.ts'
import { downloadReason } from '#lib/languages/X86/x86Downloads.ts'
import type { ProjectAnalysisSnapshot, ProjectFileAnalysisStatus } from '../protocol'
import type { LanguageDiagnostic } from '../sourceModel'
import { unresolvedSnapshot, unresolvedSources } from './unresolved'
import { AnalysisUnavailableError } from '../workers/projectWorkerServer'

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
        severity: error.severity === 'hint' ? 'suggestion' : (error.severity ?? 'error'),
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
    const kind = executableKind(sources.files[sources.entry])
    if (kind !== 'none') {
        if (kind !== 'supported')
            return unresolvedSnapshot(
                sources,
                kind.unsupported,
                sessionId,
                revision,
                'X86',
                'nasm-project'
            )
        return {
            sessionId,
            revision,
            target: 'X86',
            diagnostics: [],
            symbols: [],
            occurrences: [],
            fileStatus: Object.fromEntries(
                Object.entries(sources.files).map(([path, file]) => [
                    path,
                    file.encoding === 'base64' ? 'binary' : 'unknown'
                ])
            )
        }
    }
    //sources the Build refuses are not checked either: why they cannot be built is the one error
    const unresolved = unresolvedSources(sources)
    if (unresolved)
        return unresolvedSnapshot(sources, unresolved, sessionId, revision, 'X86', 'nasm-project')
    await prepareX86Runtime(sources)
    let diagnostics: MonacoError[]
    try {
        checker ??= await createX86Emulator({ mode: 'NASM_trunk' })
        diagnostics = await checker.checkProject(x86CoreProject(sources))
    } catch (error) {
        if (!(error instanceof ResourceDownloadError)) throw error
        //the assembler did not arrive, which says nothing of the code: a warning rather than an
        //error, which would hold Build back, until the check downloads it again. A server that
        //refused it refuses it again, until a reload of the page asks for the site's new files
        const refused = error.status !== undefined
        const message = `Code checking is paused: couldn't download ${error.resource} (${downloadReason(error)}). ${
            refused ? 'Reload the page to check your code.' : 'It will try again shortly.'
        }`
        throw new AnalysisUnavailableError(
            message,
            unresolvedSnapshot(
                sources,
                message,
                sessionId,
                revision,
                'X86',
                'nasm-project',
                'warning'
            ),
            { cause: error, retry: !refused }
        )
    }
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
