import { LANGUAGE_EXTENSIONS } from '#lib/Config.ts'
import { isLibraryListingPath } from '#lib/listing/listingPaths.ts'
import { sourceLanguage } from '#lib/sourceCompilation/records.ts'

export type EditorFileKind = 'source' | 'assembly'

const assemblyExtensions = new Set<string>([...Object.values(LANGUAGE_EXTENSIONS), 's', 'inc'])

/** Identify assembly positively so new higher-level source languages use source-file routing. */
export function editorFileKind(path: string): EditorFileKind | undefined {
    if (!path) return undefined
    //a library's Listing, `@lib/libc.so.6`, is assembly whatever its soname ends in; a Project
    //File there with a source language's extension is that language's
    if (isLibraryListingPath(path) && !sourceLanguage(path)) return 'assembly'
    const name = path.split('/').pop()!
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
    return !extension || assemblyExtensions.has(extension) ? 'assembly' : 'source'
}

/** Matching panes win; ties and unrelated pairs use the left pane. Empty panes accept either kind. */
export function editorGroupForFile<T extends { displayedPath: string }>(
    path: string,
    groups: readonly T[]
): T {
    const kind = editorFileKind(path)
    return (
        groups.find((group) => editorFileKind(group.displayedPath) === kind) ??
        groups.find((group) => !group.displayedPath) ??
        groups[0]
    )
}
