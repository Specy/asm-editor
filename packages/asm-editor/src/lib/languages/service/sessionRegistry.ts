import type monaco from 'monaco-editor'
import { sameFileContent, type BuildSources } from '#lib/projectFiles.ts'
import type { ProjectAnalysisSnapshot } from './protocol'
import { parseProjectSourceUri, type ProjectModelIdentity } from './uri'

export type LanguageSessionView = {
    readonly sessionId: string
    readonly sources: BuildSources
    readonly snapshot: ProjectAnalysisSnapshot | undefined
    /** The Target the session analyses for, which picks the Runtime library a definition opens. */
    readonly target?: import('./protocol').ProjectAnalysisTarget
    sourcesFor(sourceKind: 'live' | 'build', buildGeneration?: number): BuildSources | undefined
    sourceHelpFor?(
        sourceKind: 'live' | 'build',
        buildGeneration?: number
    ): import('#lib/sourceLanguageHelp/context.ts').SourceHelpSessionContext | undefined
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

export type ModelSources = {
    identity: ProjectModelIdentity
    session: LanguageSessionView
    sources: BuildSources
}

/**
 * The session an editor model belongs to and the sources it shows: the live Files, or the Build
 * snapshot of the model's generation. None for a model of no registered session, or with no URI at
 * all, as a test's stub model has.
 */
export function modelSources(model: monaco.editor.ITextModel): ModelSources | null {
    const identity = model.uri ? parseProjectSourceUri(model.uri) : null
    if (!identity) return null
    const session = languageSession(identity.sessionId)
    const sources = session?.sourcesFor(
        identity.sourceKind,
        identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    )
    return session && sources ? { identity, session, sources } : null
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
    if (
        live.assemblerProfile !== sources.assemblerProfile ||
        live.assemblyError !== sources.assemblyError
    )
        return undefined
    //Keep only the symbols and occurrences whose File still reads the way the analysis read it.
    const unchanged = (path: string) => sameFileContent(live.files[path], sources.files[path])
    return {
        ...snapshot,
        symbols: snapshot.symbols.filter((symbol) => unchanged(symbol.location.path)),
        occurrences: snapshot.occurrences.filter((occurrence) =>
            unchanged(occurrence.location.path)
        )
    }
}
