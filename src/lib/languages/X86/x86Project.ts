import { fileBytes, fileText, resolveFilePath, type BuildSources } from '$lib/projectFiles'
import { splitAssemblyComment } from '$lib/languages/service/assemblyText'

export type X86SourceLine = { path: string; line: number }

export type X86ProjectDiagnostic = {
    path: string
    line: number
    column: number
    message: string
}

export type ExpandedX86Project = {
    code: string
    lineMap: X86SourceLine[]
    reached: Set<string>
    /** Absolute WASM paths for literal `incbin` assets referenced by the expanded source. */
    virtualFiles: Map<string, Uint8Array>
    diagnostics: X86ProjectDiagnostic[]
}

type X86WasmModule = {
    FS: {
        writeFile(path: string, data: string | Uint8Array): void
        mkdirTree?: (path: string) => void
        unlink?: (path: string) => void
    }
}

const VIRTUAL_ROOT = '/__asm_editor_project'
const stagedFiles = new WeakMap<object, Set<string>>()
const pathEncoder = new TextEncoder()

/** A collision-free ASCII name: Project paths themselves may contain either quote character. */
function virtualPath(path: string): string {
    const encoded = [...pathEncoder.encode(path)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    return `${VIRTUAL_ROOT}/${encoded}`
}

/**
 * Makes literal `incbin` targets visible to NASM's in-memory filesystem. The package exposes its
 * Emscripten module but has no Project compile API yet, so stale files are explicitly removed when
 * its long-lived diagnostic Core is reused for another Project.
 */
export function stageX86ProjectFiles(module: X86WasmModule, expanded: ExpandedX86Project): void {
    const previous = stagedFiles.get(module) ?? new Set<string>()
    const current = new Set(expanded.virtualFiles.keys())
    for (const path of previous) {
        if (current.has(path)) continue
        try {
            module.FS.unlink?.(path)
        } catch {
            // The Core may have recreated its filesystem; the absent stale path is already correct.
        }
    }
    module.FS.mkdirTree?.(VIRTUAL_ROOT)
    for (const [path, bytes] of expanded.virtualFiles) module.FS.writeFile(path, bytes)
    stagedFiles.set(module, current)
}

function resolveInclude(
    containingPath: string,
    writtenPath: string,
    sources: BuildSources
): string | null {
    const parts = containingPath.split('/')
    parts.pop()
    const directory = parts.join('/')
    const candidates = [directory ? `${directory}/${writtenPath}` : writtenPath, writtenPath]
    for (const candidate of candidates) {
        try {
            const path = resolveFilePath(candidate)
            if (sources.files[path]) return path
        } catch {
            // Escaping and malformed paths are reported on the include directive below.
        }
    }
    return null
}

/**
 * NASM's package API currently accepts one source buffer. `%include` itself is textual, so the
 * Project adapter expands literal source includes before handing that buffer to the Core and keeps
 * an exact line map for diagnostics, execution locations and breakpoints. Macro-computed include
 * names intentionally remain unsupported until the Core accepts a virtual file system.
 */
export function expandX86Project(sources: BuildSources): ExpandedX86Project {
    const output: string[] = []
    const lineMap: X86SourceLine[] = []
    const reached = new Set<string>()
    const virtualFiles = new Map<string, Uint8Array>()
    const diagnostics: X86ProjectDiagnostic[] = []

    const append = (text: string, path: string, line: number) => {
        output.push(text)
        lineMap.push({ path, line })
    }

    const expand = (path: string, stack: string[]) => {
        const file = sources.files[path]
        if (!file) return
        if (file.encoding !== 'plain') {
            diagnostics.push({
                path: stack[stack.length - 1] ?? sources.entry,
                line: 0,
                column: 0,
                message: `%include can only read a text File; ${path} is binary`
            })
            return
        }
        reached.add(path)
        const lines = fileText(file).split(/\r?\n/)
        lines.forEach((line, lineIndex) => {
            const source = splitAssemblyComment(line, ';').code
            const binaryDirective =
                /^\s*(?:[A-Za-z_@$.?][\w@$.?]*\s*:\s*)?incbin\s+(["'])(.*?)\1/i.exec(source)
            if (binaryDirective) {
                const written = binaryDirective[2] ?? ''
                // A label can have the same spelling as the File. Locate the captured quoted path,
                // not the first matching text on the line.
                const column = Math.max(0, binaryDirective[0].lastIndexOf(written))
                const target = resolveInclude(path, written, sources)
                if (!target) {
                    diagnostics.push({
                        path,
                        line: lineIndex,
                        column,
                        message: `Binary File not found in Project: ${written}`
                    })
                    append('', path, lineIndex)
                    return
                }
                const targetPath = virtualPath(target)
                virtualFiles.set(targetPath, fileBytes(sources.files[target]!))
                reached.add(target)
                append(
                    `${line.slice(0, column)}${targetPath}${line.slice(column + written.length)}`,
                    path,
                    lineIndex
                )
                return
            }
            const directive = /^\s*%include\s+(["'])(.*?)\1/i.exec(source)
            if (!directive) {
                append(line, path, lineIndex)
                return
            }
            const written = directive[2] ?? ''
            const column = Math.max(0, line.indexOf(written))
            const target = resolveInclude(path, written, sources)
            if (!target) {
                diagnostics.push({
                    path,
                    line: lineIndex,
                    column,
                    message: `Included File not found in Project: ${written}`
                })
                append('', path, lineIndex)
                return
            }
            const cycleStart = stack.indexOf(target)
            if (cycleStart >= 0) {
                diagnostics.push({
                    path,
                    line: lineIndex,
                    column,
                    message: `Include cycle: ${[...stack.slice(cycleStart), target].join(' -> ')}`
                })
                append('', path, lineIndex)
                return
            }
            expand(target, [...stack, target])
        })
    }

    if (!sources.files[sources.entry]) {
        diagnostics.push({
            path: sources.entry,
            line: 0,
            column: 0,
            message: `Entry File not found: ${sources.entry}`
        })
    } else {
        expand(sources.entry, [sources.entry])
    }
    return { code: output.join('\n'), lineMap, reached, virtualFiles, diagnostics }
}

export function x86SourceLineAt(
    lineMap: readonly X86SourceLine[],
    generatedLine: number,
    fallbackPath: string
): X86SourceLine {
    if (!Number.isInteger(generatedLine) || generatedLine < 0) {
        return { path: fallbackPath, line: -1 }
    }
    return lineMap[generatedLine] ?? { path: fallbackPath, line: generatedLine }
}

export function x86GeneratedLinesFor(
    lineMap: readonly X86SourceLine[],
    path: string,
    line: number
): number[] {
    const result: number[] = []
    lineMap.forEach((source, generated) => {
        if (source.path === path && source.line === line) result.push(generated)
    })
    return result
}
