import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { chapters } from '#lib/documentation/z80/z80.ts'
import { z80InstructionMap } from '#lib/languages/Z80/Z80-documentation.ts'
import { z80InstructionDocument } from '#lib/documentation/z80/instructionDocument.ts'
import { buildZ80Example } from './example'

export const load = (async ({ params }) => {
    const variants = z80InstructionMap.get(params.instructionName)
    if (!variants) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            document: z80InstructionDocument(params.instructionName),
            // Generated here so the page ships the example already assembled into the HTML, which
            // is what the prerendered pages serve to readers without JavaScript.
            example: buildZ80Example(params.instructionName, variants),
            lessons: await instructionLessons('z80', params.instructionName)
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../../../docs/design/documentation-search-plan.md), phase 2c).
 */
export const entries: EntryGenerator = () => {
    const instructions = chapters().find((chapter) => chapter.id === 'instructions')
    return (instructions?.entries ?? []).map((entry) => ({ instructionName: entry.title }))
}
