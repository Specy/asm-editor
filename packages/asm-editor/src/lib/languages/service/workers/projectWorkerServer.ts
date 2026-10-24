/// <reference lib="webworker" />

import type { BuildConfiguration, ProjectFile, BuildSources } from '#lib/projectFiles.ts'
import { buildConfiguration } from '#lib/projectFiles.ts'
import { validateAssemblerProfile } from '#lib/assemblerProfiles.ts'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectWorkerRequest,
    ProjectWorkerResponse
} from '../protocol'

type WorkerSession = BuildConfiguration & {
    revision: number
    target: ProjectAnalysisTarget
    entry: string
    /** A Map, so a File named `__proto__` is a key like any other rather than a prototype write. */
    files: Map<string, ProjectFile>
}

/** How long a session whose analysis could not run waits before it is analyzed again. */
export const ANALYSIS_RETRY_MS = 10_000

/**
 * What an adapter throws when its analysis could not run for a reason that says nothing about the
 * sources, such as an assembler that could not be downloaded: the session is sent `snapshot`
 * instead, and, unless `retry` is false because trying again cannot help, its revision is analyzed
 * again after `ANALYSIS_RETRY_MS` if no edit brought a newer one first.
 */
export class AnalysisUnavailableError extends Error {
    readonly retry: boolean

    constructor(
        message: string,
        readonly snapshot: ProjectAnalysisSnapshot,
        options?: ErrorOptions & { retry?: boolean }
    ) {
        super(message, options)
        this.name = 'AnalysisUnavailableError'
        this.retry = options?.retry ?? true
    }
}

type AnalyzeProject = (
    sources: BuildSources,
    sessionId: string,
    revision: number,
    target: ProjectAnalysisTarget
) => ProjectAnalysisSnapshot | Promise<ProjectAnalysisSnapshot>

/**
 * Hosts one Target adapter behind revisioned, incremental Project messages. Updates are coalesced
 * while idle and collapse to the newest revision while analysis is active.
 */
export function startProjectWorker(analyze: AnalyzeProject): void {
    const workerScope = self as unknown as DedicatedWorkerGlobalScope
    const sessions = new Map<string, WorkerSession>()
    const pendingSessions = new Set<string>()
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let running = false

    function scheduleAnalysis(sessionId: string) {
        pendingSessions.add(sessionId)
        if (flushTimer !== undefined || running) return
        flushTimer = setTimeout(() => void flushAnalyses(), 40)
    }

    /** Analyzes a revision again later, if it is still the session's latest by then. */
    function retryAnalysis(sessionId: string, revision: number) {
        setTimeout(() => {
            if (sessions.get(sessionId)?.revision === revision) scheduleAnalysis(sessionId)
        }, ANALYSIS_RETRY_MS)
    }

    async function flushAnalyses() {
        flushTimer = undefined
        if (running) return
        running = true
        try {
            while (pendingSessions.size > 0) {
                const sessionIds = [...pendingSessions]
                pendingSessions.clear()
                for (const sessionId of sessionIds) {
                    const current = sessions.get(sessionId)
                    if (!current) continue
                    const revision = current.revision
                    const target = current.target
                    const sources = {
                        entry: current.entry,
                        ...buildConfiguration(current),
                        files: Object.fromEntries(current.files)
                    }
                    try {
                        const snapshot = await analyze(sources, sessionId, revision, target)
                        workerScope.postMessage({
                            type: 'analysis',
                            snapshot
                        } satisfies ProjectWorkerResponse)
                    } catch (error) {
                        if (error instanceof AnalysisUnavailableError) {
                            workerScope.postMessage({
                                type: 'analysis',
                                snapshot: error.snapshot
                            } satisfies ProjectWorkerResponse)
                            if (error.retry) retryAnalysis(sessionId, revision)
                            continue
                        }
                        workerScope.postMessage({
                            type: 'failure',
                            sessionId,
                            revision,
                            message: error instanceof Error ? error.message : String(error)
                        } satisfies ProjectWorkerResponse)
                    }
                }
            }
        } finally {
            running = false
            if (pendingSessions.size > 0) scheduleAnalysis([...pendingSessions][0]!)
        }
    }

    workerScope.addEventListener('message', (event: MessageEvent<ProjectWorkerRequest>) => {
        const request = event.data
        if (
            request.type !== 'dispose' &&
            Object.prototype.hasOwnProperty.call(request, 'assemblerProfile')
        ) {
            try {
                validateAssemblerProfile(request.assemblerProfile)
            } catch (error) {
                workerScope.postMessage({
                    type: 'failure',
                    sessionId: request.sessionId,
                    revision: request.revision,
                    message: error instanceof Error ? error.message : String(error)
                } satisfies ProjectWorkerResponse)
                return
            }
        }
        if (request.type === 'dispose') {
            sessions.delete(request.sessionId)
            pendingSessions.delete(request.sessionId)
            return
        }
        if (request.type === 'open') {
            sessions.set(request.sessionId, {
                revision: request.revision,
                target: request.target,
                entry: request.entry,
                ...buildConfiguration(request),
                files: new Map(Object.entries(request.files))
            })
            scheduleAnalysis(request.sessionId)
            return
        }
        const session = sessions.get(request.sessionId)
        if (!session || request.revision <= session.revision) return
        // Replace configuration, rather than merge, so omitted fields are cleared on updates.
        const next = {
            revision: request.revision,
            target: session.target,
            entry: request.entry,
            files: session.files,
            ...buildConfiguration(request)
        }
        sessions.set(request.sessionId, next)
        for (const change of request.changes) {
            //A plain object would route a File named `__proto__` into the prototype instead of the
            //map, so it would never be analysed and could never be deleted.
            if (change.type === 'set') session.files.set(change.path, change.file)
            else session.files.delete(change.path)
        }
        scheduleAnalysis(request.sessionId)
    })

    //Announced only once the listener above exists. Everything this module imports — a Core and its
    //WebAssembly — is evaluated before this function runs, and a request that arrives during that
    //window has nothing listening for it and is lost, leaving the session waiting for an analysis
    //that will never come.
    workerScope.postMessage({ type: 'ready' } satisfies ProjectWorkerResponse)
}
