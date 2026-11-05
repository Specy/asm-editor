import { loaded } from '#lib/twins/pageData.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { lectureTwin } from '#lib/twins/content.ts'
import { lectureParams } from '#lib/twins/courses.ts'
import { load } from '../[lectureId]/+page.server.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of a Lecture, from what the Lecture page's own `load` returns. */
export const prerender = true

export const entries: EntryGenerator = () => lectureParams()

export const GET: RequestHandler = async ({ params }) => {
    const data = await loaded(load({ params } as Parameters<typeof load>[0]))
    return markdownResponse(await lectureTwin(params.moduleId, data))
}
