import type { BuildSources } from '$lib/projectFiles'
import type { ProjectAnalysisSnapshot } from './protocol'

export type LanguageSessionView = {
    readonly sessionId: string
    readonly sources: BuildSources
    readonly snapshot: ProjectAnalysisSnapshot | undefined
    sourcesFor(sourceKind: 'live' | 'build', buildGeneration?: number): BuildSources | undefined
}

const sessions = new Map<string, LanguageSessionView>()

export function registerLanguageSession(session: LanguageSessionView): () => void {
    sessions.set(session.sessionId, session)
    return () => {
        if (sessions.get(session.sessionId) === session) sessions.delete(session.sessionId)
    }
}

export function languageSession(sessionId: string): LanguageSessionView | undefined {
    return sessions.get(sessionId)
}
