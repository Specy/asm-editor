import { MIPS, type MIPSAssembleError } from '@specy/mips'
import { RISCV, type RISCVAssembleError } from '@specy/risc-v'
import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import { normalizeMarsDisplay } from '$lib/languages/mars/marsDisplay'
import {
    applyScreenDirective,
    ignoredIncludedScreenDiagnostics,
    readScreenLabelProbe,
    SCREEN_LABEL_PROBE_ADDRESS,
    screenLabelProbeSource
} from '$lib/languages/mars/screenDirective'
import {
    fileText,
    sourceText,
    textAssemblyFiles,
    type BuildSources
} from '$lib/projectFiles'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectFileAnalysisStatus
} from '../protocol'
import type { LanguageDiagnostic, RelatedLanguageDiagnostic } from '../sourceModel'

type MarsTarget = Extract<ProjectAnalysisTarget, 'MIPS' | 'RISC-V' | 'RISC-V-64'>
type MarsError = MIPSAssembleError | RISCVAssembleError

function makeCore(files: Record<string, string>, entry: string, target: MarsTarget) {
    if (target === 'MIPS') return MIPS.makeMipsFromFiles(files, entry)
    RISCV.setIs64Bit(target === 'RISC-V-64')
    return RISCV.makeRiscVFromFiles(files, entry)
}

function resolveLabelAddress(
    files: Record<string, string>,
    entry: string,
    target: MarsTarget,
    label: string
): number | null {
    try {
        const probe = makeCore(
            { ...files, [entry]: screenLabelProbeSource(files[entry] ?? '', label) },
            entry,
            target
        )
        const result = probe.assemble()
        if (result.errors.some((error) => !error.isWarning)) return null
        return readScreenLabelProbe(probe.readMemoryBytes(SCREEN_LABEL_PROBE_ADDRESS, 4))
    } catch {
        return null
    }
}

function lineText(sources: BuildSources, path: string, line: number): string {
    const file = sources.files[path]
    if (!file) return ''
    try {
        return fileText(file).split(/\r?\n/)[line] ?? ''
    } catch {
        return ''
    }
}

function coreDiagnostic(error: MarsError, sources: BuildSources, target: MarsTarget) {
    const line = Math.max(0, error.sourceLine - 1)
    const column = Math.max(0, error.sourceColumn - 1)
    const related: RelatedLanguageDiagnostic[] = error.macroExpansionTrace.map((location) => ({
        message: 'Expanded from here',
        location: {
            path: location.sourcePath,
            range: {
                start: { line: Math.max(0, location.sourceLine - 1), column: 0 },
                end: {
                    line: Math.max(0, location.sourceLine - 1),
                    column: lineText(
                        sources,
                        location.sourcePath,
                        Math.max(0, location.sourceLine - 1)
                    ).length
                }
            }
        }
    }))
    return {
        severity: error.isWarning ? ('warning' as const) : ('error' as const),
        source: target === 'MIPS' ? 'mips' : 'risc-v',
        location: {
            path: error.sourcePath || sources.entry,
            range: {
                start: { line, column },
                end: { line, column: column + 1 }
            }
        },
        message: error.message,
        related
    }
}

function legacyDiagnostic(diagnostic: Diagnostic, entry: string): LanguageDiagnostic {
    const line = Math.max(0, diagnostic.lineIndex)
    const column = Math.max(0, diagnostic.column - 1)
    return {
        severity: diagnostic.severity,
        source: diagnostic.source ?? 'asm-editor',
        code: diagnostic.code,
        message: diagnostic.message,
        hint: diagnostic.hint,
        location: {
            path: diagnostic.file ?? entry,
            range: {
                start: { line, column },
                end: { line, column: Math.max(column + 1, (diagnostic.endColumn ?? column + 2) - 1) }
            }
        }
    }
}

export function analyzeMarsProject(
    sources: BuildSources,
    sessionId: string,
    revision: number,
    target: MarsTarget
): ProjectAnalysisSnapshot {
    const files = textAssemblyFiles(sources)
    const core = makeCore(files, sources.entry, target)
    const result = core.assemble()
    const reached = new Set(core.getTokenizedLines().map((line) => line.sourcePath))
    reached.add(sources.entry)
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] =
            file.encoding !== 'plain' ? 'binary' : reached.has(path) ? 'assembled' : 'not-reachable'
    }

    const screenDiagnostics: Diagnostic[] = applyScreenDirective(
        sourceText(sources),
        normalizeMarsDisplay(undefined),
        (label) => resolveLabelAddress(files, sources.entry, target, label)
    ).diagnostics.map((diagnostic) => ({ ...diagnostic, file: sources.entry }))
    screenDiagnostics.push(...ignoredIncludedScreenDiagnostics(files, sources.entry, reached))

    return {
        sessionId,
        revision,
        target,
        diagnostics: [
            ...screenDiagnostics.map((diagnostic) => legacyDiagnostic(diagnostic, sources.entry)),
            ...result.errors.map((error) => coreDiagnostic(error, sources, target))
        ],
        symbols: [],
        occurrences: [],
        fileStatus
    }
}
