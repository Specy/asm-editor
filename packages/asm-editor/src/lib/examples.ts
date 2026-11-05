import { z } from 'zod'
import { AVAILABLE_LANGUAGES, type AvailableLanguages } from './Project.svelte.ts'
import { makeProjectFromArchive } from './projectArchive.ts'
import { SHARE_ID } from './shareId.ts'
import { languageLabel } from './languages/languageLabel.ts'
import { resolve } from '$app/paths'
import type { ResolvedPathname } from '$app/types'
import { shareStartQuery, type ShareStartAction, type ShareStartup } from './shareStart.ts'

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const indexSchema = z.object({
    version: z.literal(1),
    examples: z.record(
        slug,
        z.object({
            name: z.string().min(1),
            description: z.string(),
            ports: z
                .array(
                    z.object({
                        target: z.enum(
                            AVAILABLE_LANGUAGES as [AvailableLanguages, ...AvailableLanguages[]]
                        ),
                        archive: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\.asmproj$/),
                        variant: slug.optional(),
                        bytes: z.number().int().nonnegative().optional(),
                        name: z.string().optional(),
                        description: z.string().optional(),
                        startup: z
                            .object({
                                build: z.boolean().optional(),
                                buildAndRun: z.boolean().optional(),
                                fullscreenDisplay: z.boolean().optional()
                            })
                            .optional()
                    })
                )
                .min(1)
        })
    )
})

export type Example = {
    /** The ISA and repository slug, independent of the display name and folder location. */
    id: string
    name: string
    label: string
    description: string
    language: AvailableLanguages
    variant?: string
    archive: string
    /** The archive's size, when the index gives it. */
    bytes?: number
    /** What the Examples page opens it with when its link gives no flags, as a game's runs it. */
    startup?: ShareStartup
}

/**
 * The index's ports as examples. Two ports whose ids are spelled the same, `x86` with `a-b` and
 * `x86` with `a` and variant `b`, cannot both have a link: the first keeps it, and the other is
 * left out with a warning rather than taking every example down with it.
 */
export function parseExamplesIndex(input: unknown): Example[] {
    const index = indexSchema.parse(input)
    const ids = new Set<string>()
    return Object.entries(index.examples)
        .flatMap(([slug, example]) =>
            example.ports.flatMap((port) => {
                const id = `${port.target.toLowerCase()}-${slug}${port.variant ? `-${port.variant}` : ''}`
                if (ids.has(id)) {
                    console.warn(`Two examples have the id ${id}; ${port.archive} is left out`)
                    return []
                }
                ids.add(id)
                const name = port.name ?? example.name
                return [
                    {
                        id,
                        name,
                        label: `${languageLabel(port.target)}: ${name}${port.variant ? ` (${port.variant})` : ''}`,
                        description: port.description ?? example.description,
                        language: port.target,
                        variant: port.variant,
                        archive: port.archive,
                        bytes: port.bytes,
                        startup: port.startup
                    }
                ]
            })
        )
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * An archive small enough to open on a visit that asked for no example in particular. Archives
 * compress: Bad Apple!!'s 90 KB hold 3.4 MB of source, which this keeps out.
 */
const LIGHT_EXAMPLE_BYTES = 64 * 1024

/**
 * The example a visit to the Examples page opens when its link names none: the first small one,
 * since the first by name may be an operating system of several megabytes.
 */
export function defaultExample(examples: readonly Example[]): Example | undefined {
    return (
        examples.find((example) => (example.bytes ?? Infinity) <= LIGHT_EXAMPLE_BYTES) ??
        examples[0]
    )
}

export async function loadExamples(fetcher: typeof fetch = fetch): Promise<Example[]> {
    const response = await fetcher('/examples/index.json')
    if (!response.ok) throw new Error('Could not load the examples')
    return parseExamplesIndex(await response.json())
}

export class ExampleNotFoundError extends Error {
    constructor() {
        super('This example is not available')
    }
}

/** The example `id` names, and a fresh unsaved copy of its Project. */
export async function loadExample(id: string, fetcher: typeof fetch = fetch) {
    const example = (await loadExamples(fetcher)).find((example) => example.id === id)
    if (!example) throw new ExampleNotFoundError()
    const response = await fetcher(`/examples/${example.archive}`)
    if (!response.ok) throw new Error('Could not load the example project')
    const { project } = await makeProjectFromArchive(await response.arrayBuffer())
    if (project.language !== example.language) throw new Error('The example has the wrong ISA')
    project.id = SHARE_ID
    return { example, project }
}

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

export function examplesPath(id?: string, action?: ShareStartAction): ResolvedPathname {
    const query = new URLSearchParams()
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
