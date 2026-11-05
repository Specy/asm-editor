import { markdownResponse } from '#lib/twins/format.ts'
import { documentationEntryParams, entryTwin } from '#lib/twins/documentation.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/**
 * The **Markdown twin** of a Documentation entry that has no page of its own, one level below its
 * Chapter page at its anchor. An instruction's is beside its page, under each language's route.
 */
export const prerender = true

export const entries: EntryGenerator = () => documentationEntryParams()

export const GET: RequestHandler = async ({ params }) =>
    markdownResponse(await entryTwin(params.language, params.page, params.anchor))
