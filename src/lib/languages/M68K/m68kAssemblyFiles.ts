import { S68k } from '@specy/s68k'
import { assemblyFiles, fileBytes, type BuildSources } from '$lib/projectFiles'

/**
 * Prepares the exact source/byte view consumed by S68K. Text Files need a private byte alias when
 * they are read through `incbin`, because the Project's byte contract is UTF-8 while S68K 2.1
 * otherwise interprets a string as Latin-1. The aliases never escape this Core adapter.
 */
export function m68kAssemblyFiles(sources: BuildSources): Record<string, string | Uint8Array> {
    const files = assemblyFiles(sources)
    const aliases: Record<string, string> = Object.create(null)
    let nextAlias = 0
    const aliasFor = (path: string) => {
        const existing = aliases[path]
        if (existing) return existing
        let alias: string
        do alias = `.asm-editor-incbin/${nextAlias++}`
        while (alias in files)
        aliases[path] = alias
        files[alias] = fileBytes(sources.files[path])
        return alias
    }

    for (const [sourcePath, contents] of Object.entries(files)) {
        if (typeof contents !== 'string' || sourcePath.startsWith('.asm-editor-incbin/')) continue
        files[sourcePath] = contents
            .split('\n')
            .map((line) => {
                const operation = S68k.parseLine(line).operation
                const field = operation?.text
                if (operation?.name.toLowerCase() !== 'incbin' || !field) return line
                const target = resolveM68kFile(sourcePath, m68kWrittenPath(field.text), sources)
                if (!target) return line
                const alias = aliasFor(target)
                return `${line.slice(0, field.span.start)}"${alias}"${line.slice(field.span.end)}`
            })
            .join('\n')
    }
    return files
}

export function m68kWrittenPath(field: string): string {
    const trimmed = field.trim()
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' || first === "'") && last === first) {
        return trimmed.slice(1, -1).split(`${first}${first}`).join(first)
    }
    return trimmed
}

/** Resolves includes with S68K's beside-the-containing-File, then Project-root order. */
export function resolveM68kFile(
    sourcePath: string,
    written: string,
    sources: BuildSources
): string | null {
    const slash = sourcePath.lastIndexOf('/')
    const directory = slash < 0 ? '' : sourcePath.slice(0, slash)
    const beside = joinM68kPath(directory, written)
    if (beside in sources.files) return beside
    const root = joinM68kPath('', written)
    return root in sources.files ? root : null
}

/** Text source Files reached through `include`, starting from one translation-unit root. */
export function m68kIncludedSourceFiles(
    sources: BuildSources,
    entry: string = sources.entry
): Set<string> {
    const included = new Set<string>()
    const pending = [entry]
    while (pending.length > 0) {
        const path = pending.pop()!
        if (included.has(path)) continue
        const file = sources.files[path]
        if (!file || file.encoding !== 'plain') continue
        included.add(path)
        for (const line of file.content.split(/\r?\n/)) {
            const operation = S68k.parseLine(line).operation
            if (operation?.name.toLowerCase() !== 'include' || !operation.text) continue
            const target = resolveM68kFile(path, m68kWrittenPath(operation.text.text), sources)
            if (target) pending.push(target)
        }
    }
    return included
}

/** Source and binary Files consumed by an M68K Build. */
export function m68kReachableFiles(sources: BuildSources): Set<string> {
    const reachable = m68kIncludedSourceFiles(sources)
    for (const path of [...reachable]) {
        const file = sources.files[path]
        if (file?.encoding !== 'plain') continue
        for (const line of file.content.split(/\r?\n/)) {
            const operation = S68k.parseLine(line).operation
            if (operation?.name.toLowerCase() !== 'incbin' || !operation.text) continue
            const target = resolveM68kFile(path, m68kWrittenPath(operation.text.text), sources)
            if (target) reachable.add(target)
        }
    }
    return reachable
}

function joinM68kPath(base: string, written: string): string {
    const parts: string[] = []
    for (const part of [...base.split('/'), ...written.split(/[\\/]/)]) {
        if (!part || part === '.') continue
        if (part === '..') parts.pop()
        else parts.push(part)
    }
    return parts.join('/')
}
