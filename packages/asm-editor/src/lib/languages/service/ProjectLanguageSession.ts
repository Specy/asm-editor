import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import {
    normalizeBuildInput,
    buildConfiguration,
    buildConfigurationsEqual,
    sameFileContent
} from '#lib/projectFiles.ts'
import { languageWorkerManager, type LanguageWorkerMessage } from './LanguageWorkerManager'
import type {
    ProjectAnalysisSnapshot,
    ProjectAnalysisTarget,
    ProjectFileChange,
    ProjectWorkerRequest
} from './protocol'
import { unresolvedSnapshot } from './adapters/unresolved'
import { registerLanguageSession } from './sessionRegistry'
import { compilerCapabilities } from '#lib/sourceCompilation/capabilities.ts'
import type { SourceHelpSessionContext } from '#lib/sourceLanguageHelp/context.ts'

type SnapshotListener = (snapshot: ProjectAnalysisSnapshot | undefined, pending: boolean) => void

function fileChanges(previous: ProjectFiles, next: ProjectFiles): ProjectFileChange[] {
    const changes: ProjectFileChange[] = []
    for (const [path, file] of Object.entries(next)) {
        const old = previous[path]
        if (!sameFileContent(old, file)) {
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
    private buildHelp = new Map<number, SourceHelpSessionContext>()
    private listeners = new Set<SnapshotListener>()
    private unregister: () => void
    private connection: { post(request: ProjectWorkerRequest): void; dispose(): void } | undefined

    constructor(sessionId: string, sources: BuildSources, target: ProjectAnalysisTarget = 'M68K') {
        sources = normalizeBuildInput(sources)
        this.sessionId = sessionId
        this.target = target
        this.currentSources = sources
        this.unregister = registerLanguageSession(this)
        this.connect()
    }

    /** Acquires the Target's Worker and opens the sources as they are now on it. */
    private connect(): void {
        const sources = this.currentSources
        this.connection = languageWorkerManager.acquire(this.target, this.sessionId, (message) =>
            this.receive(message)
        )
        this.connection?.post({
            type: 'open',
            sessionId: this.sessionId,
            revision: this.revision,
            target: this.target,
            entry: sources.entry,
            files: sources.files,
            ...buildConfiguration(sources)
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
        this.buildHelp.clear()
        if (sources) {
            const frozen = normalizeBuildInput(sources)
            this.buildSnapshots.set(buildGeneration, frozen)
            this.buildHelp.set(
                buildGeneration,
                Object.freeze({
                    sources: frozen,
                    capabilities: compilerCapabilities(this.target, frozen.runtimeAbi),
                    revision: buildGeneration
                })
            )
        }
    }

    sourceHelpFor(
        sourceKind: 'live' | 'build',
        buildGeneration?: number
    ): SourceHelpSessionContext | undefined {
        return sourceKind === 'live'
            ? {
                  sources: this.currentSources,
                  capabilities: compilerCapabilities(this.target),
                  revision: this.revision
              }
            : buildGeneration === undefined
              ? undefined
              : this.buildHelp.get(buildGeneration)
    }

    update(sources: BuildSources): void {
        sources = normalizeBuildInput(sources)
        const changes = fileChanges(this.currentSources.files, sources.files)
        if (
            changes.length === 0 &&
            sources.entry === this.currentSources.entry &&
            buildConfigurationsEqual(sources, this.currentSources)
        )
            return
        this.currentSources = sources
        this.revision += 1
        // Keep the last complete answer visible while the Worker analyzes this revision. Monaco's
        // markers otherwise disappear on every keystroke and flash back when the answer arrives.
        // `pending` tells the UI that the retained snapshot is stale without destroying it.
        for (const listener of this.listeners) listener(this.currentSnapshot, true)
        //a Worker that died took the sources it had with it: a new one is sent all of them
        if (!this.connection) return this.connect()
        this.connection.post({
            type: 'update',
            sessionId: this.sessionId,
            revision: this.revision,
            entry: sources.entry,
            changes,
            ...buildConfiguration(sources)
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
        this.buildHelp.clear()
        this.buildSnapshots.clear()
        this.unregister()
    }

    private receive(message: LanguageWorkerMessage): void {
        //The Worker's readiness handshake is the manager's business, not a session's.
        if (message.type === 'ready') return
        if (message.type === 'worker-died') {
            //nothing more comes from it, whatever revision it was on: the next change acquires a
            //new one
            this.connection = undefined
            return this.fail(message.message)
        }
        if (message.type === 'failure') {
            // A failed old profile/source unit cannot replace Diagnostics for the new revision.
            if (message.revision === this.revision) this.fail(message.message)
            return
        }
        const snapshot = message.snapshot
        if (snapshot.revision !== this.revision || snapshot.target !== this.target) return
        this.currentSnapshot = snapshot
        for (const listener of this.listeners) listener(snapshot, false)
    }

    /** The current revision's answer when it could not be analyzed: why, and nothing checked. */
    private fail(message: string): void {
        console.error(`${this.target} analysis failed: ${message}`)
        const snapshot = unresolvedSnapshot(
            this.currentSources,
            message,
            this.sessionId,
            this.revision,
            this.target,
            this.target.toLowerCase()
        )
        this.currentSnapshot = snapshot
        for (const listener of this.listeners) listener(snapshot, false)
    }
}
