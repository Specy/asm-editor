import { resolveFilePath, type ProjectFiles } from '#lib/projectFiles.ts'
import { fileFingerprint } from './fingerprints'

/**
 * The Files a computed include (`#include HEADER`) might name, which no scan can tell apart: every
 * C or C++ text File, headers and sources alike.
 */
const INCLUDABLE = /\.(h|hpp|hh|hxx|inc|c|cc|cpp|cxx)$/i

/**
 * Every Project File a compilation of `sourcePath` can read, with its fingerprint: the source, and
 * what its quoted includes reach, recursively, whatever the reached File's extension, so a
 * `#include "video.c"` is followed as a `#include "video.h"` is. They are what Compile uploads and
 * what makes a Compilation record stale. A `__has_include("…")` counts as well, since the answer
 * depends on the File being there. Computed includes conservatively depend on every C or C++ File.
 * An angle-bracket include never reads a Project File, as the request searches the Project only
 * for quoted ones.
 */
export function compilationInputs(
    sourcePath: string,
    files: ProjectFiles
): Readonly<Record<string, string>> {
    const readable = (path: string) => files[path]?.encoding === 'plain'
    const includable = Object.keys(files).filter((path) => INCLUDABLE.test(path) && readable(path))
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
        const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
        const reach = (name: string) => {
            for (const candidate of [directory + name, sourceDirectory + name, name]) {
                try {
                    const resolved = resolveFilePath(candidate)
                    if (readable(resolved)) {
                        visit(resolved)
                        return
                    }
                } catch {
                    /* An external/system include is left to the compiler. */
                }
            }
        }
        for (const match of text.matchAll(/^\s*#\s*include(?:_next)?\s+([^\n]+)/gm)) {
            if (match[1].startsWith('<')) continue
            const include = /^"([^"]+)"/.exec(match[1])
            if (include) reach(include[1])
            else for (const other of includable) visit(other)
        }
        for (const match of text.matchAll(/__has_include(?:_next)?\s*\(\s*"([^"]+)"\s*\)/g))
            reach(match[1])
    }
    visit(sourcePath)
    return Object.fromEntries([...seen].map((path) => [path, fileFingerprint(files[path])!]))
}
