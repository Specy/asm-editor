import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { riscvInstructionMap } from '$lib/languages/RISC-V/RISC-V-documentation'

export const load = (async ({ params }) => {
    const instruction = riscvInstructionMap.get(params.instructionName)
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

