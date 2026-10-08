import { resolveFilePath } from '$lib/projectFiles'
import type { SourceHelpContext } from './context'
import type { IncludeContext } from './scan'

export type IncludeSuggestion = { name: string; path?: string; summary: string }

export function includeSuggestions(
    context: SourceHelpContext,
    include: IncludeContext
): IncludeSuggestion[] {
    if (!context.capabilities) return []
    if (include.kind === 'system') {
        const headers =
            context.language === 'cpp'
                ? context.capabilities.headers.cpp
                : context.capabilities.headers.c
        return headers
            .filter((name) => name.startsWith(include.prefix))
            .map((name) => ({ name, summary: 'Header supplied for this Target.' }))
    }
    if (!context.identity || !context.sources) return []
    const source = context.identity.path
    const directory = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : ''
    const files = context.sources.files
    const headers = Object.keys(files).filter(
        (path) => files[path].encoding === 'plain' && /\.(h|hpp|hh|hxx|inc)$/i.test(path)
    )
    const headerPaths = new Set(headers)
    const result = new Map<string, IncludeSuggestion>()
    const offer = (name: string) => {
        if (result.has(name) || !name.startsWith(include.prefix)) return
        for (const base of [directory, '']) {
            let path: string
            try {
                path = resolveFilePath(base ? `${base}/${name}` : name)
            } catch {
                continue
            }
            if (headerPaths.has(path)) {
                result.set(name, { name, path, summary: `Project header: ${path}` })
                return
            }
        }
    }
    // First the source directory, then the Project root, exactly as Compile's -iquote search.
    if (directory)
        for (const path of headers)
            if (path.startsWith(`${directory}/`)) offer(path.slice(directory.length + 1))
    for (const path of headers) offer(path)
    if (include.prefix.startsWith('./')) {
        if (directory)
            for (const path of headers)
                if (path.startsWith(`${directory}/`)) offer(`./${path.slice(directory.length + 1)}`)
        for (const path of headers) offer(`./${path}`)
    }
    // Support an explicitly typed ../ path; never offer paths outside the Project.
    if (directory && include.prefix.startsWith('../')) {
        const from = directory.split('/')
        for (const path of headers) {
            const to = path.split('/')
            let common = 0
            while (common < from.length && from[common] === to[common]) common++
            offer('../'.repeat(from.length - common) + to.slice(common).join('/'))
        }
    }
    return [...result.values()]
}
