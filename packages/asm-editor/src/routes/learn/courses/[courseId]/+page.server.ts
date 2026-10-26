import type { EntryGenerator, PageServerLoad } from './$types'
import { getCourse, getCourseContent } from '#lib/content/getters.ts'
import { redirectRetiredPage, retiredPages } from '#lib/content/redirects.ts'

/** The retired courses, which only a redirect page keeps reachable; the crawl finds the rest. */
export const entries: EntryGenerator = () =>
    retiredPages()
        .filter((slugs) => slugs.length === 1)
        .map(([courseId]) => ({ courseId }))

export const load: PageServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId)
    return {
        course: await getCourse(params.courseId),
        content: await getCourseContent(params.courseId)
    }
}
