import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { chapters } from '$lib/documentation/mips/mips'
import { mipsInstructionMap } from '$lib/languages/MIPS/MIPS-documentation'
import { mipsInstructionContent } from '$lib/documentation/mips/instructionContent'
import { instructionDescription } from '$lib/documentation/instructions/content'

export const load = (async ({ params }) => {
    const instruction = mipsInstructionMap.get(params.instructionName)
    if (!instruction) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            instruction,
            content: mipsInstructionContent[params.instructionName],
            description: instructionDescription(
                mipsInstructionContent[params.instructionName],
                instruction[0].description
            ),
            name: params.instructionName
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../docs/design/documentation-search-plan.md), phase 2c).
 */
export const entries: EntryGenerator = () => {
    const instructions = chapters().find((chapter) => chapter.id === 'instructions')
    return (instructions?.entries ?? []).map((entry) => ({ instructionName: entry.title }))
}
