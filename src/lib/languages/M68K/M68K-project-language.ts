import { S68k } from '@specy/s68k'
import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import { m68kWrittenPath, resolveM68kFile } from './m68kAssemblyFiles'
import { languageSession, type LanguageSessionView } from '$lib/languages/service/sessionRegistry'
import {
    parseProjectSourceUri,
    projectSourceUri,
    type ProjectModelIdentity
} from '$lib/languages/service/uri'
import type { LanguageSymbol } from '$lib/languages/service/protocol'
import type { BuildSources } from '$lib/projectFiles'
import { s68kColumnToUtf16 } from './m68kDiagnostics'

function sessionForModel(model: monaco.editor.ITextModel): {
    identity: ProjectModelIdentity
    session: LanguageSessionView
    sources: BuildSources
} | null {
    const identity = parseProjectSourceUri(model.uri)
    if (!identity) return null
    const session = languageSession(identity.sessionId)
    const sources = session?.sourcesFor(
        identity.sourceKind,
        identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    )
    return session && sources ? { identity, session, sources } : null
}

function liveSymbols(context: ReturnType<typeof sessionForModel>): LanguageSymbol[] {
    return context?.identity.sourceKind === 'live' ? (context.session.snapshot?.symbols ?? []) : []
}

function targetUri(monaco: MonacoType, identity: ProjectModelIdentity, path: string): monaco.Uri {
    return projectSourceUri(monaco, { ...identity, path })
}

function symbolRange(monaco: MonacoType, symbol: LanguageSymbol): monaco.Range {
    const { start, end } = symbol.location.range
    return new monaco.Range(start.line + 1, start.column + 1, end.line + 1, end.column + 1)
}

function tokenAt(
    line: string,
    column: number
): { value: string; start: number; end: number } | null {
    const offset = column - 1
    for (const match of line.matchAll(/[A-Za-z_.$][\w.$]*/g)) {
        const start = match.index
        const end = start + match[0].length
        if (offset >= start && offset <= end) return { value: match[0], start, end }
    }
    return null
}

function relativePath(from: string, to: string): string {
    const fromParts = from.split('/')
    fromParts.pop()
    const toParts = to.split('/')
    while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
        fromParts.shift()
        toParts.shift()
    }
    return [...fromParts.map(() => '..'), ...toParts].join('/')
}

function completionKind(monaco: MonacoType, symbol: LanguageSymbol) {
    switch (symbol.kind) {
        case 'constant':
            return monaco.languages.CompletionItemKind.Constant
        case 'variable':
            return monaco.languages.CompletionItemKind.Variable
        case 'register-list':
            return monaco.languages.CompletionItemKind.Value
        default:
            return monaco.languages.CompletionItemKind.Reference
    }
}

function documentSymbolKind(monaco: MonacoType, symbol: LanguageSymbol) {
    switch (symbol.kind) {
        case 'constant':
            return monaco.languages.SymbolKind.Constant
        case 'variable':
            return monaco.languages.SymbolKind.Variable
        case 'register-list':
            return monaco.languages.SymbolKind.Array
        case 'data':
            return monaco.languages.SymbolKind.Field
        default:
            return monaco.languages.SymbolKind.Function
    }
}

export function createM68kProjectCompletionProvider(
    monaco: MonacoType
): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['/', '"', "'"],
        provideCompletionItems(model, position) {
            const context = sessionForModel(model)
            if (!context) return { suggestions: [] }
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const parsed = S68k.parseLine(prefix)
            if (parsed.comment && parsed.comment.span.start < prefix.length) {
                return { suggestions: [] }
            }

            const pathMatch = /\b(?:include|incbin)\s+["']?([^"']*)$/i.exec(prefix)
            if (pathMatch) {
                const typed = pathMatch[1]
                const range = new monaco.Range(
                    position.lineNumber,
                    position.column - typed.length,
                    position.lineNumber,
                    position.column
                )
                return {
                    suggestions: Object.keys(context.sources.files)
                        .map((path) => ({
                            path,
                            inserted: relativePath(context.identity.path, path)
                        }))
                        .filter(({ inserted }) => inserted.startsWith(typed))
                        .map(({ path, inserted }) => ({
                            label: path,
                            detail: 'Project File',
                            kind: monaco.languages.CompletionItemKind.File,
                            insertText: inserted,
                            range
                        }))
                }
            }
            if (!parsed.operation) return { suggestions: [] }
            const word = model.getWordUntilPosition(position)
            const symbols = liveSymbols(context)
            return {
                suggestions: symbols
                    .filter((symbol) => symbol.name.startsWith(word.word))
                    .map((symbol) => ({
                        label: symbol.name,
                        detail: `M68K ${symbol.kind}`,
                        documentation:
                            symbol.value === undefined
                                ? undefined
                                : `${symbol.value} ($${(symbol.value >>> 0).toString(16)})`,
                        kind: completionKind(monaco, symbol),
                        insertText: symbol.name,
                        range: new monaco.Range(
                            position.lineNumber,
                            word.startColumn,
                            position.lineNumber,
                            word.endColumn
                        )
                    }))
            }
        }
    }
}

export function createM68kDocumentSymbolProvider(
    monaco: MonacoType
): monaco.languages.DocumentSymbolProvider {
    return {
        provideDocumentSymbols(model) {
            const context = sessionForModel(model)
            if (!context) return []
            return liveSymbols(context)
                .filter((symbol) => symbol.location.path === context.identity.path)
                .map((symbol) => {
                    const range = symbolRange(monaco, symbol)
                    return {
                        name: symbol.name,
                        detail:
                            symbol.value === undefined
                                ? symbol.kind
                                : `${symbol.kind} = ${symbol.value}`,
                        kind: documentSymbolKind(monaco, symbol),
                        tags: [],
                        range,
                        selectionRange: range
                    }
                })
        }
    }
}

export function createM68kDefinitionProvider(
    monaco: MonacoType
): monaco.languages.DefinitionProvider {
    return {
        provideDefinition(model, position) {
            const context = sessionForModel(model)
            if (!context) return null
            const token = tokenAt(model.getLineContent(position.lineNumber), position.column)
            if (!token) return null
            const matches = liveSymbols(context).filter((symbol) => symbol.name === token.value)
            const locations = new Map(
                matches.map((symbol) => [
                    `${symbol.location.path}:${symbol.location.range.start.line}:${symbol.location.range.start.column}`,
                    symbol
                ])
            )
            if (locations.size !== 1) return null
            const symbol = [...locations.values()][0]
            return {
                uri: targetUri(monaco, context.identity, symbol.location.path),
                range: symbolRange(monaco, symbol)
            }
        }
    }
}

export function createM68kProjectHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const context = sessionForModel(model)
            if (!context) return null
            const token = tokenAt(model.getLineContent(position.lineNumber), position.column)
            if (!token) return null
            const matches = liveSymbols(context).filter((symbol) => symbol.name === token.value)
            if (matches.length !== 1) return null
            const symbol = matches[0]
            const value =
                symbol.value === undefined
                    ? ''
                    : `\n\nValue: **${symbol.value}** (\`$${(symbol.value >>> 0).toString(16)}\`)`
            return {
                range: new monaco.Range(
                    position.lineNumber,
                    token.start + 1,
                    position.lineNumber,
                    token.end + 1
                ),
                contents: [
                    {
                        value: `**${symbol.kind}:** \`${symbol.name}\`${value}\n\nDefined in \`${symbol.location.path}:${symbol.location.range.start.line + 1}\``
                    }
                ]
            }
        }
    }
}

export function createM68kDocumentLinkProvider(monaco: MonacoType): monaco.languages.LinkProvider {
    return {
        provideLinks(model) {
            const context = sessionForModel(model)
            if (!context) return { links: [] }
            const links: monaco.languages.ILink[] = []
            for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
                const operation = S68k.parseLine(model.getLineContent(lineNumber)).operation
                const name = operation?.name.toLowerCase()
                if ((name !== 'include' && name !== 'incbin') || !operation?.text) continue
                const target = resolveM68kFile(
                    context.identity.path,
                    m68kWrittenPath(operation.text.text),
                    context.sources
                )
                if (!target) continue
                links.push({
                    range: new monaco.Range(
                        lineNumber,
                        s68kColumnToUtf16(
                            model.getLineContent(lineNumber),
                            operation.text.span.start
                        ) + 1,
                        lineNumber,
                        s68kColumnToUtf16(
                            model.getLineContent(lineNumber),
                            operation.text.span.end
                        ) + 1
                    ),
                    url: targetUri(monaco, context.identity, target),
                    tooltip: `Open ${target}`
                })
            }
            return { links }
        }
    }
}
