import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import { fileText, type BuildSources } from '$lib/projectFiles'
import type { LanguageDiagnostic } from './sourceModel'

export function languageDiagnosticToDiagnostic(
    diagnostic: LanguageDiagnostic,
    sources: BuildSources
): Diagnostic {
    const file = sources.files[diagnostic.location.path]
    let line = ''
    if (file) {
        try {
            line = fileText(file).split(/\r?\n/)[diagnostic.location.range.start.line] ?? ''
        } catch {
            // Binary Files do not have source lines.
        }
    }
    return {
        severity: diagnostic.severity,
        source: diagnostic.source,
        code: diagnostic.code,
        file: diagnostic.location.path,
        lineIndex: diagnostic.location.range.start.line,
        column: diagnostic.location.range.start.column + 1,
        endColumn: diagnostic.location.range.end.column + 1,
        line: { line, line_index: diagnostic.location.range.start.line },
        message: diagnostic.message,
        hint: diagnostic.hint,
        formatted: diagnostic.hint
            ? `${diagnostic.message}\n${diagnostic.hint}`
            : diagnostic.message,
        related: diagnostic.related?.map((related) => ({
            file: related.location.path,
            lineIndex: related.location.range.start.line,
            column: related.location.range.start.column + 1,
            endColumn: related.location.range.end.column + 1,
            message: related.message
        }))
    }
}
