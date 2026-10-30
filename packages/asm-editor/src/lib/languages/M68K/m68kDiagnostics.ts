import type { Diagnostic as S68kDiagnostic, Location } from '@specy/s68k'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { languageDiagnosticToDiagnostic } from '#lib/languages/service/diagnosticBridge.ts'
import type { LanguageDiagnostic, SourceLocation } from '#lib/languages/service/sourceModel.ts'
import { sourceLineText, type BuildSources } from '#lib/projectFiles.ts'

/** Converts S68K's Unicode-scalar column to Monaco's UTF-16 code-unit column. */
export function s68kColumnToUtf16(line: string, column: number): number {
    if (column <= 0) return 0
    return [...line].slice(0, column).join('').length
}

export function sourceLocation(location: Location, sources: BuildSources): SourceLocation {
    const line = sourceLineText(sources, location.file, location.line)
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
        })),
        //`needs_a_later_processor` carries the `opt p=` line to add and the 68000's own way of
        //writing the same, and `processor_chosen_after_code` the deletion of its late line, which
        //the editor offers as quick fixes
        ...(error.fixes
            ? {
                  fixes: error.fixes.map((fix) => ({
                      title: fix.title,
                      location: sourceLocation(fix.location, sources),
                      text: fix.text
                  }))
              }
            : {})
    }
}

export function s68kDiagnosticToDiagnostic(
    error: S68kDiagnostic,
    sources: BuildSources
): Diagnostic {
    return languageDiagnosticToDiagnostic(s68kDiagnosticToLanguageDiagnostic(error, sources))
}
