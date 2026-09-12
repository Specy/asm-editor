import { fileBytes, fileText, resolveFilePath, type BuildSources } from '$lib/projectFiles'
import { splitAssemblyComment } from '$lib/languages/service/assemblyText'

export type X86ProjectInput = {
    entry: string
    files: Readonly<Record<string, string | Uint8Array>>
}

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

const LEGACY_VIRTUAL_ROOT = '/__asm_editor_project'
const stagedFiles = new WeakMap<object, Set<string>>()
const pathEncoder = new TextEncoder()

/** Converts persisted Project Files into the x86 Core's virtual-Project representation. */
export function toX86Project(sources: BuildSources): X86ProjectInput {
    return {
        entry: sources.entry,
        files: Object.fromEntries(
            Object.entries(sources.files).map(([path, file]) => [
                path,
                file.encoding === 'plain' ? file.content : fileBytes(file)
            ])
        )
    }
}

function virtualPath(path: string): string {
    const encoded = [...pathEncoder.encode(path)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    return `${LEGACY_VIRTUAL_ROOT}/${encoded}`
}

/** Compatibility staging for released x86 packages that predate the virtual-Project API. */
export function stageLegacyX86ProjectFiles(
    module: X86WasmModule,
    expanded: ExpandedX86Project
): void {
    const previous = stagedFiles.get(module) ?? new Set<string>()
    const current = new Set(expanded.virtualFiles.keys())
    for (const path of previous) {
        if (current.has(path)) continue
        try {
            module.FS.unlink?.(path)
        } catch {
            // A recreated filesystem or absent stale path is already in the correct state.
        }
    }
    module.FS.mkdirTree?.(LEGACY_VIRTUAL_ROOT)
    for (const [path, bytes] of expanded.virtualFiles) module.FS.writeFile(path, bytes)
    stagedFiles.set(module, current)
}

/**
 * Extensions that make a File assembler input in its own right, mirroring the rule the Core
 * applies when it decides what to assemble. `.inc` is absent from both: it is what an include
 * fragment is conventionally called, and a fragment is assembled as part of whatever includes it.
 */
const SOURCE_EXTENSIONS = ['.asm', '.s', '.nasm']

/**
 * The Files the Core assembles separately and links together, which is what makes `global` in one
 * File resolve an `extern` in another. This is the editor's own view of the build, for telling
 * someone which Files are part of their program; NASM still decides what it reads and `ld` still
 * decides what links.
 */
export function x86TranslationUnits(sources: BuildSources): string[] {
    const others = Object.keys(sources.files)
        .filter((path) => path !== sources.entry)
        .filter((path) => sources.files[path]?.encoding === 'plain')
        .filter((path) =>
            SOURCE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
        )
        .sort()
    return [sources.entry, ...others]
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
 * Compatibility expansion for the currently published single-buffer x86 package. New local Core
 * builds use `compileProject`/`checkProject`; this fallback keeps npm deployments functional until
 * that package release is available.
 */
export function expandLegacyX86Project(sources: BuildSources): ExpandedX86Project {
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
        fileText(file)
            .split(/\r?\n/)
            .forEach((line, lineIndex) => {
                const source = splitAssemblyComment(line, ';').code
                const binary = /^\s*(?:[A-Za-z_@$.?][\w@$.?]*\s*:\s*)?incbin\s+(["'])(.*?)\1/i.exec(
                    source
                )
                if (binary) {
                    const written = binary[2] ?? ''
                    const column = Math.max(0, binary[0].lastIndexOf(written))
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
