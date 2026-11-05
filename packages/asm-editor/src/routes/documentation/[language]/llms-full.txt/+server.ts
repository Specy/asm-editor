import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { textResponse } from '#lib/twins/format.ts'
import { documentationFull } from '#lib/twins/documentation.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** A language's whole Documentation in one file: every entry's **Markdown twin**, in order. */
export const prerender = true

export const entries: EntryGenerator = () =>
    DOCUMENTATION_LANGUAGES.map((language) => ({ language }))

export const GET: RequestHandler = async ({ params }) =>
    textResponse(await documentationFull(params.language))
