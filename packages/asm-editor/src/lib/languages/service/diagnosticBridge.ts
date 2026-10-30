import type { Diagnostic, DiagnosticFix } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { LanguageDiagnostic, LanguageFix } from './sourceModel'

/** Converts the neutral Worker diagnostic into the Emulator/UI diagnostic contract. */
export function languageDiagnosticToDiagnostic(diagnostic: LanguageDiagnostic): Diagnostic {
    return {
        severity: diagnostic.severity,
        source: diagnostic.source,
        code: diagnostic.code,
        file: diagnostic.location.path,
        lineIndex: diagnostic.location.range.start.line,
        column: diagnostic.location.range.start.column + 1,
        endColumn: diagnostic.location.range.end.column + 1,
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
        })),
        ...(diagnostic.fixes ? { fixes: diagnostic.fixes.map(languageFixToDiagnosticFix) } : {})
    }
}

/** A suggested fix in the diagnostic's terms: one-based columns, the File by its path. */
export function languageFixToDiagnosticFix(fix: LanguageFix): DiagnosticFix {
    const { start, end } = fix.location.range
    return {
        title: fix.title,
        file: fix.location.path,
        lineIndex: start.line,
        column: start.column + 1,
        endLineIndex: end.line,
        endColumn: end.column + 1,
        text: fix.text
    }
}
