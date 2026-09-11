import type { BuildSources, ProjectFiles } from '$lib/projectFiles'
import { languageWorkerManager } from './LanguageWorkerManager'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectFileAnalysisStatus,
    ProjectFileChange,
    ProjectWorkerRequest,
    ProjectWorkerResponse
} from './protocol'
import { registerLanguageSession } from './sessionRegistry'

type SnapshotListener = (snapshot: ProjectAnalysisSnapshot | undefined, pending: boolean) => void

function fileChanges(previous: ProjectFiles, next: ProjectFiles): ProjectFileChange[] {
    const changes: ProjectFileChange[] = []
    for (const [path, file] of Object.entries(next)) {
        const old = previous[path]
        if (!old || old.encoding !== file.encoding || old.content !== file.content) {
            changes.push({ type: 'set', path, file })
        }
    }
    for (const path of Object.keys(previous)) {
        if (!next[path]) changes.push({ type: 'delete', path })
    }
    return changes
}

/** One live Project's revisioned connection to its Target's shared analysis Worker. */
export class ProjectLanguageSession {
    readonly sessionId: string
    readonly target: ProjectAnalysisTarget
    private currentSources: BuildSources
    private revision = 1
    private currentSnapshot: ProjectAnalysisSnapshot | undefined
    private buildSnapshots = new Map<number, BuildSources>()
    private listeners = new Set<SnapshotListener>()
    private unregister: () => void
    private connection: { post(request: ProjectWorkerRequest): void; dispose(): void } | undefined

    constructor(sessionId: string, sources: BuildSources, target: ProjectAnalysisTarget = 'M68K') {
        this.sessionId = sessionId
        this.target = target
        this.currentSources = sources
        this.unregister = registerLanguageSession(this)
        this.connection = languageWorkerManager.acquire(target, sessionId, (response) =>
            this.receive(response)
        )
        this.connection?.post({
            type: 'open',
            sessionId,
            revision: this.revision,
            target,
            entry: sources.entry,
            files: sources.files
        })
    }

    get sources(): BuildSources {
        return this.currentSources
    }

    get snapshot(): ProjectAnalysisSnapshot | undefined {
        return this.currentSnapshot
    }

    get pending(): boolean {
        return !this.currentSnapshot || this.currentSnapshot.revision !== this.revision
    }

    sourcesFor(sourceKind: 'live' | 'build', buildGeneration?: number): BuildSources | undefined {
        return sourceKind === 'live'
            ? this.currentSources
            : buildGeneration === undefined
              ? undefined
              : this.buildSnapshots.get(buildGeneration)
    }

    setBuild(buildGeneration: number, sources: BuildSources | undefined): void {
        this.buildSnapshots.clear()
        if (sources) this.buildSnapshots.set(buildGeneration, sources)
    }

    update(sources: BuildSources): void {
        const changes = fileChanges(this.currentSources.files, sources.files)
        if (changes.length === 0 && sources.entry === this.currentSources.entry) return
        this.currentSources = sources
        this.revision += 1
        // Keep the last complete answer visible while the Worker analyzes this revision. Monaco's
        // markers otherwise disappear on every keystroke and flash back when the answer arrives.
        // `pending` tells the UI that the retained snapshot is stale without destroying it.
        for (const listener of this.listeners) listener(this.currentSnapshot, true)
        this.connection?.post({
            type: 'update',
            sessionId: this.sessionId,
            revision: this.revision,
            entry: sources.entry,
            changes
        })
    }

    subscribe(listener: SnapshotListener): () => void {
        this.listeners.add(listener)
        listener(this.currentSnapshot, this.pending)
        return () => this.listeners.delete(listener)
    }

    dispose(): void {
        this.connection?.dispose()
        this.connection = undefined
        this.listeners.clear()
        this.unregister()
    }

    private receive(response: ProjectWorkerResponse): void {
        //The Worker's readiness handshake is the manager's business, not a session's.
        if (response.type === 'ready') return
        if (response.type === 'failure') {
            //`<=`, not `==`: a failure carrying an older revision is still a failure, and the Worker
            //that reported it will not be answering the newer request either.
            if (response.revision <= this.revision) {
                console.error(`${this.target} analysis failed: ${response.message}`)
                const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
                for (const [path, file] of Object.entries(this.currentSources.files)) {
                    fileStatus[path] = file.encoding === 'plain' ? 'not-reachable' : 'binary'
                }
                const snapshot: ProjectAnalysisSnapshot = {
                    sessionId: this.sessionId,
                    revision: this.revision,
                    target: this.target,
                    diagnostics: [
                        {
                            severity: 'error',
                            source: this.target.toLowerCase(),
                            location: {
                                path: this.currentSources.entry,
                                range: {
                                    start: { line: 0, column: 0 },
                                    end: { line: 0, column: 1 }
                                }
                            },
                            message: response.message
                        }
                    ],
                    symbols: [],
                    occurrences: [],
                    fileStatus
                }
                this.currentSnapshot = snapshot
                for (const listener of this.listeners) listener(snapshot, false)
            }
            return
        }
        const snapshot = response.snapshot
        if (snapshot.revision !== this.revision || snapshot.target !== this.target) return
        this.currentSnapshot = snapshot
        for (const listener of this.listeners) listener(snapshot, false)
    }
}
