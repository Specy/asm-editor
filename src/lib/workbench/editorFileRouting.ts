import { LANGUAGE_EXTENSIONS } from '$lib/Config'

export type EditorFileKind = 'source' | 'assembly'

const assemblyExtensions = new Set<string>([...Object.values(LANGUAGE_EXTENSIONS), 's', 'inc'])

/** Identify assembly positively so new higher-level source languages use source-file routing. */
export function editorFileKind(path: string): EditorFileKind | undefined {
    if (!path) return undefined
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
