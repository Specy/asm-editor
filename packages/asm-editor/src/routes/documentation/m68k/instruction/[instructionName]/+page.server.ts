import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { m68kInstructionDocument } from '#lib/documentation/m68k/instructionDocument.ts'

export const load = (async ({ params }) => {
    const instruction = M68KUncompoundedInstructions.get(params.instructionName)
    // Read here, so the page never loads the Core to list the forms.
    const document = m68kInstructionDocument(params.instructionName)
    if (!instruction || !document) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            document,
            example: instruction.interactiveExample?.code,
            lessons: await instructionLessons('m68k', params.instructionName)
        }
    }
}) satisfies PageServerLoad

export const entries: EntryGenerator = () => {
    return Array.from(M68KUncompoundedInstructions.keys()).map((instructionName) => ({
        instructionName
    }))
}
