import type { WorkbenchSession } from './workbench/WorkbenchSession.svelte.ts'

export type ShareStartAction = 'build' | 'buildAndRun'

/** Bare flags and `=true` enable an action. Build and Run takes precedence. */
export function readShareStart(params: Pick<URLSearchParams, 'get'>): ShareStartAction | undefined {
    const enabled = (name: ShareStartAction) => {
        const value = params.get(name)
        return value === '' || value === 'true'
    }
    if (enabled('buildAndRun')) return 'buildAndRun'
    if (enabled('build')) return 'build'
    return undefined
}

/** Appended to a share URL, which already has its project or example query. */
export function shareStartQuery(action?: ShareStartAction): string {
    return action ? `&${action}=true` : ''
}

/** Use the normal Build and Run actions once the host's Workbench is ready. */
export async function startSharedProject(
    session: Pick<WorkbenchSession, 'build' | 'run' | 'debugSession'>,
    action: ShareStartAction | undefined,
    signal: AbortSignal
): Promise<void> {
    if (!action || signal.aborted) return
    await session.build()
    if (action === 'buildAndRun' && session.debugSession && !signal.aborted) {
        await session.run()
    }
}
