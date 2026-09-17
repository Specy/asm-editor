import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import { analysisForModel, languageSession } from '$lib/languages/service/sessionRegistry'
import {
    createProjectDefinitionProvider,
    createProjectDocumentSymbolProvider
} from '$lib/languages/service/projectAssemblyLanguage'
import { parseProjectSourceUri, projectSourceUri } from '$lib/languages/service/uri'
import type { LanguageSymbol } from '$lib/languages/service/protocol'
import type { SourceLocation, SymbolOccurrence } from '$lib/languages/service/sourceModel'
import {
    z80ConditionCodes,
    z80DirectiveNames,
    z80InstructionNames,
    z80Registers
} from './Z80-documentation'

const reservedNames = new Set(
    [
        ...z80InstructionNames,
        ...z80DirectiveNames,
        ...z80Registers.map((register) => register.name),
        ...z80ConditionCodes.map((condition) => condition.name)
    ].map((name) => name.toLowerCase())
)
const fallbackOptions = {
    comment: ';' as const,
    dialect: 'z80' as const,
    z80BareSymbols: true,
    knownOperations: reservedNames
}

function contextForModel(model: monaco.editor.ITextModel) {
    const identity = parseProjectSourceUri(model.uri)
    if (!identity) return null
    const session = languageSession(identity.sessionId)
    const sources = session?.sourcesFor(
        identity.sourceKind,
        identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    )
    const snapshot = sources && analysisForModel(session, identity, sources)
    return session && snapshot?.target === 'Z80' ? { identity, snapshot } : null
}

function range(monaco: MonacoType, location: SourceLocation): monaco.Range {
    return new monaco.Range(
        location.range.start.line + 1,
        location.range.start.column + 1,
        location.range.end.line + 1,
        location.range.end.column + 1
    )
}

function locationKey(location: SourceLocation): string {
    return `${location.path}:${location.range.start.line}:${location.range.start.column}:${location.range.end.line}:${location.range.end.column}`
}

function occurrencesAt(
    occurrences: SymbolOccurrence[],
    path: string,
    line: number,
    column: number
): SymbolOccurrence[] {
    return occurrences.filter(
        (occurrence) =>
            occurrence.location.path === path &&
            occurrence.location.range.start.line === line &&
            occurrence.location.range.start.column <= column &&
            occurrence.location.range.end.column >= column
    )
}

function oneSymbolId(occurrences: SymbolOccurrence[]): string | null {
    const ids = new Set(occurrences.flatMap((occurrence) => occurrence.symbolId ?? []))
    return ids.size === 1 ? [...ids][0]! : null
}

function definitionsFor(occurrences: SymbolOccurrence[], symbolId: string): SymbolOccurrence[] {
    const unique = new Map<string, SymbolOccurrence>()
    for (const occurrence of occurrences) {
        if (occurrence.symbolId !== symbolId || occurrence.role !== 'definition') continue
        unique.set(locationKey(occurrence.location), occurrence)
    }
    return [...unique.values()]
}

function symbolKind(monaco: MonacoType, symbol: LanguageSymbol): monaco.languages.SymbolKind {
    if (symbol.kind === 'constant') return monaco.languages.SymbolKind.Constant
    if (symbol.kind === 'data') return monaco.languages.SymbolKind.Field
    return monaco.languages.SymbolKind.Function
}

export function createZ80ProjectDefinitionProvider(
    monaco: MonacoType
): monaco.languages.DefinitionProvider {
    const fallback = createProjectDefinitionProvider(monaco, fallbackOptions)
    return {
        async provideDefinition(model, position, token) {
            const context = contextForModel(model)
            if (context) {
                const id = oneSymbolId(
                    occurrencesAt(
                        context.snapshot.occurrences,
                        context.identity.path,
                        position.lineNumber - 1,
                        position.column - 1
                    )
                )
                if (id) {
                    return definitionsFor(context.snapshot.occurrences, id).map((definition) => ({
                        uri: projectSourceUri(monaco, {
                            ...context.identity,
                            path: definition.location.path
                        }),
                        range: range(monaco, definition.location)
                    }))
                }
            }
            return fallback.provideDefinition(model, position, token)
        }
    }
}

export function createZ80ProjectDocumentSymbolProvider(
    monaco: MonacoType
): monaco.languages.DocumentSymbolProvider {
    const fallback = createProjectDocumentSymbolProvider(monaco, fallbackOptions)
    return {
        async provideDocumentSymbols(model, token) {
            const context = contextForModel(model)
            if (!context) return fallback.provideDocumentSymbols(model, token)
            const symbols = context.snapshot.symbols.filter(
                (symbol) => symbol.location.path === context.identity.path
            )
            const semantic = symbols.map((symbol) => {
                const symbolRange = range(monaco, symbol.location)
                return {
                    name: symbol.name,
                    detail:
                        symbol.value === undefined
                            ? symbol.kind
                            : `${symbol.kind} = ${symbol.value} ($${(symbol.value & 0xffff).toString(16)})`,
                    kind: symbolKind(monaco, symbol),
                    tags: [],
                    range: symbolRange,
                    selectionRange: symbolRange
                }
            })
            const textual = (await fallback.provideDocumentSymbols(model, token)) ?? []
            const semanticKeys = new Set(
                semantic.map(
                    (symbol) =>
                        `${symbol.name.toLowerCase()}:${symbol.selectionRange.startLineNumber}:${symbol.selectionRange.startColumn}`
                )
            )
            return [
                ...semantic,
                ...textual.filter(
                    (symbol) =>
                        !semanticKeys.has(
                            `${symbol.name.toLowerCase()}:${symbol.selectionRange.startLineNumber}:${symbol.selectionRange.startColumn}`
                        )
                )
            ]
        }
    }
}

export function createZ80ReferenceProvider(monaco: MonacoType): monaco.languages.ReferenceProvider {
    return {
        provideReferences(model, position, referenceContext) {
            const context = contextForModel(model)
            if (!context) return null
            const id = oneSymbolId(
                occurrencesAt(
                    context.snapshot.occurrences,
                    context.identity.path,
                    position.lineNumber - 1,
                    position.column - 1
                )
            )
            if (!id) return null
            return context.snapshot.occurrences
                .filter(
                    (occurrence) =>
                        occurrence.symbolId === id &&
                        (referenceContext.includeDeclaration || occurrence.role === 'reference')
                )
                .map((occurrence) => ({
                    uri: projectSourceUri(monaco, {
                        ...context.identity,
                        path: occurrence.location.path
                    }),
                    range: range(monaco, occurrence.location)
                }))
        }
    }
}

export function createZ80DocumentHighlightProvider(
    monaco: MonacoType
): monaco.languages.DocumentHighlightProvider {
    return {
        provideDocumentHighlights(model, position) {
            const context = contextForModel(model)
            if (!context) return null
            const id = oneSymbolId(
                occurrencesAt(
                    context.snapshot.occurrences,
                    context.identity.path,
                    position.lineNumber - 1,
                    position.column - 1
                )
            )
            if (!id) return null
            return context.snapshot.occurrences
                .filter(
                    (occurrence) =>
                        occurrence.symbolId === id &&
                        occurrence.location.path === context.identity.path
                )
                .map((occurrence) => ({
                    range: range(monaco, occurrence.location),
                    kind:
                        occurrence.role === 'definition'
                            ? monaco.languages.DocumentHighlightKind.Write
                            : monaco.languages.DocumentHighlightKind.Read
                }))
        }
    }
}

export function createZ80ProjectHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const context = contextForModel(model)
            if (!context) return null
            const matched = occurrencesAt(
                context.snapshot.occurrences,
                context.identity.path,
                position.lineNumber - 1,
                position.column - 1
            )
            const id = oneSymbolId(matched)
            if (!id) return null
            const symbol = context.snapshot.symbols.find((candidate) => candidate.id === id)
            const occurrence = matched[0]
            if (!symbol || !occurrence) return null
            return {
                range: range(monaco, occurrence.location),
                contents: [
                    {
                        value: `**${symbol.kind}:** \`${symbol.name}\`\n\nValue: **${symbol.value ?? 'unresolved'}**${
                            symbol.value === undefined
                                ? ''
                                : ` (\`$${(symbol.value & 0xffff).toString(16)}\`)`
                        }\n\nDefined in \`${symbol.location.path}:${symbol.location.range.start.line + 1}\``
                    }
                ]
            }
        }
    }
}

function renameLocationRejection(
    monaco: MonacoType,
    position: monaco.Position,
    message: string
): monaco.languages.RenameLocation & monaco.languages.Rejection {
    return {
        rejectReason: message,
        text: '',
        range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
        )
    }
}

function renameEditRejection(
    message: string
): monaco.languages.WorkspaceEdit & monaco.languages.Rejection {
    return { rejectReason: message, edits: [] }
}

export function createZ80RenameProvider(monaco: MonacoType): monaco.languages.RenameProvider {
    function renameContext(model: monaco.editor.ITextModel, position: monaco.Position) {
        const context = contextForModel(model)
        if (!context) return null
        const matches = occurrencesAt(
            context.snapshot.occurrences,
            context.identity.path,
            position.lineNumber - 1,
            position.column - 1
        )
        const id = oneSymbolId(matches)
        if (!id) return null
        const symbols = context.snapshot.symbols.filter((symbol) => symbol.id === id)
        if (symbols.length === 0 || symbols.some((symbol) => symbol.renameable === false))
            return null
        return { ...context, id, symbol: symbols[0]!, occurrence: matches[0]! }
    }

    return {
        resolveRenameLocation(model, position) {
            const context = renameContext(model, position)
            if (!context) {
                return renameLocationRejection(
                    monaco,
                    position,
                    'This symbol cannot be renamed safely'
                )
            }
            return {
                text: context.symbol.name,
                range: range(monaco, context.occurrence.location)
            }
        },
        provideRenameEdits(model, position, newName) {
            const context = renameContext(model, position)
            if (!context) return renameEditRejection('This symbol cannot be renamed safely')
            if (!/^[A-Za-z_.][\w.]*$/.test(newName)) {
                return renameEditRejection('That is not a valid Z80 symbol name')
            }
            if (reservedNames.has(newName.toLowerCase())) {
                return renameEditRejection(
                    'A Z80 instruction, directive, register or condition uses that name'
                )
            }
            const collision = context.snapshot.symbols.some(
                (symbol) =>
                    symbol.id !== context.id && symbol.name.toLowerCase() === newName.toLowerCase()
            )
            if (collision) return renameEditRejection(`A symbol named ${newName} already exists`)
            const unique = new Map<string, SymbolOccurrence>()
            for (const occurrence of context.snapshot.occurrences) {
                if (occurrence.symbolId === context.id) {
                    unique.set(locationKey(occurrence.location), occurrence)
                }
            }
            return {
                edits: [...unique.values()].map((occurrence) => ({
                    resource: projectSourceUri(monaco, {
                        ...context.identity,
                        path: occurrence.location.path
                    }),
                    textEdit: {
                        range: range(monaco, occurrence.location),
                        text: newName
                    },
                    versionId: undefined
                }))
            }
        }
    }
}
