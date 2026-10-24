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
) & {
    view?: ModelView
    /**
     * A Pseudocode's function, by its link-time address: each function's Pseudocode is a model of
     * its own, so two panes showing two functions of one File never share one.
     */
    functionAddress?: number
}

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
    const address = identity.functionAddress
    if (
        address !== undefined &&
        (identity.view !== 'pseudocode' || !Number.isSafeInteger(address) || address < 0)
    ) {
        throw new Error('Invalid Pseudocode function')
    }
}

function identityPath(identity: ProjectModelIdentity): string {
    const source =
        identity.sourceKind === 'live' ? 'live' : `build-${identity.buildGeneration.toString(10)}`
    return `/${source}/${identity.path}`
}

/** The view, and for a Pseudocode its function's address in hex: `listing`, `pseudocode-11e9`. */
function identityFragment(identity: ProjectModelIdentity): string | undefined {
    if (!identity.view || identity.functionAddress === undefined) return identity.view
    return `${identity.view}-${identity.functionAddress.toString(16)}`
}

function parseFragment(
    fragment: string | undefined
): Pick<ProjectModelIdentity, 'view' | 'functionAddress'> {
    if (!fragment) return {}
    if (MODEL_VIEWS.includes(fragment)) return { view: fragment as ModelView }
    const match = /^pseudocode-([0-9a-f]+)$/.exec(fragment)
    const address = match ? Number.parseInt(match[1], 16) : NaN
    return Number.isSafeInteger(address) ? { view: 'pseudocode', functionAddress: address } : {}
}

/** A view's model is told apart by the URI's fragment, which leaves its path the File's. */
export function projectSourceUri(
    monaco: Pick<MonacoType, 'Uri'>,
    identity: ProjectModelIdentity
): ReturnType<MonacoType['Uri']['from']> {
    validateIdentity(identity)
    const fragment = identityFragment(identity)
    return monaco.Uri.from({
        scheme: ASSEMBLY_MODEL_SCHEME,
        authority: identity.sessionId,
        path: identityPath(identity),
        ...(fragment ? { fragment } : {})
    })
}

export function projectSourceModelKey(identity: ProjectModelIdentity): string {
    validateIdentity(identity)
    const fragment = identityFragment(identity)
    return `${identity.sessionId}:${identityPath(identity)}${fragment ? `#${fragment}` : ''}`
}

/**
 * Another view of the same version of a File, or with no view its text: the Listing a Pseudocode
 * was decompiled from, which has no function of its own.
 */
export function fileViewIdentity(
    identity: ProjectModelIdentity,
    view?: ModelView
): ProjectModelIdentity {
    const other: ProjectModelIdentity = { ...identity, view }
    delete other.functionAddress
    if (!view) delete other.view
    return other
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
    const view = parseFragment(uri.fragment)
    if (source === 'live') return { sessionId: uri.authority, sourceKind: 'live', path, ...view }
    const match = /^build-(\d+)$/.exec(source)
    if (!match) return null
    const buildGeneration = Number(match[1])
    if (!Number.isSafeInteger(buildGeneration)) return null
    return { sessionId: uri.authority, sourceKind: 'build', buildGeneration, path, ...view }
}
