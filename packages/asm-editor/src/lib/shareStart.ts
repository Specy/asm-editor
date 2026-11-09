import type { WorkbenchSession } from './workbench/WorkbenchSession.svelte.ts'

export type ShareStartAction = 'build' | 'buildAndRun'

/**
 * What the Examples page opens an example with when its own link gives no flags: the example's
 * `startup`. The editor's own links carry the flags they were made with and nothing else, so a link
 * to an example in the editor starts it only as it says.
 */
export type ShareStartup = { build?: boolean; buildAndRun?: boolean; fullscreenDisplay?: boolean }

const STARTUP_FLAGS = ['build', 'buildAndRun', 'fullscreenDisplay'] as const

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

/**
 * Whether a link opens the Screen in its floating window, `&fullscreenDisplay=true`, read the same
 * way as the start flags. With `buildAndRun` it starts a program with its display filling the page.
 */
export function readFullscreenDisplay(params: Pick<URLSearchParams, 'get'>): boolean {
    const value = params.get('fullscreenDisplay')
    return value === '' || value === 'true'
}

/**
 * What the Examples page opens an example with: the flags its own link gives, and `defaults`, the
 * example's `startup`, for those it leaves out. Build and Build and Run are one choice, so a link
 * that gives either decides it, and `buildAndRun=false` opens a game without running it.
 */
export function resolveShareStartup(
    params: Pick<URLSearchParams, 'get'>,
    defaults: ShareStartup = {}
): { action: ShareStartAction | undefined; fullscreenDisplay: boolean } {
    const given = (name: (typeof STARTUP_FLAGS)[number]) => params.get(name) !== null
    const action =
        given('build') || given('buildAndRun')
            ? readShareStart(params)
            : defaults.buildAndRun
              ? 'buildAndRun'
              : defaults.build
                ? 'build'
                : undefined
    const fullscreenDisplay = given('fullscreenDisplay')
        ? readFullscreenDisplay(params)
        : defaults.fullscreenDisplay === true
    return { action, fullscreenDisplay }
}

/** Appended to a share URL, which already has its project or example query. */
export function shareStartQuery(action?: ShareStartAction): string {
    return action ? `&${action}=true` : ''
}

/** How much of a framed page shows before its program starts. */
const SHOWN_RATIO = 0.25

/**
 * Resolves once a quarter of this page shows on the reader's screen, at once for a page that is
 * not in a frame. A framed page can load before the reader reaches it, as the home page's demo
 * does on a first visit, and a program started there would run, and take the keyboard, unseen.
 * Never resolves once `signal` aborts.
 */
export function whenOnScreen(signal: AbortSignal): Promise<void> {
    if (window.self === window.top || typeof IntersectionObserver === 'undefined')
        return Promise.resolve()
    return new Promise((resolve) => {
        // without a root, the frame's page is measured against the top page's screen
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.intersectionRatio < SHOWN_RATIO) return
                observer.disconnect()
                resolve()
            },
            { threshold: SHOWN_RATIO }
        )
        observer.observe(document.documentElement)
        signal.addEventListener('abort', () => observer.disconnect(), { once: true })
    })
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
