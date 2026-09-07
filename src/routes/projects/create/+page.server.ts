import type { PageServerLoad } from './$types'
import { getProjectTemplates } from '$lib/content/templates'

/**
 * Runs in the prerender, not in the browser: the templates are read out of `src/content`, which is
 * half a megabyte of lecture markdown, and only the ~30 short programs are wanted. The page ships
 * the result.
 */
export const load: PageServerLoad = async () => {
    return { templates: await getProjectTemplates() }
}
