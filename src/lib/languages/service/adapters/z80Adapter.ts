import { assemble, SymbolType, type AssemblyResult, type SymbolAppearance } from '@specy/z80'
import { assemblyFiles, fileText, resolveFilePath, type BuildSources } from '$lib/projectFiles'
import type {
    LanguageSymbol,
    ProjectAnalysisSnapshot,
    ProjectFileAnalysisStatus
} from '../protocol'
import type { SourceLocation, SymbolKind, SymbolOccurrence } from '../sourceModel'

function normalizedPath(path: string, sources: BuildSources): string {
    try {
        const normalized = resolveFilePath(path.replace(/^\.\//, ''))
        return sources.files[normalized] ? normalized : path
    } catch {
        return path
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

function directAppearanceLocation(
    appearance: SymbolAppearance,
    sources: BuildSources
): SourceLocation | null {
    const assembledLine = appearance.assembledLine
    if (!assembledLine || assembledLine.lineNumber === undefined) return null
    const path = normalizedPath(assembledLine.fileInfo.pathname, sources)
    const length = appearance.symbol.name.length
    return {
        path,
        range: {
            start: { line: assembledLine.lineNumber, column: appearance.column },
            end: { line: assembledLine.lineNumber, column: appearance.column + length }
        }
    }
}

function symbolKind(type: SymbolType): SymbolKind {
    if (type === SymbolType.CONSTANT) return 'constant'
    if (type === SymbolType.BYTE || type === SymbolType.WORD || type === SymbolType.ARRAY) {
        return 'data'
    }
    return 'label'
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
    const unique = new Map<string, SourceLocation>()
    for (const location of locations) {
        unique.set(
            `${location.path}:${location.range.start.line}:${location.range.start.column}:${location.range.end.column}`,
            location
        )
    }
    return [...unique.values()]
}

function expansionLocation(
    result: AssemblyResult,
    message: string,
    sources: BuildSources
): SourceLocation | null {
    for (const line of result.asm.assembledLines) {
        if (line.lineNumber !== undefined || line.error !== message) continue
        for (let source = line.expandedFrom; source; source = source.expandedFrom) {
            if (source.lineNumber === undefined) continue
            const path = normalizedPath(source.fileInfo.pathname, sources)
            const text = lineText(sources, path, source.lineNumber)
            return {
                path,
                range: {
                    start: { line: source.lineNumber, column: 0 },
                    end: { line: source.lineNumber, column: text.length }
                }
            }
        }
    }
    return null
}

export function analyzeZ80Project(
    sources: BuildSources,
    sessionId: string,
    revision: number
): ProjectAnalysisSnapshot {
    const result = assemble(assemblyFiles(sources), { entryPathname: sources.entry })
    const reached = new Set(
        result.asm.assembledLines.map((line) => normalizedPath(line.fileInfo.pathname, sources))
    )
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] =
            file.encoding !== 'plain' ? 'binary' : reached.has(path) ? 'assembled' : 'not-reachable'
    }

    const diagnostics = result.diagnostics.map((diagnostic) => {
        const path = normalizedPath(diagnostic.pathname, sources)
        const line = diagnostic.lineNumber ?? 0
        const direct =
            diagnostic.lineNumber === undefined
                ? null
                : {
                      path,
                      range: {
                          start: { line, column: 0 },
                          end: { line, column: lineText(sources, path, line).length }
                      }
                  }
        return {
            severity: 'error' as const,
            source: 'z80',
            location: direct ??
                expansionLocation(result, diagnostic.message, sources) ?? {
                    path,
                    range: {
                        start: { line: 0, column: 0 },
                        end: { line: 0, column: lineText(sources, path, 0).length }
                    }
                },
            message: diagnostic.message
        }
    })

    const symbols: LanguageSymbol[] = []
    const occurrences: SymbolOccurrence[] = []
    result.asm.symbols.forEach((symbol, symbolIndex) => {
        const id = `z80:${symbol.name}:${symbolIndex}`
        const definitions = uniqueLocations(
            symbol.definitions.flatMap((appearance) => {
                const location = directAppearanceLocation(appearance, sources)
                return location ? [location] : []
            })
        )
        const references = uniqueLocations(
            symbol.references.flatMap((appearance) => {
                const location = directAppearanceLocation(appearance, sources)
                return location ? [location] : []
            })
        )
        const renameable =
            !symbol.changesValue &&
            definitions.length === symbol.definitions.length &&
            references.length === symbol.references.length &&
            definitions.length > 0
        for (const location of definitions) {
            symbols.push({
                id,
                name: symbol.originalSpelling,
                kind: symbolKind(symbol.type),
                value: symbol.value,
                renameable,
                location
            })
            occurrences.push({
                symbolId: id,
                name: symbol.originalSpelling,
                kind: symbolKind(symbol.type),
                role: 'definition',
                location
            })
        }
        for (const location of references) {
            occurrences.push({
                symbolId: id,
                name: symbol.originalSpelling,
                kind: symbolKind(symbol.type),
                role: 'reference',
                location
            })
        }
    })

    return {
        sessionId,
        revision,
        target: 'Z80',
        diagnostics,
        symbols,
        occurrences,
        fileStatus
    }
}
