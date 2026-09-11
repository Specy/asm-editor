/// <reference lib="webworker" />

import type { ProjectFile, ProjectFiles } from '$lib/projectFiles'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectWorkerRequest,
    ProjectWorkerResponse
} from '../protocol'

type WorkerSession = {
    revision: number
    target: ProjectAnalysisTarget
    entry: string
    /** A Map, so a File named `__proto__` is a key like any other rather than a prototype write. */
    files: Map<string, ProjectFile>
}

type AnalyzeProject = (
    sources: { entry: string; files: ProjectFiles },
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
                        files: Object.fromEntries(current.files)
                    }
                    try {
                        const snapshot = await analyze(sources, sessionId, revision, target)
                        workerScope.postMessage({
                            type: 'analysis',
                            snapshot
                        } satisfies ProjectWorkerResponse)
                    } catch (error) {
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
                files: new Map(Object.entries(request.files))
            })
            scheduleAnalysis(request.sessionId)
            return
        }
        const session = sessions.get(request.sessionId)
        if (!session || request.revision <= session.revision) return
        session.revision = request.revision
        session.entry = request.entry
        for (const change of request.changes) {
            //A plain object would route a File named `__proto__` into the prototype instead of the
            //map, so it would never be analysed and could never be deleted.
            if (change.type === 'set') session.files.set(change.path, change.file)
            else session.files.delete(change.path)
        }
        scheduleAnalysis(request.sessionId)
    })
}
