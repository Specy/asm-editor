import { createX86Emulator, type MonacoError } from '@specy/x86'
import type { BuildSources } from '$lib/projectFiles'
import {
    expandLegacyX86Project,
    stageLegacyX86ProjectFiles,
    toX86Project,
    x86SourceLineAt,
    type X86ProjectInput,
    type X86SourceLine
} from '$lib/languages/X86/x86Project'
import type { ProjectAnalysisSnapshot, ProjectFileAnalysisStatus } from '../protocol'
import type { LanguageDiagnostic } from '../sourceModel'

export function x86DiagnosticToLanguageDiagnostic(
    error: MonacoError,
    entry: string,
    lineMap: readonly X86SourceLine[] = []
): LanguageDiagnostic {
    const file = coreSourceFile(error)
    const source = file
        ? { path: file, line: error.lineIndex }
        : x86SourceLineAt(lineMap, error.lineIndex, entry)
    const column = Math.max(0, error.column - 1)
    return {
        severity: 'error',
        source: 'nasm',
        location: {
            path: source.path,
            range: {
                start: { line: source.line, column },
                end: { line: source.line, column: column + 1 }
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
    checker ??= await createX86Emulator({ mode: 'NASM_trunk' })
    const native = hasNativeProjectApi(checker)
    const expanded = native ? undefined : expandLegacyX86Project(sources)
    if (expanded) stageLegacyX86ProjectFiles(checker.module, expanded)
    const diagnostics = native
        ? await checkNativeProject(checker, toX86Project(sources))
        : expanded!.diagnostics.length === 0
          ? await checker.checkCode(expanded!.code)
          : []
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        if (file.encoding !== 'plain') fileStatus[path] = 'binary'
        else
            fileStatus[path] = native || expanded!.reached.has(path) ? 'assembled' : 'not-reachable'
    }
    return {
        sessionId,
        revision,
        target: 'X86',
        diagnostics: [
            ...(expanded?.diagnostics.map((diagnostic) => ({
                severity: 'error' as const,
                source: 'nasm-project',
                location: {
                    path: diagnostic.path,
                    range: {
                        start: { line: diagnostic.line, column: diagnostic.column },
                        end: { line: diagnostic.line, column: diagnostic.column + 1 }
                    }
                },
                message: diagnostic.message
            })) ?? []),
            ...diagnostics.map((diagnostic) =>
                x86DiagnosticToLanguageDiagnostic(diagnostic, sources.entry, expanded?.lineMap)
            )
        ],
        symbols: [],
        occurrences: [],
        fileStatus
    }
}

type X86Checker = Awaited<ReturnType<typeof createX86Emulator>>
type NativeProjectChecker = X86Checker & {
    checkProject(project: X86ProjectInput): Promise<Array<MonacoError & { file?: string }>>
}

function hasNativeProjectApi(core: X86Checker): boolean {
    return typeof (core as Partial<NativeProjectChecker>).checkProject === 'function'
}

function checkNativeProject(
    core: X86Checker,
    project: X86ProjectInput
): Promise<Array<MonacoError & { file?: string }>> {
    return (core as NativeProjectChecker).checkProject(project)
}

function coreSourceFile(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || !('file' in value)) return undefined
    return typeof value.file === 'string' ? value.file : undefined
}
