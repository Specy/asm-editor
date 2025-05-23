import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { mipsInstructionMap } from '$lib/languages/MIPS/MIPS-documentation'

export const load = (async ({ params }) => {
    const instruction = mipsInstructionMap.get(params.instructionName)
    if (!instruction) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            instruction,
            name: params.instructionName
        }
    }
}) satisfies PageServerLoad
