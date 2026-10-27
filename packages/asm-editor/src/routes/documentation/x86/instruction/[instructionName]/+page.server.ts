import { error } from '@sveltejs/kit'
import type { EntryGenerator, PageServerLoad } from './$types'
import { instructionLessons } from '#lib/content/lectureInstructions.ts'
import { x86InstructionMap, hasX86InstructionPage } from '#lib/languages/X86/X86-documentation.ts'
import { x86InstructionDocument } from '#lib/documentation/x86/instructionDocument.ts'
import { aliasesOf, aliasTarget } from '#lib/documentation/instructions/aliases.ts'
import type { InstructionExample } from '#lib/documentation/instructions/content.ts'
import { INSTRUCTION_PAGES } from '#lib/documentation/instructions/pages.ts'
import { buildX86Example } from './example'

export const load = (async ({ params }) => {
    const instruction = x86InstructionMap.get(params.instructionName)
    // The vector and system extensions are in the table but have no page: they are listed on the
    // complete documentation page instead.
    if (!instruction || !hasX86InstructionPage(params.instructionName)) {
        error(404, 'Instruction not found')
    }
    // `jnbe` is `ja`: its page stays, but names the main instruction's as the one to index.
    const main = aliasTarget('x86', instruction.name)
    // Generated here so the prerendered page carries the program in its HTML, for readers without
    // JavaScript. None for the instructions there is no safe program to show.
    const code = buildX86Example(instruction.name)
    const example: InstructionExample | undefined = code
        ? {
              target: 'X86',
              code,
              presentation: { showPc: true, showFlags: true, showConsole: true, showMemory: true }
          }
        : undefined
    return {
        canonicalPath: main ? `/documentation/x86/instruction/${main}` : undefined,
        props: {
            document: x86InstructionDocument(instruction),
            example,
            aliases: aliasesOf('x86', instruction.name),
            lessons: await instructionLessons('x86', instruction.name)
        }
    }
}) satisfies PageServerLoad

/**
 * Every instruction page, named rather than left for the crawler to find through the sidebar's list
 * ([the plan](../../../../../../../../docs/design/documentation-search-plan.md), phase 2c). The extensions
 * are not among them: they have no page.
 */
export const entries: EntryGenerator = () =>
    [...INSTRUCTION_PAGES.x86].map((instructionName) => ({ instructionName }))
