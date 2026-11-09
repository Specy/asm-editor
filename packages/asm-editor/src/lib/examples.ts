import { z } from 'zod'
import { AVAILABLE_LANGUAGES, type AvailableLanguages } from './Project.svelte.ts'
import { makeProjectFromArchive } from './projectArchive.ts'
import { SHARE_ID } from './shareId.ts'
import { languageLabel } from './languages/languageLabel.ts'
import type { ShareStartup } from './shareStart.ts'

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

/** Keep existing share links working when an example is replaced. */
export function canonicalExampleId(id: string): string {
    return id === 'risc-v-pacman' ? 'risc-v-relay-maze' : id
}

/** The example `id` names, and a fresh unsaved copy of its Project. */
export async function loadExample(id: string, fetcher: typeof fetch = fetch) {
    const example = (await loadExamples(fetcher)).find(
        (example) => example.id === canonicalExampleId(id)
    )
    if (!example) throw new ExampleNotFoundError()
    const response = await fetcher(`/examples/${example.archive}`)
    if (!response.ok) throw new Error('Could not load the example project')
    const { project } = await makeProjectFromArchive(await response.arrayBuffer())
    if (project.language !== example.language) throw new Error('The example has the wrong ISA')
    project.id = SHARE_ID
    return { example, project }
}

/** The `isa` the Examples page link filters by, spelled in lower case: `?isa=mips`. */
export function examplesIsa(value: string | null): AvailableLanguages | undefined {
    if (!value) return undefined
    return AVAILABLE_LANGUAGES.find((language) => language.toLowerCase() === value.toLowerCase())
}
