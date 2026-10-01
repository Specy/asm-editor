import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { chapters } from '$lib/documentation/x86/x86'
import {
    describeX86Instruction,
    formatX86InstructionSummary,
    x86InstructionMap,
    x86InstructionTitle,
    hasX86InstructionPage
} from '$lib/languages/X86/X86-documentation'
import { buildX86Example } from './example'

export const load = (async ({ params }) => {
    const instruction = x86InstructionMap.get(params.instructionName)
    // The vector and system extensions are in the table but have no page: they are listed on the
    // complete documentation page instead.
    if (!instruction || !hasX86InstructionPage(params.instructionName)) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            instruction,
            name: instruction.name,
            title: x86InstructionTitle(instruction.name),
            description: describeX86Instruction(instruction.name),
            summary: formatX86InstructionSummary(instruction),
            // Generated here so the page ships the example already assembled into the HTML, which
            // is what the prerendered pages serve to readers without JavaScript. Null for the
            // instructions there is no safe program to show.
            example: buildX86Example(instruction.name)
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../docs/design/documentation-search-plan.md), phase 2c). The extensions
 * are not among them: they have no page.
 */
export const entries: EntryGenerator = () => {
    const instructions = chapters().find((chapter) => chapter.id === 'instructions')
    return (instructions?.entries ?? []).map((entry) => ({ instructionName: entry.title }))
}
