import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { chapters } from '#lib/documentation/riscv/riscv.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { riscvInstructionContent } from '#lib/documentation/riscv/instructionContent.ts'
import { riscvInstructionDocument } from '#lib/documentation/mars/instructionDocument.ts'

export const load = (async ({ params }) => {
    const instruction = riscvInstructionMap.get(params.instructionName)
    if (!instruction) {
        throw error(404, 'Instruction not found')
    }
    const content = riscvInstructionContent[params.instructionName]
    return {
        props: {
            document: riscvInstructionDocument(params.instructionName, instruction, content),
            content
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
