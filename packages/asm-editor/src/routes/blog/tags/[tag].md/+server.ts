import { loaded } from '#lib/twins/pageData.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { tagTwin } from '#lib/twins/content.ts'
import { entries as pageEntries, load } from '../[tag]/+page.server.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of a Blog tag's page, from what the page's own `load` returns. */
export const prerender = true

export const entries: EntryGenerator = pageEntries

export const GET: RequestHandler = async ({ params }) => {
    const data = await loaded(load({ params } as Parameters<typeof load>[0]))
    return markdownResponse(tagTwin(data))
}
