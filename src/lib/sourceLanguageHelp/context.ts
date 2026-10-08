import type monaco from 'monaco-editor'
import { sourceLanguage } from '$lib/sourceCompilation/records'
import {
    compilerCapabilities,
    type CompilerCapabilities
} from '$lib/sourceCompilation/capabilities'
import { languageSession } from '$lib/languages/service/sessionRegistry'
import { parseProjectSourceUri, type ProjectModelIdentity } from '$lib/languages/service/uri'
import type { BuildSources } from '$lib/projectFiles'

export type HelpLanguage = 'c' | 'cpp' | 'header'
export type SourceHelpSessionContext = Readonly<{
    sources: BuildSources
    capabilities?: CompilerCapabilities
    revision: number
}>
export type SourceHelpContext = {
    language: HelpLanguage
    identity?: ProjectModelIdentity
    sources?: BuildSources
    capabilities?: CompilerCapabilities
    current(): boolean
}
const hints = new WeakMap<monaco.editor.ITextModel, HelpLanguage>()

/** C and C++ share Monaco's tokenizer; standalone hosts must supply their actual File language. */
export function setSourceHelpLanguage(
    model: monaco.editor.ITextModel,
    language: 'c' | 'cpp' | undefined
): void {
    if (language) hints.set(model, language)
    else hints.delete(model)
}

export function helpLanguage(path: string): HelpLanguage | undefined {
    return (
        sourceLanguage(path) ??
        (/\.(hpp|hh|hxx)$/i.test(path) ? 'cpp' : /\.h$/i.test(path) ? 'header' : undefined)
    )
}

export function resolveSourceHelpContext(
    model: monaco.editor.ITextModel
): SourceHelpContext | undefined {
    if (model.isDisposed()) return undefined
    const version = model.getVersionId()
    const identity = parseProjectSourceUri(model.uri)
    if (!identity) {
        const language = hints.get(model)
        if (!language) return undefined
        return {
            language,
            current: () =>
                !model.isDisposed() &&
                model.getVersionId() === version &&
                hints.get(model) === language
        }
    }
    const language = helpLanguage(identity.path)
    if (!language) return undefined
    const session = languageSession(identity.sessionId)
    const generation = identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    const source = session?.sourceHelpFor?.(identity.sourceKind, generation)
    const sources = source?.sources ?? session?.sourcesFor(identity.sourceKind, generation)
    if (!session || !sources || sources.files[identity.path]?.encoding !== 'plain') return undefined
    // Older embedders can supply a registry view without sourceHelpFor; the actual session freezes
    // a Build's descriptor when it records the generation.
    const capabilities =
        source?.capabilities ??
        (session.target
            ? compilerCapabilities(
                  session.target,
                  identity.sourceKind === 'build' ? sources.runtimeAbi : undefined
              )
            : undefined)
    return {
        language,
        identity,
        sources,
        capabilities,
        current: () => {
            if (
                model.isDisposed() ||
                model.getVersionId() !== version ||
                languageSession(identity.sessionId) !== session
            )
                return false
            const next = session.sourceHelpFor?.(identity.sourceKind, generation)
            return next
                ? next.revision === source?.revision && next.sources === sources
                : session.sourcesFor(identity.sourceKind, generation) === sources
        }
    }
}
