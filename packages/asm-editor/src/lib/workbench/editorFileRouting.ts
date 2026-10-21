import { LANGUAGE_EXTENSIONS } from '#lib/Config.ts'
import { isLibraryListingPath } from '#lib/listing/listingPaths.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { sourceLanguage } from '#lib/sourceCompilation/records.ts'

/** Which pane a File opens in: beside source, beside assembly, or as bytes, which are neither. */
export type EditorFileKind = 'source' | 'assembly' | 'bytes'

const assemblyExtensions = new Set<string>([...Object.values(LANGUAGE_EXTENSIONS), 's', 'inc'])

/**
 * Identify assembly positively so new higher-level source languages use source-file routing. A
 * File stored as bytes is neither, whatever its name: a `.png` is no C source, an extension-less
 * ELF no assembly.
 */
export function editorFileKind(path: string, file?: ProjectFile): EditorFileKind | undefined {
    if (!path) return undefined
    if (file && file.encoding !== 'plain') return 'bytes'
    //a library's Listing, `@lib/libc.so.6`, is assembly whatever its soname ends in; a Project
    //File there with a source language's extension is that language's
    if (isLibraryListingPath(path) && !sourceLanguage(path)) return 'assembly'
    const name = path.split('/').pop()!
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
    return !extension || assemblyExtensions.has(extension) ? 'assembly' : 'source'
}

/** Matching panes win; ties and unrelated pairs use the left pane. Empty panes accept either kind. */
export function editorGroupForFile<
    T extends { displayedPath: string; displayedFile?: ProjectFile | undefined }
>(path: string, groups: readonly T[], file?: ProjectFile): T {
    const kind = editorFileKind(path, file)
    return (
        groups.find((group) => editorFileKind(group.displayedPath, group.displayedFile) === kind) ??
        groups.find((group) => !group.displayedPath) ??
        groups[0]
    )
}
