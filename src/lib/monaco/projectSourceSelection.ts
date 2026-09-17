export type ProjectSourceSelection =
    | { sourceKind: 'live'; path: string }
    | { sourceKind: 'build'; path: string; buildGeneration: number }

export function liveSource(path: string): ProjectSourceSelection {
    return { sourceKind: 'live', path }
}

export function buildSource(path: string, buildGeneration: number): ProjectSourceSelection {
    return { sourceKind: 'build', path, buildGeneration }
}

/**
 * Explorer navigation changes the File, not which version of the Project the user is looking at.
 * A File created by the running program may not exist in the retained Build; only that case falls
 * back to its live File, where the source identity remains explicit and execution decorations stay
 * absent.
 */
export function selectProjectFile(
    selection: ProjectSourceSelection,
    path: string,
    currentBuildGeneration: number,
    existsInBuild: boolean
): ProjectSourceSelection {
    if (selection.sourceKind === 'build' && existsInBuild) {
        return buildSource(path, currentBuildGeneration)
    }
    return liveSource(path)
}

export function sourceModelKey(selection: ProjectSourceSelection, liveIdentity: string): string {
    return selection.sourceKind === 'build'
        ? `snapshot:${selection.buildGeneration}:${selection.path}`
        : liveIdentity
}

export function isCurrentBuildLocation(
    selection: ProjectSourceSelection,
    currentBuildGeneration: number,
    currentFile: string
): boolean {
    return (
        selection.sourceKind === 'build' &&
        selection.buildGeneration === currentBuildGeneration &&
        selection.path === currentFile
    )
}

export function canEditProjectBreakpoints(
    selection: ProjectSourceSelection,
    options: { readonly: boolean; building: boolean; fileSystemLocked: boolean }
): boolean {
    return (
        !options.readonly &&
        !options.building &&
        (selection.sourceKind === 'build' || !options.fileSystemLocked)
    )
}
