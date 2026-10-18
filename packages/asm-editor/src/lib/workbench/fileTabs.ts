/**
 * The Workbench's row of open Files ([the design record](../../../../../docs/design/workbench.md), File
 * tabs): paths in the order they were opened, the one shown, and the one in preview. Which version
 * of a File a tab shows, the live one or the Build snapshot, is not a property of the tab but of the
 * Debug session, see `selectProjectFile`; these rules only decide which paths are open.
 */
export type FileTabs = {
    readonly paths: readonly string[]
    readonly active: string
    /**
     * The preview tab, as an IDE has one: a File opened from the Explorer with a single click,
     * which the next File opened that way takes the place of, until it is kept open.
     */
    readonly preview?: string
}

/** The row with `preview` as its preview tab, or none, leaving out the field when there is none. */
function withPreview(paths: readonly string[], active: string, preview?: string): FileTabs {
    return preview !== undefined && paths.includes(preview)
        ? { paths, active, preview }
        : { paths, active }
}

export function initialTabs(path: string): FileTabs {
    return { paths: path ? [path] : [], active: path }
}

/**
 * Opens a File's tab at the end of the row, kept open, or focuses it when it is already open,
 * whether kept or in preview.
 */
export function openTab(tabs: FileTabs, path: string): FileTabs {
    if (!path) return tabs
    if (tabs.paths.includes(path)) {
        return tabs.active === path ? tabs : withPreview(tabs.paths, path, tabs.preview)
    }
    return withPreview([...tabs.paths, path], path, tabs.preview)
}

/**
 * Opens a File in the preview tab, in the place of the File previewed before it, or at the end of
 * the row when there is none; a File already open is only focused, whether kept or in preview.
 */
export function previewTab(tabs: FileTabs, path: string): FileTabs {
    if (!path) return tabs
    if (tabs.paths.includes(path)) return openTab(tabs, path)
    const index = tabs.preview === undefined ? -1 : tabs.paths.indexOf(tabs.preview)
    const paths =
        index < 0
            ? [...tabs.paths, path]
            : [...tabs.paths.slice(0, index), path, ...tabs.paths.slice(index + 1)]
    return { paths, active: path, preview: path }
}

/** Keeps a File in preview open, so that the next File previewed opens beside it. */
export function keepTab(tabs: FileTabs, path: string): FileTabs {
    return tabs.preview === path ? { paths: tabs.paths, active: tabs.active } : tabs
}

/**
 * Closes a tab and, when it was the one shown, shows its right neighbour, or its left one at the
 * end of the row. Closing the last tab leaves an empty group; the session owns pane closure.
 */
export function closeTab(tabs: FileTabs, path: string): FileTabs {
    const index = tabs.paths.indexOf(path)
    if (index < 0) return tabs
    const paths = tabs.paths.filter((candidate) => candidate !== path)
    const active =
        tabs.active === path ? (paths[Math.min(index, paths.length - 1)] ?? '') : tabs.active
    return withPreview(paths, active, tabs.preview)
}

/** A renamed or moved File keeps its place in the row, and stays shown if it was. */
export function renameTab(tabs: FileTabs, from: string, to: string): FileTabs {
    if (!tabs.paths.includes(from) || from === to) return tabs
    const paths: string[] = []
    for (const path of tabs.paths) {
        const next = path === from ? to : path
        if (!paths.includes(next)) paths.push(next)
    }
    const preview = tabs.preview === from ? to : tabs.preview
    return withPreview(paths, tabs.active === from ? to : tabs.active, preview)
}

/**
 * Keeps the tabs whose File passes `keep`. When nothing is left the row falls back to `fallback`,
 * normally the Entry path, which may itself name a missing File: the editor says so rather than
 * showing nothing.
 */
export function retainTabs(
    tabs: FileTabs,
    keep: (path: string) => boolean,
    fallback: string
): FileTabs {
    const paths = tabs.paths.filter(keep)
    if (paths.length === 0) return initialTabs(fallback)
    if (paths.length === tabs.paths.length && paths.includes(tabs.active)) return tabs
    if (paths.includes(tabs.active)) return withPreview(paths, tabs.active, tabs.preview)
    const index = tabs.paths.indexOf(tabs.active)
    //the shown tab went: show the nearest survivor to its right, else the last one
    const after = tabs.paths.slice(index + 1).find((path) => paths.includes(path))
    return withPreview(paths, after ?? paths[paths.length - 1], tabs.preview)
}

/** A deleted File takes its tab with it. */
export function removeTab(tabs: FileTabs, path: string, fallback: string): FileTabs {
    return retainTabs(tabs, (candidate) => candidate !== path, fallback)
}
