import type { ProjectFileKind } from './fileKinds'

/**
 * How a pane shows a File ([file-views.md](../../../../docs/design/file-views.md), decisions 1, 4
 * and 8): as text, in the Hex editor, as an Executable's Listing or Pseudocode, as a Preview: the
 * browser's own, or Markdown rendered, or a BMP in the Pixel editor
 * ([pixel-editor.md](../../../../docs/design/pixel-editor.md), decision 1). Kept apart from `fileKinds.ts` so that a Project can
 * clean its saved views without loading the ELF analysis.
 */
export type FileView = 'text' | 'hex' | 'listing' | 'pseudocode' | 'preview' | 'pixels'

export const FILE_VIEWS: readonly FileView[] = [
    'text',
    'hex',
    'listing',
    'pseudocode',
    'preview',
    'pixels'
]

export function isFileView(value: unknown): value is FileView {
    return typeof value === 'string' && (FILE_VIEWS as readonly string[]).includes(value)
}

/**
 * The views a kind of File can be shown in, in the order the view switch offers them, a Preview
 * always first and the Hex editor always last: an Executable's Listing, its Pseudocode and its
 * bytes; a File the browser can show as its Preview and its bytes, and a BMP the Pixel editor
 * draws in its pixels between them; and Markdown as its rendered Preview, its text and its bytes.
 */
export function fileViewsOf(kind: ProjectFileKind | undefined): readonly FileView[] {
    if (kind === undefined || kind === 'text') return ['text']
    if (kind === 'markdown') return ['preview', 'text', 'hex']
    if (kind === 'executable') return ['listing', 'pseudocode', 'hex']
    if (kind === 'bytes') return ['hex']
    if (kind.pixels) return ['preview', 'pixels', 'hex']
    return ['preview', 'hex']
}

/**
 * The view a kind of File opens in: the first it offers, except Markdown, which is written as much
 * as read and opens on its text, and an Executable, which opens on its Listing, the view a person
 * reading a program wants first, with its bytes and its Pseudocode a click away
 * ([reverse-engineering-ux.md](../../../../docs/design/reverse-engineering-ux.md), decision 13).
 */
export function defaultFileView(kind: ProjectFileKind | undefined): FileView {
    if (kind === 'markdown') return 'text'
    return kind === 'executable' ? 'listing' : fileViewsOf(kind)[0]
}

/** The view a File is shown in: the one asked for when its kind offers it, else its default. */
export function resolveFileView(
    kind: ProjectFileKind | undefined,
    ...chosen: (FileView | undefined)[]
): FileView {
    const offered = fileViewsOf(kind)
    return (
        chosen.find((view) => view !== undefined && offered.includes(view)) ?? defaultFileView(kind)
    )
}
