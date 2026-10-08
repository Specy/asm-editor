import { resolveFilePath, type ProjectFiles } from '$lib/projectFiles'
import { fileFingerprint } from './fingerprints'

/**
 * Track quoted local includes recursively; computed includes conservatively depend on all headers.
 * An angle-bracket include never reads a Project File, as the request searches the Project only
 * for quoted ones.
 */
export function compilationInputs(
    sourcePath: string,
    files: ProjectFiles
): Readonly<Record<string, string>> {
    const headers = Object.keys(files).filter(
        (path) => /\.(h|hpp|hh|hxx|inc)$/i.test(path) && files[path].encoding === 'plain'
    )
    const sourceDirectory = sourcePath.includes('/')
        ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)
        : ''
    const seen = new Set<string>()
    const visit = (path: string) => {
        if (seen.has(path)) return
        seen.add(path)
        const content = files[path]?.content ?? ''
        // Comments cannot introduce an include dependency. Preserve newlines for the directive scan.
        const text = content
            .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
            .replace(/\/\/[^\n]*/g, '')
        for (const match of text.matchAll(/^\s*#\s*include\s+([^\n]+)/gm)) {
            if (match[1].startsWith('<')) continue
            const include = /^"([^"]+)"/.exec(match[1])
            if (!include) {
                for (const header of headers) visit(header)
                continue
            }
            const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
            for (const candidate of [
                directory + include[1],
                sourceDirectory + include[1],
                include[1]
            ]) {
                try {
                    const resolved = resolveFilePath(candidate)
                    if (headers.includes(resolved)) {
                        visit(resolved)
                        break
                    }
                } catch {
                    /* An external/system include is left to the compiler. */
                }
            }
        }
    }
    visit(sourcePath)
    return Object.fromEntries([...seen].map((path) => [path, fileFingerprint(files[path])!]))
}
