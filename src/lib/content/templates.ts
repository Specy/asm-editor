import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { BASE_CODE } from '$lib/Config'
import { extractPlaygrounds } from '$lib/content/playgrounds'
import { X86_TEMPLATES } from '$lib/content/x86Templates'
import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The programs offered when a project is created.
 *
 * These are not a second copy of the course examples, they are the course examples: an Example whose
 * `meta.json` carries a `template` key is offered here, and its code is the first playground fence
 * of its page. That matters because `content/content.test.ts` already builds and runs every fence
 * against the real Cores, so a template cannot rot without the suite saying so, and a reader who
 * picks one and then finds the lecture reads the same program twice rather than two that disagree.
 *
 * The value of `template` is the order it appears in; the name and description are the Example's
 * own. Each of the six is spelled the same way in every Course, so the picker offers one list
 * whatever language is selected.
 *
 * Read from disk rather than bundled: the Examples are 492 KB of markdown and only ~30 short
 * programs are wanted, so this runs in the prerender of `/projects/create` and the page ships the
 * result. Node only, like `getters.ts`.
 */

const CONTENT = 'src/content'

/** Courses whose Examples are mirrored program for program. x86 has no course; see x86Templates. */
const BAREBONES_ID = 'barebones'

export type ProjectTemplate = {
    /** The Example's topic, or `barebones`. Stable across languages and across renames of the page. */
    id: string
    name: string
    description: string
    language: AvailableLanguages
    code: string
    /** Position in the picker. Barebones is always first. */
    order: number
}

/**
 * RISC-V-64 has one lecture of its own and no Examples, so it is offered the RV32 programs. They are
 * held to the same bar as everything else by `templates.test.ts`, which assembles every template
 * with the Core for its own language: an RV32 program that does not build as RV64 fails there
 * rather than reaching a reader.
 */
const INHERITS: Partial<Record<AvailableLanguages, AvailableLanguages>> = {
    'RISC-V-64': 'RISC-V'
}

function barebonesFor(language: AvailableLanguages): ProjectTemplate {
    return {
        id: BAREBONES_ID,
        name: 'Empty program',
        description: 'Simple skeleton template for writing a program in ' + language + '.',
        language,
        code: BASE_CODE[language],
        order: 0
    }
}

/** Every Example flagged with a `template` key, as the picker's entries. */
async function fromCourses(): Promise<ProjectTemplate[]> {
    const found: ProjectTemplate[] = []
    const courses = await fs.readdir(CONTENT, { withFileTypes: true })

    for (const course of courses) {
        if (!course.isDirectory()) continue
        const examples = join(CONTENT, course.name, 'examples')
        let topics: string[]
        try {
            topics = (await fs.readdir(examples, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
        } catch {
            //a course without an Examples module contributes nothing, which is not an error
            continue
        }

        for (const topic of topics) {
            const metaPath = join(examples, topic, 'meta.json')
            let meta: { name?: string; description?: string; template?: number; topic?: string }
            try {
                meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
            } catch {
                continue
            }
            if (typeof meta.template !== 'number') continue

            const markdown = await fs.readFile(join(examples, topic, 'index.md'), 'utf-8')
            const playground = extractPlaygrounds(markdown)[0]
            if (!playground) {
                throw new Error(
                    `${metaPath} is flagged as a template but its page has no playground fence`
                )
            }

            found.push({
                id: meta.topic ?? topic,
                name: meta.name ?? topic,
                description: meta.description ?? '',
                language: playground.settings.language,
                code: playground.code,
                order: meta.template
            })
        }
    }
    return found
}

/**
 * Every template, grouped by the language it is written in and ordered as the picker shows them.
 * A language with no Examples still gets its barebones entry, so the picker is never empty.
 */
export async function getProjectTemplates(): Promise<
    Record<AvailableLanguages, ProjectTemplate[]>
> {
    const fromContent = [...(await fromCourses()), ...X86_TEMPLATES]
    const languages = Object.keys(BASE_CODE) as AvailableLanguages[]
    const grouped = {} as Record<AvailableLanguages, ProjectTemplate[]>

    for (const language of languages) {
        const source = INHERITS[language] ?? language
        const inherited = fromContent
            .filter((template) => template.language === source)
            .map((template) => (source === language ? template : { ...template, language }))
        grouped[language] = [barebonesFor(language), ...inherited].sort(
            (a, b) => a.order - b.order || a.name.localeCompare(b.name)
        )
    }
    return grouped
}
