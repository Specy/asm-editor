import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { M68KUncompoundedInstructions } from '$lib/languages/M68K-documentation';

export const load = (async ({ params }) => {
    const instruction = M68KUncompoundedInstructions.get(params.instructionName);
    if(!instruction){
        throw error(404, 'Instruction not found');
    }
    return {
        props: {
            instruction
        }
    }
}) satisfies PageServerLoad;



