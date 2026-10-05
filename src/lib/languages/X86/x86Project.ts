import type { X86Project } from '@specy/x86'
import { fileBytes, fileText, resolveFilePath, type BuildSources } from '$lib/projectFiles'
import { splitAssemblyComment } from '$lib/languages/service/assemblyText'

/** Converts persisted Project Files into the x86 Core's virtual-Project representation. */
export function toX86Project(sources: BuildSources): X86Project {
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

/**
 * Extensions that make a File assembler input in its own right, mirroring the rule the Core
 * applies when it decides what to assemble. `.inc` is absent from both: it is what an include
 * fragment is conventionally called, and a fragment is assembled as part of whatever includes it.
 */
const SOURCE_EXTENSIONS = ['.asm', '.s', '.nasm']

/**
 * The Files the Core assembles separately, which is what makes `global` in one File resolve an
 * `extern` in another. The Entry's links into the program, and since `@specy/x86` 4 the others only
 * when it needs a symbol they define ([ADR 0033](../../../../docs/adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)).
 * This is the editor's own view of the build, for telling someone which Files are part of their
 * program; NASM still decides what it reads and `ld` still decides what links.
 */
function x86TranslationUnits(sources: BuildSources): string[] {
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
            // NASM reports escaping and malformed paths in its own diagnostics.
        }
    }
    return null
}

/**
 * Files assembled as translation units or read by literal `%include`/`incbin` directives.
 * NASM owns compilation and diagnostics; this walk only supplies editor file-status hints.
 * An incomplete Entry walk makes reachability unknown. Secondary units may still add Files
 * even when their own includes cannot all be resolved.
 */
export function x86ReachableFiles(sources: BuildSources): Set<string> | undefined {
    const reached = new Set<string>()
    const walk = (path: string, stack: Set<string>): boolean => {
        const file = sources.files[path]
        if (!file || file.encoding !== 'plain' || stack.has(path)) return false
        reached.add(path)
        stack.add(path)
        let complete = true
        for (const line of fileText(file).split(/\r?\n/)) {
            const source = splitAssemblyComment(line, ';').code
            const binary = /^\s*(?:[A-Za-z_@$.?][\w@$.?]*\s*:\s*)?incbin\s+(["'])(.*?)\1/i.exec(
                source
            )
            const include = binary ? null : /^\s*%include\s+(["'])(.*?)\1/i.exec(source)
            const directive = binary ?? include
            if (!directive) continue
            const target = resolveInclude(path, directive[2] ?? '', sources)
            if (!target) complete = false
            else if (binary) reached.add(target)
            else if (!walk(target, stack)) complete = false
        }
        stack.delete(path)
        return complete
    }
    try {
        if (!walk(sources.entry, new Set())) return undefined
        for (const path of x86TranslationUnits(sources)) {
            if (!reached.has(path)) walk(path, new Set())
        }
        return reached
    } catch {
        // An include walk that exceeds the stack limit cannot supply reliable file statuses.
        return undefined
    }
}
