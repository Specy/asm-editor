import { type MIPSAssembleError } from '@specy/mips'
import { RISCV, type RISCVAssembleError } from '@specy/risc-v'
import { makeMipsCore } from '$lib/languages/MIPS/MIPS-core'
import { makeRiscVCore, type RiscVLink } from '$lib/languages/RISC-V/RISC-V-core'
import {
    coreLibrary,
    loadedRuntimeFunctions,
    loadedRuntimeLibrary,
    loadRuntimeFunctions,
    loadRuntimeLibrary,
    runtimeLibraryHint
} from '$lib/sourceRuntime/runtimeLibrary'
import { CURRENT_RUNTIME_ABI, unsupportedRuntimeAbi } from '$lib/runtimeAbi'
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
    makeTokenSpanIndex,
    tokenSpanEnd,
    type TokenSpanIndex
} from '$lib/languages/mars/tokenSpans'
import {
    buildAssemblerProfile,
    fileText,
    ProjectFormatError,
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

function makeCore(
    files: Record<string, string>,
    entry: string,
    target: MarsTarget,
    assemblerProfile: BuildSources['assemblerProfile'] = 'rars',
    link: RiscVLink = {}
) {
    if (target === 'MIPS') return makeMipsCore(files, entry, assemblerProfile, link)
    RISCV.setIs64Bit(target === 'RISC-V-64')
    return makeRiscVCore(files, entry, assemblerProfile, link)
}

/**
 * Loads the Runtime library the sources link, or the list of library functions that explains an
 * undefined one when they do not, so the analysis itself stays synchronous.
 */
export async function prepareMarsAnalysis(sources: BuildSources, target: MarsTarget) {
    if (sources.runtimeAbi === undefined) {
        await loadRuntimeFunctions(CURRENT_RUNTIME_ABI)
        return
    }
    if (unsupportedRuntimeAbi(sources.runtimeAbi)) return
    await loadRuntimeLibrary(sources.runtimeAbi, target)
}

function runtimeLink(sources: BuildSources, target: MarsTarget): RiscVLink {
    if (sources.runtimeAbi === undefined) return {}
    //only a Compilation record's requirement starts at the library's _start (resolveRuntimeLink)
    const problem = unsupportedRuntimeAbi(sources.runtimeAbi, sources.entrySymbol !== undefined)
    if (problem) throw new ProjectFormatError(problem)
    const library = loadedRuntimeLibrary(sources.runtimeAbi, target)
    if (!library)
        throw new ProjectFormatError(`The Runtime library ${sources.runtimeAbi} is not loaded`)
    return {
        library: coreLibrary(library),
        ...(sources.entrySymbol ? { entrySymbol: sources.entrySymbol } : {})
    }
}

function resolveLabelAddress(
    files: Record<string, string>,
    entry: string,
    target: MarsTarget,
    label: string,
    assemblerProfile: BuildSources['assemblerProfile'] = 'rars',
    link: RiscVLink = {}
): number | null {
    try {
        const probe = makeCore(
            {
                ...files,
                [entry]:
                    assemblerProfile === 'gnu-compiler-v1'
                        ? (files[entry] ?? '')
                        : screenLabelProbeSource(files[entry] ?? '', label)
            },
            entry,
            target,
            assemblerProfile,
            link
        )
        const result = probe.assemble()
        if (result.errors.some((error) => !error.isWarning)) return null
        if (assemblerProfile === 'gnu-compiler-v1' && 'getAddressOfLabel' in probe) {
            const address = probe.getAddressOfLabel(label)
            return address === -1 ? null : address >>> 0
        }
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

function coreDiagnostic(
    error: MarsError,
    sources: BuildSources,
    target: MarsTarget,
    spans: TokenSpanIndex
) {
    const line = Math.max(0, error.sourceLine - 1)
    const column = Math.max(0, error.sourceColumn - 1)
    //the Cores point at the first character of the token and say no more, so the span comes from
    //their own token list; `tokenSpanEnd` is one-based and exclusive like Monaco, a range here is
    //zero-based, and a token that cannot be confirmed leaves the single character this always drew
    const tokenEnd = tokenSpanEnd(
        spans,
        error.sourcePath || sources.entry,
        error.sourceLine,
        error.sourceColumn
    )
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
                end: { line, column: tokenEnd === undefined ? column + 1 : tokenEnd - 1 }
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
                end: {
                    line,
                    column: Math.max(column + 1, (diagnostic.endColumn ?? column + 2) - 1)
                }
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
    const profile = buildAssemblerProfile(sources)
    const link = runtimeLink(sources, target)
    const core = makeCore(files, sources.entry, target, profile, link)
    const result = core.assemble()
    const tokenizedLines = core.getTokenizedLines()
    const spans = makeTokenSpanIndex(tokenizedLines)
    const reached = new Set(tokenizedLines.map((line) => line.sourcePath))
    reached.add(sources.entry)
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] =
            file.encoding !== 'plain' ? 'binary' : reached.has(path) ? 'assembled' : 'not-reachable'
    }

    const screenDiagnostics: Diagnostic[] = applyScreenDirective(
        sourceText(sources),
        normalizeMarsDisplay(undefined),
        (label) => resolveLabelAddress(files, sources.entry, target, label, profile, link)
    ).diagnostics.map((diagnostic) => ({ ...diagnostic, file: sources.entry }))
    screenDiagnostics.push(...ignoredIncludedScreenDiagnostics(files, sources.entry, reached))

    return {
        sessionId,
        revision,
        target,
        diagnostics: [
            ...screenDiagnostics.map((diagnostic) => legacyDiagnostic(diagnostic, sources.entry)),
            ...result.errors.map((error) => {
                const diagnostic = coreDiagnostic(error, sources, target, spans)
                //hand-written assembly links no library by default: say how to get printf
                const hint =
                    sources.runtimeAbi === undefined && !error.isWarning
                        ? runtimeLibraryHint(
                              error.message,
                              loadedRuntimeFunctions(CURRENT_RUNTIME_ABI)
                          )
                        : undefined
                return hint ? { ...diagnostic, hint } : diagnostic
            })
        ],
        symbols: [],
        occurrences: [],
        fileStatus
    }
}
