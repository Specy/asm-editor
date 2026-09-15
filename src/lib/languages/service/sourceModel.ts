export type SourcePosition = { line: number; column: number }
export type SourceRange = { start: SourcePosition; end: SourcePosition }
export type SourceLocation = { path: string; range: SourceRange }

export type RelatedLanguageDiagnostic = {
    location: SourceLocation
    message: string
}

export type LanguageDiagnostic = {
    location: SourceLocation
    severity: 'error' | 'warning' | 'suggestion'
    message: string
    hint?: string
    source: string
    code?: string
    related?: RelatedLanguageDiagnostic[]
}

export type SymbolKind =
    'label' | 'constant' | 'variable' | 'register-list' | 'macro' | 'section' | 'data'

export type SymbolOccurrence = {
    symbolId?: string
    name: string
    kind: SymbolKind
    role: 'definition' | 'reference'
    location: SourceLocation
}
