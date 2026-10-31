import type { X86Project } from '@specy/x86'
import {
    fileBytes,
    fileText,
    ProjectFormatError,
    resolveFilePath,
    resolveProjectInclude,
    type BuildSources
} from '#lib/projectFiles.ts'
import { splitAssemblyComment } from '#lib/languages/service/assemblyText.ts'
import {
    ENVIRONMENT_INCLUDE_ROOT,
    environmentFileName,
    environmentFilePath,
    environmentNasmIncludes,
    loadEnvironmentFiles,
    loadedEnvironmentFiles
} from '#lib/sourceRuntime/environmentLibrary.ts'

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
 * The include path a Build gives NASM, where it stages the NASM include files of
 * [ADR 0070](../../../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)
 * (`linux/fb.inc`, `sys/mman.inc`): the directory the editor shows them under, read-only, so that
 * the Core names one, in a diagnostic, an instruction or a Breakpoint, by the path the editor shows
 * it at, `@runtime/include/linux/fb.inc`.
 */
export const X86_INCLUDE_PATH = ENVIRONMENT_INCLUDE_ROOT.slice(0, -1)

/** NASM's directives that search the include path. */
const INCLUDE_DIRECTIVE = /%(?:include|pathsearch|depend)\b|\bincbin\b/i

/** Loads (once) the include files a Build stages, for `x86CoreProject` and the include walk. */
export async function loadX86Includes(): Promise<void> {
    await loadEnvironmentFiles('X86')
}

let nasmIncludes:
    | { files: Readonly<Record<string, string>>; nasm: Readonly<Record<string, string>> }
    | undefined

/**
 * The NASM include files by the path a `%include` writes (`linux/fb.inc`), once `loadX86Includes`
 * has loaded them, and undefined before.
 */
export function loadedX86Includes(): Readonly<Record<string, string>> | undefined {
    const files = loadedEnvironmentFiles('X86')
    if (!files) return undefined
    if (nasmIncludes?.files !== files)
        nasmIncludes = { files, nasm: environmentNasmIncludes(files) }
    return nasmIncludes.nasm
}

let shownIncludes: Promise<Readonly<Record<string, string>>> | undefined

/**
 * The include files by the path a `%include` writes, `linux/fb.inc`, each with the read-only path
 * the editor shows it at, for the editor's links and completion.
 */
export function x86SystemIncludes(): Promise<Readonly<Record<string, string>>> {
    shownIncludes ??= loadX86Includes().then(() =>
        Object.fromEntries(
            Object.keys(loadedX86Includes() ?? {}).map((name) => [name, environmentFilePath(name)])
        )
    )
    return shownIncludes
}

/** The text of the include file the editor shows at `path` (`@runtime/include/linux/fb.inc`). */
export function x86IncludeText(path: string): string | undefined {
    const name = environmentFileName(path)
    const names = loadedX86Includes()
    return name !== undefined && names && Object.hasOwn(names, name) ? names[name] : undefined
}

/**
 * The include file a `%include` or `incbin` of `writtenPath` reaches when no File does, by its name
 * under the include path, or null.
 */
export function x86IncludeName(
    writtenPath: string,
    names: Readonly<Record<string, string>> | undefined = loadedX86Includes()
): string | null {
    //an absolute path is never searched for
    if (!names || writtenPath.startsWith('/')) return null
    try {
        const name = resolveFilePath(writtenPath)
        return Object.hasOwn(names, name) ? name : null
    } catch {
        return null
    }
}

/**
 * The Core's Project with the include files staged under the include path, when a File of the Build
 * names a directive that searches it. Staging them costs every unit the Core assembles, a Runtime
 * library's hundreds included, so a Build none of whose Files names one goes without them.
 */
export function withX86Includes(project: X86Project, sources: BuildSources): X86Project {
    const reads = Object.values(sources.files).some(
        (file) => file.encoding === 'plain' && INCLUDE_DIRECTIVE.test(file.content)
    )
    if (!reads) return project
    const names = loadedX86Includes()
    if (!names) throw new ProjectFormatError('The x86 include files are not loaded')
    return {
        ...project,
        files: {
            ...project.files,
            ...Object.fromEntries(
                Object.entries(names).map(([name, text]) => [environmentFilePath(name), text])
            )
        },
        includePaths: [X86_INCLUDE_PATH]
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
 * when it needs a symbol they define ([ADR 0033](../../../../../../docs/adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)).
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

/**
 * Files assembled as translation units or read by literal `%include`/`incbin` directives.
 * NASM owns compilation and diagnostics; this walk only supplies editor file-status hints.
 * An incomplete Entry walk makes reachability unknown. Secondary units may still add Files
 * even when their own includes cannot all be resolved. An include file the include path holds,
 * `%include "linux/fb.inc"`, is found, though no File of the Project.
 */
export function x86ReachableFiles(
    sources: BuildSources,
    names: Readonly<Record<string, string>> | undefined = loadedX86Includes()
): Set<string> | undefined {
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
            const target = resolveProjectInclude(path, directive[2] ?? '', sources)
            //an include file of the include path is no File, and reaches none
            if (!target) complete &&= x86IncludeName(directive[2] ?? '', names) !== null
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
