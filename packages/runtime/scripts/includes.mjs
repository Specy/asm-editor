// What a compile reads, for the Runtime library's build and its corpus runner: both upload headers
// with each request, and a request whose answer is already known is never sent again.
import { posix } from 'node:path'

/**
 * What a compile of `sourcePath` can read of `files` (the uploaded files, keyed by the names the
 * request gives them): the source, then every file an `#include` or `#include_next` in it, or in a
 * file it reaches, could name in the including file's directory or in any of the request's
 * `searchDirectories`. More than the compiler reads, never less, so a compile given only these
 * files gives the same answer as one given them all. Undefined when an include names its file
 * through a macro, which could be anything.
 */
export function includeClosure(sourcePath, sourceText, files, searchDirectories) {
    const reached = new Map([[sourcePath, sourceText]])
    const pending = [[sourcePath, sourceText]]
    while (pending.length) {
        const [from, text] = pending.pop()
        for (const match of text.matchAll(/^[ \t]*#[ \t]*include(?:_next)?\b[ \t]*(.*)$/gm)) {
            const name = /^[<"]([^>"]+)[>"]/.exec(match[1])?.[1]
            if (!name) return undefined
            for (const directory of [posix.dirname(from), ...searchDirectories]) {
                const candidate = posix.normalize(`${directory}/${name}`)
                if (!files.has(candidate) || reached.has(candidate)) continue
                reached.set(candidate, files.get(candidate))
                pending.push([candidate, files.get(candidate)])
            }
        }
    }
    return reached
}
