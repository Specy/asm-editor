import { markdownResponse } from '#lib/twins/format.ts'
import { chapterParams, chapterTwin } from '#lib/twins/documentation.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of a Chapter page: its entries, each with a line and a link. */
export const prerender = true

export const entries: EntryGenerator = () => chapterParams()

export const GET: RequestHandler = async ({ params }) =>
    markdownResponse(await chapterTwin(params.language, params.page))
