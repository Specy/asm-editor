import { S68k, type Location, type ProgramSymbol } from '@specy/s68k'
import {
    m68kAssemblyFiles,
    m68kWrittenPath,
    resolveM68kFile
} from '$lib/languages/M68K/m68kAssemblyFiles'
import {
    s68kColumnToUtf16,
    s68kDiagnosticToLanguageDiagnostic
} from '$lib/languages/M68K/m68kDiagnostics'
import { fileText, type BuildSources } from '$lib/projectFiles'
import type { LanguageSymbol, M68kAnalysisSnapshot, M68kFileAnalysisStatus } from '../protocol'
import type { SourceLocation, SymbolKind } from '../sourceModel'

function lineAt(sources: BuildSources, path: string, line: number): string {
    const file = sources.files[path]
    if (!file) return ''
    try {
        return fileText(file).split(/\r?\n/)[line] ?? ''
    } catch {
        return ''
    }
}

function sourceLocation(sources: BuildSources, location: Location): SourceLocation {
    const line = lineAt(sources, location.file, location.line)
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

function reachableFiles(sources: BuildSources): Set<string> {
    const reachable = new Set<string>()
    const pending = [sources.entry]
    while (pending.length > 0) {
        const path = pending.pop()!
        if (reachable.has(path) || !sources.files[path]) continue
        reachable.add(path)
        const file = sources.files[path]
        if (file.encoding !== 'plain') continue
        for (const line of file.content.split(/\r?\n/)) {
            const operation = S68k.parseLine(line).operation
            const name = operation?.name.toLowerCase()
            if ((name !== 'include' && name !== 'incbin') || !operation?.text) continue
            const target = resolveM68kFile(path, m68kWrittenPath(operation.text.text), sources)
            if (!target) continue
            if (name === 'include') pending.push(target)
            else reachable.add(target)
        }
    }
    return reachable
}

function tolerantSymbols(sources: BuildSources): LanguageSymbol[] {
    const symbols: LanguageSymbol[] = []
    for (const [path, file] of Object.entries(sources.files)) {
        if (file.encoding !== 'plain') continue
        file.content.split(/\r?\n/).forEach((line, lineIndex) => {
            const parsed = S68k.parseLine(line)
            const label = parsed.label
            if (!label) return
            const operation = parsed.operation?.name.toLowerCase()
            const kind: SymbolKind =
                operation === 'equ'
                    ? 'constant'
                    : operation === 'set'
                      ? 'variable'
                      : operation === 'reg'
                        ? 'register-list'
                        : operation?.startsWith('dc') || operation?.startsWith('ds')
                          ? 'data'
                          : 'label'
            const start = s68kColumnToUtf16(line, label.span.start)
            const end = s68kColumnToUtf16(line, label.span.end)
            symbols.push({
                id: `tolerant:${path}:${lineIndex}:${start}:${label.name}`,
                name: label.name,
                kind,
                location: {
                    path,
                    range: {
                        start: { line: lineIndex, column: start },
                        end: { line: lineIndex, column: end }
                    }
                }
            })
        })
    }
    return symbols
}

function coreSymbolKind(kind: ProgramSymbol['kind']): SymbolKind {
    return kind === 'register_list' ? 'register-list' : kind
}

export function analyzeM68kProject(
    sources: BuildSources,
    sessionId: string,
    revision: number
): M68kAnalysisSnapshot {
    const reachable = reachableFiles(sources)
    const fileStatus: Record<string, M68kFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] =
            file.encoding !== 'plain'
                ? 'binary'
                : reachable.has(path)
                  ? 'assembled'
                  : 'not-reachable'
    }

    const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
    try {
        const tolerant = tolerantSymbols(sources)
        const authoritative = result.program
            ? Object.values(result.program.getSymbols()).map((symbol) => ({
                  id: `s68k:${symbol.name}:${symbol.location.file}:${symbol.location.line}:${symbol.location.column}`,
                  name: symbol.name,
                  kind: coreSymbolKind(symbol.kind),
                  value: symbol.value,
                  location: sourceLocation(sources, symbol.location)
              }))
            : []
        const locationKey = (symbol: LanguageSymbol) =>
            `${symbol.location.path}:${symbol.location.range.start.line}:${symbol.location.range.start.column}`
        const tolerantByLocation = new Map(tolerant.map((symbol) => [locationKey(symbol), symbol]))
        const merged = authoritative.map((symbol) => {
            const written = tolerantByLocation.get(locationKey(symbol))
            return written ? { ...symbol, name: written.name } : symbol
        })
        const authoritativeLocations = new Set(authoritative.map(locationKey))
        return {
            sessionId,
            revision,
            target: 'M68K',
            diagnostics: result.diagnostics.map((diagnostic) =>
                s68kDiagnosticToLanguageDiagnostic(diagnostic, sources)
            ),
            symbols: [
                ...merged,
                ...tolerant.filter(
                    (symbol) =>
                        !authoritativeLocations.has(
                            `${symbol.location.path}:${symbol.location.range.start.line}:${symbol.location.range.start.column}`
                    )
                )
            ],
            occurrences: [],
            fileStatus
        }
    } finally {
        result.program?.dispose()
    }
}
