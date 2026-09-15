import type { MonacoType } from '$lib/monaco/Monaco'
import { isValidFilePath } from '$lib/projectFiles'

export const ASSEMBLY_MODEL_SCHEME = 'asm-editor'

export type ProjectModelIdentity =
    | { sessionId: string; sourceKind: 'live'; path: string }
    | { sessionId: string; sourceKind: 'build'; buildGeneration: number; path: string }

type UriLike = { scheme: string; authority: string; path: string }

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

export function projectSourceUri(
    monaco: Pick<MonacoType, 'Uri'>,
    identity: ProjectModelIdentity
): ReturnType<MonacoType['Uri']['from']> {
    validateIdentity(identity)
    return monaco.Uri.from({
        scheme: ASSEMBLY_MODEL_SCHEME,
        authority: identity.sessionId,
        path: identityPath(identity)
    })
}

export function projectSourceModelKey(identity: ProjectModelIdentity): string {
    validateIdentity(identity)
    return `${identity.sessionId}:${identityPath(identity)}`
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
    if (source === 'live') return { sessionId: uri.authority, sourceKind: 'live', path }
    const match = /^build-(\d+)$/.exec(source)
    if (!match) return null
    const buildGeneration = Number(match[1])
    if (!Number.isSafeInteger(buildGeneration)) return null
    return { sessionId: uri.authority, sourceKind: 'build', buildGeneration, path }
}
