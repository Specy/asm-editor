import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { languageTwin } from '#lib/twins/documentation.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of a language's documentation hub. */
export const prerender = true

export const entries: EntryGenerator = () =>
    DOCUMENTATION_LANGUAGES.map((language) => ({ language }))

export const GET: RequestHandler = async ({ params }) =>
    markdownResponse(await languageTwin(params.language))
