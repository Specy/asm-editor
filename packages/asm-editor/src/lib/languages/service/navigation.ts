import type monaco from 'monaco-editor'
import { parseProjectSourceUri, type ProjectModelIdentity } from './uri'

export type ProjectNavigationHandler = (
    identity: ProjectModelIdentity,
    selection: monaco.IRange | monaco.IPosition | undefined,
    originatingEditor?: monaco.editor.ICodeEditor
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
    selection: monaco.IRange | monaco.IPosition | undefined,
    originatingEditor?: monaco.editor.ICodeEditor
): boolean | Promise<boolean> {
    const identity = parseProjectSourceUri(resource)
    if (!identity) return false
    return handlers.get(identity.sessionId)?.(identity, selection, originatingEditor) ?? false
}

/** Opens a link into the Documentation; false when nothing could. */
export type DocumentationLinkHandler = (href: string) => boolean

const documentationHandlers: DocumentationLinkHandler[] = []

/**
 * Where a link into the Documentation from an editor's hover goes
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision 6):
 * a Workbench opens it in its Documentation panel, since it never navigates. The Workbench
 * registered last answers first.
 */
export function registerDocumentationLinks(handler: DocumentationLinkHandler): () => void {
    documentationHandlers.push(handler)
    return () => {
        const index = documentationHandlers.lastIndexOf(handler)
        if (index >= 0) documentationHandlers.splice(index, 1)
    }
}

/**
 * A link a hover holds into the Documentation of this site,
 * `https://…/documentation/x86/executables#pseudocode` (Monaco keeps only links with a scheme), or
 * one written as a path, which Monaco reads as a file's: opened by a Workbench when one is there.
 * False for any other link, which Monaco opens as it would, in a new tab.
 */
export function openDocumentationLink(
    resource: Pick<monaco.Uri, 'scheme' | 'authority' | 'path' | 'fragment'>
): boolean {
    const here =
        (resource.scheme === 'http' || resource.scheme === 'https') &&
        resource.authority === globalThis.location?.host
    if (!here && (resource.scheme !== 'file' || resource.authority)) return false
    if (!resource.path.startsWith('/documentation/')) return false
    const href = resource.fragment ? `${resource.path}#${resource.fragment}` : resource.path
    for (let index = documentationHandlers.length - 1; index >= 0; --index)
        if (documentationHandlers[index](href)) return true
    return false
}
