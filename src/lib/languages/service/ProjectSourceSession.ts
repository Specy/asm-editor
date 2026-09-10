import type { BuildSources } from '$lib/projectFiles'
import type { ProjectAnalysisSnapshot } from './protocol'
import { registerLanguageSession } from './sessionRegistry'

/** A lightweight source registry for Targets whose semantic Worker has not migrated yet. */
export class ProjectSourceSession {
    readonly sessionId: string
    readonly snapshot: ProjectAnalysisSnapshot | undefined = undefined
    private currentSources: BuildSources
    private buildSnapshots = new Map<number, BuildSources>()
    private unregister: () => void

    constructor(sessionId: string, sources: BuildSources) {
        this.sessionId = sessionId
        this.currentSources = sources
        this.unregister = registerLanguageSession(this)
    }

    get sources(): BuildSources {
        return this.currentSources
    }

    update(sources: BuildSources): void {
        this.currentSources = sources
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

    dispose(): void {
        this.unregister()
    }
}
