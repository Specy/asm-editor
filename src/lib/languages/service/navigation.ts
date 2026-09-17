import type monaco from 'monaco-editor'
import { parseProjectSourceUri, type ProjectModelIdentity } from './uri'

export type ProjectNavigationHandler = (
    identity: ProjectModelIdentity,
    selection: monaco.IRange | monaco.IPosition | undefined
) => boolean | Promise<boolean>

const handlers = new Map<string, ProjectNavigationHandler>()

export function registerProjectNavigation(
    sessionId: string,
    handler: ProjectNavigationHandler
): () => void {
    handlers.set(sessionId, handler)
    return () => {
        if (handlers.get(sessionId) === handler) handlers.delete(sessionId)
    }
}

export function openProjectResource(
    resource: monaco.Uri,
    selection: monaco.IRange | monaco.IPosition | undefined
): boolean | Promise<boolean> {
    const identity = parseProjectSourceUri(resource)
    if (!identity) return false
    return handlers.get(identity.sessionId)?.(identity, selection) ?? false
}
