/**
 * The Workbench's row of open Files ([the design record](../../../docs/design/workbench.md), File
 * tabs): paths in the order they were opened, and the one shown. Which version of a File a tab shows,
 * the live one or the Build snapshot, is not a property of the tab but of the Debug session, see
 * `selectProjectFile`; these rules only decide which paths are open.
 */
export type FileTabs = {
    readonly paths: readonly string[]
    readonly active: string
}

export function initialTabs(path: string): FileTabs {
    return { paths: path ? [path] : [], active: path }
}

/** Opens a File's tab at the end of the row, or focuses it when it is already open. */
export function openTab(tabs: FileTabs, path: string): FileTabs {
    if (!path) return tabs
    if (tabs.paths.includes(path)) {
        return tabs.active === path ? tabs : { paths: tabs.paths, active: path }
    }
    return { paths: [...tabs.paths, path], active: path }
}

/**
 * Closes a tab and, when it was the one shown, shows its right neighbour, or its left one at the
 * end of the row. The last tab never closes: an empty editor would have nothing to say.
 */
export function closeTab(tabs: FileTabs, path: string): FileTabs {
    const index = tabs.paths.indexOf(path)
    if (index < 0 || tabs.paths.length <= 1) return tabs
    const paths = tabs.paths.filter((candidate) => candidate !== path)
    const active = tabs.active === path ? paths[Math.min(index, paths.length - 1)] : tabs.active
    return { paths, active }
}

/** A renamed or moved File keeps its place in the row, and stays shown if it was. */
export function renameTab(tabs: FileTabs, from: string, to: string): FileTabs {
    if (!tabs.paths.includes(from) || from === to) return tabs
    const paths: string[] = []
    for (const path of tabs.paths) {
        const next = path === from ? to : path
        if (!paths.includes(next)) paths.push(next)
    }
    return { paths, active: tabs.active === from ? to : tabs.active }
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
    if (paths.includes(tabs.active)) return { paths, active: tabs.active }
    const index = tabs.paths.indexOf(tabs.active)
    //the shown tab went: show the nearest survivor to its right, else the last one
    const after = tabs.paths.slice(index + 1).find((path) => paths.includes(path))
    return { paths, active: after ?? paths[paths.length - 1] }
}

/** A deleted File takes its tab with it. */
export function removeTab(tabs: FileTabs, path: string, fallback: string): FileTabs {
    return retainTabs(tabs, (candidate) => candidate !== path, fallback)
}
