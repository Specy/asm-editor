import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { z80InstructionMap } from '#lib/languages/Z80/Z80-documentation.ts'
import { z80InstructionDocument } from '#lib/documentation/z80/instructionDocument.ts'
import type { InstructionExample } from '#lib/documentation/instructions/content.ts'
import { INSTRUCTION_PAGES } from '#lib/documentation/instructions/pages.ts'
import { buildZ80Example } from './example'

export const load = (async ({ params }) => {
    const variants = z80InstructionMap.get(params.instructionName)
    if (!variants) error(404, 'Instruction not found')
    // Generated here so the prerendered page carries the program in its HTML, for readers without
    // JavaScript.
    const example: InstructionExample = {
        target: 'Z80',
        code: buildZ80Example(params.instructionName, variants),
        presentation: { showPc: true, showFlags: true, showConsole: true, showMemory: true }
    }
    return {
        props: {
            document: z80InstructionDocument(params.instructionName),
            example,
            lessons: await instructionLessons('z80', params.instructionName)
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../../../docs/design/documentation-search-plan.md), phase 2c).
 */
export const entries: EntryGenerator = () =>
    [...INSTRUCTION_PAGES.z80].map((instructionName) => ({ instructionName }))
