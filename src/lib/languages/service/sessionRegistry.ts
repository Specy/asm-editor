import type { BuildSources } from '$lib/projectFiles'
import type { ProjectAnalysisSnapshot } from './protocol'
import type { ProjectModelIdentity } from './uri'

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

/**
 * The analysis a model can be described by.
 *
 * Only the live Files are analysed, so a Build snapshot has no analysis of its own. Its text is
 * nevertheless the text the analysis saw for every File the program has not changed since the
 * Build — which, right after one, is all of them — and a symbol's range is then just as valid
 * there. Refusing the snapshot outright instead left Go to Definition, hover and completion dead
 * from the moment a Build switched the editor into the snapshot view.
 */
export function analysisForModel(
    session: LanguageSessionView | undefined,
    identity: ProjectModelIdentity,
    sources: BuildSources
): ProjectAnalysisSnapshot | undefined {
    const snapshot = session?.snapshot
    if (!snapshot || !session) return undefined
    if (identity.sourceKind === 'live') return snapshot
    const live = session.sourcesFor('live')
    if (!live) return undefined
    //Keep only the symbols and occurrences whose File still reads the way the analysis read it.
    const unchanged = (path: string) => live.files[path]?.content === sources.files[path]?.content
    return {
        ...snapshot,
        symbols: snapshot.symbols.filter((symbol) => unchanged(symbol.location.path)),
        occurrences: snapshot.occurrences.filter((occurrence) =>
            unchanged(occurrence.location.path)
        )
    }
}
