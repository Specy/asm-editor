import { getAllCourses } from '#lib/content/getters.ts'
import { loaded } from '#lib/twins/pageData.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { courseTwin } from '#lib/twins/content.ts'
import { load } from '../[courseId]/+page.server.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/** The **Markdown twin** of a Course's page, from what the page's own `load` returns. */
export const prerender = true

export const entries: EntryGenerator = async () =>
    (await getAllCourses()).map((course) => ({ courseId: course.slug }))

export const GET: RequestHandler = async ({ params }) => {
    const data = await loaded(load({ params } as Parameters<typeof load>[0]))
    return markdownResponse(await courseTwin(data.course, data.content))
}
