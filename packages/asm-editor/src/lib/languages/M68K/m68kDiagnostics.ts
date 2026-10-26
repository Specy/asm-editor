import type { Diagnostic as S68kDiagnostic, Location } from '@specy/s68k'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { languageDiagnosticToDiagnostic } from '#lib/languages/service/diagnosticBridge.ts'
import type { LanguageDiagnostic, SourceLocation } from '#lib/languages/service/sourceModel.ts'
import { fileText, type BuildSources } from '#lib/projectFiles.ts'

/** Converts S68K's Unicode-scalar column to Monaco's UTF-16 code-unit column. */
export function s68kColumnToUtf16(line: string, column: number): number {
    if (column <= 0) return 0
    return [...line].slice(0, column).join('').length
}

function sourceLine(sources: BuildSources, location: Location): string {
    const file = sources.files[location.file]
    if (!file) return ''
    try {
        return fileText(file).split(/\r?\n/)[location.line] ?? ''
    } catch {
        return ''
    }
}

function sourceLocation(location: Location, sources: BuildSources): SourceLocation {
    const line = sourceLine(sources, location)
    return {
        path: location.file,
        range: {
            start: {
                line: location.line,
                column: s68kColumnToUtf16(line, location.column)
            },
            end: {
                line: location.line,
                column: s68kColumnToUtf16(line, location.endColumn)
            }
        }
    }
}

export function s68kDiagnosticToLanguageDiagnostic(
    error: S68kDiagnostic,
    sources: BuildSources
): LanguageDiagnostic {
    return {
        severity: error.severity,
        source: 's68k',
        code: error.code,
        location: sourceLocation(error.location, sources),
        message: error.message,
        hint: error.hint,
        related: error.related.map((related) => ({
            location: sourceLocation(related.location, sources),
            message: related.message
        }))
    }
}

export function s68kDiagnosticToDiagnostic(
    error: S68kDiagnostic,
    sources: BuildSources
): Diagnostic {
    return languageDiagnosticToDiagnostic(
        s68kDiagnosticToLanguageDiagnostic(error, sources),
        sources
    )
}
