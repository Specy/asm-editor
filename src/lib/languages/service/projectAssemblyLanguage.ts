import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import { resolveFilePath, type BuildSources } from '$lib/projectFiles'
import { languageSession } from './sessionRegistry'
import { parseProjectSourceUri, projectSourceUri, type ProjectModelIdentity } from './uri'
import { splitAssemblyComment } from './assemblyText'

export type ProjectAssemblyLanguageOptions = {
    comment: '#' | ';'
    dialect?: 'mars' | 'z80' | 'x86'
    z80BareSymbols?: boolean
    /** Lower-case mnemonics/directives which cannot be colonless Z80 labels. */
    knownOperations?: ReadonlySet<string>
    excludeCurrentFromCompletion?: boolean
}

type SourceSymbol = {
    name: string
    kind: 'label' | 'constant' | 'macro' | 'section' | 'data'
    path: string
    line: number
    startColumn: number
    endColumn: number
}

type ProjectInclude = { path: string; startColumn: number; endColumn: number }

function lineWithoutComment(line: string, options: ProjectAssemblyLanguageOptions): string {
    return splitAssemblyComment(line, options.comment).code
}

function sourceSymbol(
    rawLine: string,
    path: string,
    line: number,
    name: string,
    kind: SourceSymbol['kind'],
    from = 0
): SourceSymbol {
    const startColumn = rawLine.indexOf(name, from)
    return {
        name,
        kind,
        path,
        line,
        startColumn: Math.max(0, startColumn),
        endColumn: Math.max(0, startColumn) + name.length
    }
}

function contextForModel(model: monaco.editor.ITextModel) {
    const identity = parseProjectSourceUri(model.uri)
    if (!identity) return null
    const session = languageSession(identity.sessionId)
    const sources = session?.sourcesFor(
        identity.sourceKind,
        identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    )
    return session && sources ? { identity, sources } : null
}

function sourceSymbols(
    sources: BuildSources,
    options: ProjectAssemblyLanguageOptions
): SourceSymbol[] {
    const symbols: SourceSymbol[] = []
    for (const [path, file] of Object.entries(sources.files)) {
        if (file.encoding !== 'plain') continue
        file.content.split(/\r?\n/).forEach((rawLine, line) => {
            const source = lineWithoutComment(rawLine, options)
            if (options.dialect === 'mars') {
                const equ = /^\s*\.eqv\s+([A-Za-z_.$][\w.$]*)/i.exec(source)
                const macro = /^\s*\.macro\s+([A-Za-z_.$][\w.$]*)/i.exec(source)
                const section = /^\s*\.(text|data|ktext|kdata|bss)\b/i.exec(source)
                if (equ?.[1]) symbols.push(sourceSymbol(rawLine, path, line, equ[1], 'constant'))
                if (macro?.[1]) symbols.push(sourceSymbol(rawLine, path, line, macro[1], 'macro'))
                if (section?.[0]) {
                    const name = section[0].trim()
                    symbols.push(sourceSymbol(rawLine, path, line, name, 'section'))
                }
            } else if (options.dialect === 'x86') {
                const equ = /^\s*([A-Za-z_@$.?][\w@$.?]*)\s+equ\b/i.exec(source)
                const define = /^\s*%(?:i|x)?define\s+([A-Za-z_@$.?][\w@$.?]*)/i.exec(source)
                const macro = /^\s*%macro\s+([A-Za-z_@$.?][\w@$.?]*)/i.exec(source)
                const structure = /^\s*struc\s+([A-Za-z_@$.?][\w@$.?]*)/i.exec(source)
                const section = /^\s*(?:section|segment)\s+([^\s;]+)/i.exec(source)
                const match = equ?.[1] ?? define?.[1]
                if (match) symbols.push(sourceSymbol(rawLine, path, line, match, 'constant'))
                if (macro?.[1]) symbols.push(sourceSymbol(rawLine, path, line, macro[1], 'macro'))
                if (structure?.[1]) {
                    symbols.push(sourceSymbol(rawLine, path, line, structure[1], 'data'))
                }
                if (section?.[1]) {
                    symbols.push(sourceSymbol(rawLine, path, line, section[1], 'section'))
                }
            } else if (options.dialect === 'z80') {
                const macro =
                    /^\s*([A-Za-z_.][\w.]*)\s+\.?macro\b/i.exec(source) ??
                    /^\s*\.?macro\s+([A-Za-z_.][\w.]*)/i.exec(source)
                const section = /^\s*(#code|#data|\.?section(?:\s+[^\s;]+)?)/i.exec(source)
                if (macro?.[1]) symbols.push(sourceSymbol(rawLine, path, line, macro[1], 'macro'))
                if (section?.[1]) {
                    const name = section[1].trim()
                    symbols.push(sourceSymbol(rawLine, path, line, name, 'section'))
                }
            }

            const constant = options.z80BareSymbols
                ? /^\s*([A-Za-z_.][\w.]*)\s*:?[ \t]+(?:(?:equ|\.equ|defl)\b|=)/i.exec(source)
                : null
            const colonLabel = /^\s*([A-Za-z_@$.?][\w@$.?]*)\s*:/.exec(source)
            const bareZ80Label =
                options.z80BareSymbols && !constant && !colonLabel
                    ? /^([A-Za-z_.][\w.]*)\b/.exec(source)
                    : null
            const bareZ80Name = bareZ80Label?.[1]?.toLowerCase()
            const label =
                bareZ80Name && options.knownOperations?.has(bareZ80Name)
                    ? null
                    : (constant ?? colonLabel ?? bareZ80Label)
            if (!label?.[1]) return
            const dataDirective =
                /^\s*[A-Za-z_@$.?][\w@$.?]*\s*:\s*(?:d[bdwqtoyzt]|res[bwdqtoyzt]|\.?(?:byte|half|word|float|double|ascii|asciiz|space))\b/i.test(
                    source
                )
            symbols.push(
                sourceSymbol(
                    rawLine,
                    path,
                    line,
                    label[1],
                    constant ? 'constant' : dataDirective ? 'data' : 'label'
                )
            )
        })
    }
    return symbols
}

function includeOnLine(
    line: string,
    options: ProjectAssemblyLanguageOptions
): ProjectInclude | null {
    const source = lineWithoutComment(line, options)
    const pattern =
        options.dialect === 'mars'
            ? /^\s*\.include\s+(["'])(.*?)\1/i
            : options.dialect === 'z80'
              ? /^\s*(?:#include|include)\s+(["'])(.*?)\1/i
              : options.dialect === 'x86'
                ? /^\s*(?:%include|(?:[A-Za-z_@$.?][\w@$.?]*\s*:\s*)?incbin)\s+(["'])(.*?)\1/i
                : null
    const match = pattern?.exec(source)
    if (!match?.[2]) return null
    const quoted = match[0]
    const startColumn = quoted.indexOf(match[2])
    return { path: match[2], startColumn, endColumn: startColumn + match[2].length }
}

function containingDirectory(path: string): string {
    const parts = path.split('/')
    parts.pop()
    return parts.join('/')
}

function resolveProjectInclude(
    containingPath: string,
    writtenPath: string,
    sources: BuildSources
): string | null {
    const directory = containingDirectory(containingPath)
    const candidates = [directory ? `${directory}/${writtenPath}` : writtenPath, writtenPath]
    for (const candidate of candidates) {
        try {
            const normalized = resolveFilePath(candidate)
            if (sources.files[normalized]) return normalized
        } catch {
            // A path which escapes the Project root intentionally has no link or completion target.
        }
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

function symbolAt(
    line: string,
    position: number
): { name: string; start: number; end: number } | null {
    const offset = position - 1
    for (const match of line.matchAll(/[A-Za-z_@$.][\w@$.]*/g)) {
        const start = match.index
        const end = start + match[0].length
        if (offset >= start && offset <= end) return { name: match[0], start, end }
    }
    return null
}

function symbolRange(monaco: MonacoType, symbol: SourceSymbol): monaco.Range {
    return new monaco.Range(
        symbol.line + 1,
        symbol.startColumn + 1,
        symbol.line + 1,
        symbol.endColumn + 1
    )
}

function isOperandContext(prefix: string, options: ProjectAssemblyLanguageOptions): boolean {
    const source = prefix.split(options.comment, 1)[0]
    return /^\s*(?:[A-Za-z_@$.][\w@$.]*\s*:\s*)?[.%A-Za-z_][\w.%]*[ \t]+/.test(source)
}

export function createProjectSymbolCompletionProvider(
    monaco: MonacoType,
    options: ProjectAssemblyLanguageOptions
): monaco.languages.CompletionItemProvider {
    return {
        provideCompletionItems(model, position) {
            const context = contextForModel(model)
            if (!context) return { suggestions: [] }
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const include = includeOnLine(`${prefix}"`, options)
            const includePrefix =
                include ??
                (() => {
                    const source = lineWithoutComment(prefix, options)
                    const match =
                        options.dialect === 'mars'
                            ? /^\s*\.include\s+["']([^"']*)$/i.exec(source)
                            : options.dialect === 'z80'
                              ? /^\s*(?:#include|include)\s+["']([^"']*)$/i.exec(source)
                              : options.dialect === 'x86'
                                ? /^\s*(?:%include|(?:[A-Za-z_@$.?][\w@$.?]*\s*:\s*)?incbin)\s+["']([^"']*)$/i.exec(
                                      source
                                  )
                                : null
                    return match?.[1] !== undefined
                        ? {
                              path: match[1],
                              startColumn: prefix.length - match[1].length,
                              endColumn: prefix.length
                          }
                        : null
                })()
            if (includePrefix) {
                const typed = includePrefix.path
                return {
                    suggestions: Object.keys(context.sources.files)
                        .filter((path) => path !== context.identity.path)
                        .map((path) => ({
                            path,
                            inserted: relativePath(context.identity.path, path)
                        }))
                        .filter(({ inserted }) => inserted.startsWith(typed))
                        .map(({ path, inserted }) => ({
                            label: path,
                            insertText: inserted,
                            detail: 'Project File',
                            kind: monaco.languages.CompletionItemKind.File,
                            range: new monaco.Range(
                                position.lineNumber,
                                includePrefix.startColumn + 1,
                                position.lineNumber,
                                includePrefix.endColumn + 1
                            )
                        }))
                }
            }
            if (!isOperandContext(prefix, options)) return { suggestions: [] }
            const word = model.getWordUntilPosition(position)
            return {
                suggestions: sourceSymbols(context.sources, options)
                    .filter(
                        (symbol) =>
                            !options.excludeCurrentFromCompletion ||
                            symbol.path !== context.identity.path
                    )
                    .filter((symbol) => symbol.name.startsWith(word.word))
                    .map((symbol) => ({
                        label: symbol.name,
                        insertText: symbol.name,
                        detail: `Project ${symbol.kind}`,
                        kind:
                            symbol.kind === 'constant'
                                ? monaco.languages.CompletionItemKind.Constant
                                : monaco.languages.CompletionItemKind.Reference,
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

function projectSymbolKind(monaco: MonacoType, symbol: SourceSymbol) {
    switch (symbol.kind) {
        case 'constant':
            return monaco.languages.SymbolKind.Constant
        case 'macro':
            return monaco.languages.SymbolKind.Method
        case 'section':
            return monaco.languages.SymbolKind.Namespace
        case 'data':
            return monaco.languages.SymbolKind.Field
        default:
            return monaco.languages.SymbolKind.Function
    }
}

export function createProjectDocumentSymbolProvider(
    monaco: MonacoType,
    options: ProjectAssemblyLanguageOptions
): monaco.languages.DocumentSymbolProvider {
    return {
        provideDocumentSymbols(model) {
            const context = contextForModel(model)
            if (!context) return []
            return sourceSymbols(context.sources, options)
                .filter((symbol) => symbol.path === context.identity.path)
                .map((symbol) => {
                    const range = symbolRange(monaco, symbol)
                    return {
                        name: symbol.name,
                        detail: symbol.kind,
                        kind: projectSymbolKind(monaco, symbol),
                        tags: [],
                        range,
                        selectionRange: range
                    }
                })
        }
    }
}

export function createProjectSymbolHoverProvider(
    monaco: MonacoType,
    options: ProjectAssemblyLanguageOptions
): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const context = contextForModel(model)
            if (!context) return null
            const token = symbolAt(model.getLineContent(position.lineNumber), position.column)
            if (!token) return null
            const matches = sourceSymbols(context.sources, options).filter(
                (symbol) => symbol.name.toLowerCase() === token.name.toLowerCase()
            )
            if (matches.length !== 1) return null
            const symbol = matches[0]!
            return {
                range: new monaco.Range(
                    position.lineNumber,
                    token.start + 1,
                    position.lineNumber,
                    token.end + 1
                ),
                contents: [
                    {
                        value: `**${symbol.kind}:** \`${symbol.name}\`\n\nDefined in \`${symbol.path}:${symbol.line + 1}\``
                    }
                ]
            }
        }
    }
}

export function createProjectDocumentLinkProvider(
    monaco: MonacoType,
    options: ProjectAssemblyLanguageOptions
): monaco.languages.LinkProvider {
    return {
        provideLinks(model) {
            const context = contextForModel(model)
            if (!context) return { links: [] }
            const links: monaco.languages.ILink[] = []
            for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
                const include = includeOnLine(model.getLineContent(lineNumber), options)
                if (!include) continue
                const target = resolveProjectInclude(
                    context.identity.path,
                    include.path,
                    context.sources
                )
                if (!target) continue
                links.push({
                    range: new monaco.Range(
                        lineNumber,
                        include.startColumn + 1,
                        lineNumber,
                        include.endColumn + 1
                    ),
                    url: projectSourceUri(monaco, { ...context.identity, path: target }),
                    tooltip: `Open ${target}`
                })
            }
            return { links }
        }
    }
}

export function createProjectDefinitionProvider(
    monaco: MonacoType,
    options: ProjectAssemblyLanguageOptions
): monaco.languages.DefinitionProvider {
    return {
        provideDefinition(model, position) {
            const context = contextForModel(model)
            if (!context) return null
            const token = symbolAt(model.getLineContent(position.lineNumber), position.column)
            if (!token) return null
            const definitions = sourceSymbols(context.sources, options).filter(
                (symbol) => symbol.name === token.name
            )
            if (definitions.length !== 1) return null
            const definition = definitions[0]
            const identity: ProjectModelIdentity = { ...context.identity, path: definition.path }
            return {
                uri: projectSourceUri(monaco, identity),
                range: symbolRange(monaco, definition)
            }
        }
    }
}
