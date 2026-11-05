import { markdownResponse } from '#lib/twins/format.ts'
import { instructionTwin } from '#lib/twins/documentation.ts'
import { entries as pageEntries, load } from '../[instructionName]/+page.server.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of an instruction page, from what the page's own `load` returns. */
export const prerender = true

export const entries: EntryGenerator = pageEntries

export const GET: RequestHandler = async ({ params }) => {
    const data = await load({ params } as Parameters<typeof load>[0])
    return markdownResponse(await instructionTwin('x86', params.instructionName, data))
}
