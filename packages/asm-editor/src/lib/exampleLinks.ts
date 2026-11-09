import { resolve } from '$app/paths'
import type { ResolvedPathname } from '$app/types'
import type { AvailableLanguages } from './Project.svelte.ts'
import { shareStartQuery, type ShareStartAction } from './shareStart.ts'

/*
 * The links and messages of the Examples, apart from the index and its schema (examples.ts), so a
 * page that only links to an example, as the home page does, does not load zod with them.
 */

/**
 * A short share link opens a fresh copy, just as a project payload does, starting as its flags say:
 * `action`, and `fullscreenDisplay` for the Screen in its floating window.
 */
export function exampleSharePath(
    id: string,
    action?: ShareStartAction,
    fullscreenDisplay = false
): string {
    return `${resolve('/projects/[project]', { project: 'share' })}?example=${encodeURIComponent(id)}${shareStartQuery(action)}${fullscreenDisplay ? '&fullscreenDisplay=true' : ''}`
}

export function examplesPath(
    id?: string,
    action?: ShareStartAction,
    isa?: AvailableLanguages
): ResolvedPathname {
    const query = new URLSearchParams()
    if (isa) query.set('isa', isa.toLowerCase())
    if (id !== undefined) query.set('example', id)
    if (action) query.set(action, 'true')
    return `${resolve('/examples')}${query.size ? `?${query}` : ''}` as ResolvedPathname
}

/**
 * The messages between a Project page shown on the Examples page and that page. The Project page
 * says whether its example has unsaved changes, and asks the Examples page to go where its own
 * top bar or a Save would go, instead of opening the site inside the frame.
 */
export const EXAMPLE_CHANGE_MESSAGE = 'asm-editor:example-change'
export const EXAMPLE_LEAVE_MESSAGE = 'asm-editor:example-leave'

/** Where a framed Project page may send the Examples page: a fixed set, never any path. */
export type ExampleDestination =
    | { to: 'home' }
    | { to: 'projects' }
    | { to: 'donate' }
    | { to: 'project'; id: string }

export function isExampleDestination(value: unknown): value is ExampleDestination {
    if (typeof value !== 'object' || value === null) return false
    const { to, id } = value as { to?: unknown; id?: unknown }
    if (to === 'project') return typeof id === 'string' && id.length > 0
    return to === 'home' || to === 'projects' || to === 'donate'
}

export function destinationPath(destination: ExampleDestination): ResolvedPathname {
    switch (destination.to) {
        case 'home':
            return resolve('/')
        case 'projects':
            return resolve('/projects')
        case 'donate':
            return resolve('/donate')
        case 'project':
            return resolve('/projects/[project]', { project: destination.id })
    }
}
