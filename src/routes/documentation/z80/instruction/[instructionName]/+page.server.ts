import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import {
    formatZ80InstructionSummary,
    z80InstructionMap
} from '$lib/languages/Z80/Z80-documentation'
import { buildZ80Example } from './example'

export const load = (async ({ params }) => {
    const variants = z80InstructionMap.get(params.instructionName)
    if (!variants) {
        throw error(404, 'Instruction not found')
    }
    return {
        props: {
            variants,
            name: params.instructionName,
            summary: formatZ80InstructionSummary(variants),
            // Generated here so the page ships the example already assembled into the HTML, which
            // is what the prerendered pages serve to readers without JavaScript.
            example: buildZ80Example(params.instructionName, variants)
        }
    }
}) satisfies PageServerLoad
