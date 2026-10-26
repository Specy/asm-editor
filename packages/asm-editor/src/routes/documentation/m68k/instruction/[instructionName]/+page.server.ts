import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { m68kInstructionDocument } from '#lib/documentation/m68k/instructionDocument.ts'
import type { InstructionExample } from '#lib/documentation/instructions/content.ts'
import { INSTRUCTION_PAGES } from '#lib/documentation/instructions/pages.ts'

export const load = (async ({ params }) => {
    const instruction = M68KUncompoundedInstructions.get(params.instructionName)
    // Read here, so the page never loads the Core to list the forms.
    const document = m68kInstructionDocument(params.instructionName)
    if (!instruction || !document) error(404, 'Instruction not found')
    const code = instruction.interactiveExample?.code
    // With the Interactive editor's own panels, memory included.
    const example: InstructionExample | undefined = code
        ? { target: 'M68K', code, presentation: { showMemory: true } }
        : undefined
    return {
        props: {
            document,
            example,
            lessons: await instructionLessons('m68k', params.instructionName)
        }
    }
}) satisfies PageServerLoad

export const entries: EntryGenerator = () =>
    [...INSTRUCTION_PAGES.m68k].map((instructionName) => ({ instructionName }))
