import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { mipsInstructionMap } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { mipsInstructionContent } from '#lib/documentation/mips/instructionContent.ts'
import { mipsInstructionDocument } from '#lib/documentation/mars/instructionDocument.ts'
import { INSTRUCTION_PAGES } from '#lib/documentation/instructions/pages.ts'

export const load = (async ({ params }) => {
    const instruction = mipsInstructionMap.get(params.instructionName)
    if (!instruction) error(404, 'Instruction not found')
    const content = mipsInstructionContent[params.instructionName]
    return {
        props: {
            document: mipsInstructionDocument(params.instructionName, instruction, content),
            example: content?.example,
            lessons: await instructionLessons('mips', params.instructionName)
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../../../docs/design/documentation-search-plan.md), phase 2c).
 */
export const entries: EntryGenerator = () =>
    [...INSTRUCTION_PAGES.mips].map((instructionName) => ({ instructionName }))
