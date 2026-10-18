import type { ProjectFileKind } from './fileKinds'

/**
 * How a pane shows a File ([file-views.md](../../../../docs/design/file-views.md), decisions 1, 4
 * and 8): as text, in the Hex editor, as an Executable's Listing or Pseudocode, or as the browser's
 * Preview. Kept apart from `fileKinds.ts` so that a Project can clean its saved views without
 * loading the ELF analysis.
 */
export type FileView = 'text' | 'hex' | 'listing' | 'pseudocode' | 'preview'

export const FILE_VIEWS: readonly FileView[] = ['text', 'hex', 'listing', 'pseudocode', 'preview']

export function isFileView(value: unknown): value is FileView {
    return typeof value === 'string' && (FILE_VIEWS as readonly string[]).includes(value)
}

/**
 * The views a kind of File can be shown in, its default first, in the order the view switch
 * offers them: an Executable opens in the Hex editor and can be switched to its Listing and its
 * Pseudocode, a File the browser can show opens as its Preview.
 */
export function fileViewsOf(kind: ProjectFileKind | undefined): readonly FileView[] {
    if (kind === undefined || kind === 'text') return ['text']
    if (kind === 'executable') return ['hex', 'listing', 'pseudocode']
    if (kind === 'bytes') return ['hex']
    return ['preview', 'hex']
}

export function defaultFileView(kind: ProjectFileKind | undefined): FileView {
    return fileViewsOf(kind)[0]
}

/** The view a File is shown in: the one asked for when its kind offers it, else its default. */
export function resolveFileView(
    kind: ProjectFileKind | undefined,
    ...chosen: (FileView | undefined)[]
): FileView {
    const offered = fileViewsOf(kind)
    return chosen.find((view) => view !== undefined && offered.includes(view)) ?? offered[0]
}
