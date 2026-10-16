import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { isValidFilePath } from '#lib/projectFiles.ts'

export const ASSEMBLY_MODEL_SCHEME = 'asm-editor'

/**
 * A view of a File with a model of its own beside the File's text: an Executable's Listing and its
 * Pseudocode ([file-views.md](../../../../../../docs/design/file-views.md), decision 12). A model
 * of the text has none.
 */
export type ModelView = 'listing' | 'pseudocode'

export type ProjectModelIdentity = (
    | { sessionId: string; sourceKind: 'live'; path: string }
    | { sessionId: string; sourceKind: 'build'; buildGeneration: number; path: string }
) & { view?: ModelView }

type UriLike = { scheme: string; authority: string; path: string; fragment?: string }

const MODEL_VIEWS: readonly string[] = ['listing', 'pseudocode'] satisfies ModelView[]

let fallbackSessionId = 0

export function createProjectLanguageSessionId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `session-${++fallbackSessionId}`
}

function validateIdentity(identity: ProjectModelIdentity): void {
    if (!/^[A-Za-z0-9._~-]+$/.test(identity.sessionId)) {
        throw new Error('Invalid language-session ID')
    }
    if (!isValidFilePath(identity.path)) throw new Error(`Invalid Project path: ${identity.path}`)
    if (
        identity.sourceKind === 'build' &&
        (!Number.isSafeInteger(identity.buildGeneration) || identity.buildGeneration < 0)
    ) {
        throw new Error('Invalid Build generation')
    }
}

function identityPath(identity: ProjectModelIdentity): string {
    const source =
        identity.sourceKind === 'live' ? 'live' : `build-${identity.buildGeneration.toString(10)}`
    return `/${source}/${identity.path}`
}

/** A view's model is told apart by the URI's fragment, which leaves its path the File's. */
export function projectSourceUri(
    monaco: Pick<MonacoType, 'Uri'>,
    identity: ProjectModelIdentity
): ReturnType<MonacoType['Uri']['from']> {
    validateIdentity(identity)
    return monaco.Uri.from({
        scheme: ASSEMBLY_MODEL_SCHEME,
        authority: identity.sessionId,
        path: identityPath(identity),
        ...(identity.view ? { fragment: identity.view } : {})
    })
}

export function projectSourceModelKey(identity: ProjectModelIdentity): string {
    validateIdentity(identity)
    return `${identity.sessionId}:${identityPath(identity)}${identity.view ? `#${identity.view}` : ''}`
}

export function parseProjectSourceUri(uri: UriLike): ProjectModelIdentity | null {
    if (uri.scheme !== ASSEMBLY_MODEL_SCHEME || !/^[A-Za-z0-9._~-]+$/.test(uri.authority)) {
        return null
    }
    if (!uri.path.startsWith('/')) return null
    const parts = uri.path.slice(1).split('/')
    if (parts.length < 2) return null
    const [source, ...pathParts] = parts
    const path = pathParts.join('/')
    if (!isValidFilePath(path)) return null
    const view =
        uri.fragment && MODEL_VIEWS.includes(uri.fragment)
            ? { view: uri.fragment as ModelView }
            : {}
    if (source === 'live') return { sessionId: uri.authority, sourceKind: 'live', path, ...view }
    const match = /^build-(\d+)$/.exec(source)
    if (!match) return null
    const buildGeneration = Number(match[1])
    if (!Number.isSafeInteger(buildGeneration)) return null
    return { sessionId: uri.authority, sourceKind: 'build', buildGeneration, path, ...view }
}
