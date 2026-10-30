export type SourcePosition = { line: number; column: number }
export type SourceRange = { start: SourcePosition; end: SourcePosition }
export type SourceLocation = { path: string; range: SourceRange }

export type RelatedLanguageDiagnostic = {
    location: SourceLocation
    message: string
}

/**
 * A change a Core suggests for its diagnostic, which the editor offers as a quick fix: `text`
 * replaces what `location` covers, and an empty range inserts it. The text carries its own line
 * breaks, and the location may be in another File than the diagnostic's (an `opt p=68020` line at
 * the top of the entry File).
 */
export type LanguageFix = {
    /** What applying it does, as the quick fix's title. */
    title: string
    location: SourceLocation
    text: string
}

export type LanguageDiagnostic = {
    location: SourceLocation
    severity: 'error' | 'warning' | 'suggestion'
    message: string
    hint?: string
    source: string
    code?: string
    related?: RelatedLanguageDiagnostic[]
    /** The fixes the Core suggests, the one to prefer first; absent when it suggests none. */
    fixes?: LanguageFix[]
}

export type SymbolKind =
    | 'label'
    | 'constant'
    | 'variable'
    | 'register-list'
    | 'macro'
    | 'section'
    | 'data'

export type SymbolOccurrence = {
    symbolId?: string
    name: string
    kind: SymbolKind
    role: 'definition' | 'reference'
    location: SourceLocation
}
