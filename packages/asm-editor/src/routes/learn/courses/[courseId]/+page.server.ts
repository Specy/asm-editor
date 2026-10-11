import type { PageServerLoad } from './$types'
import { getCourse, getCourseContent } from '#lib/content/getters.ts'
import { redirectRetiredPage } from '#lib/content/redirects.ts'

export const load: PageServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId)
    return {
        course: await getCourse(params.courseId),
        content: await getCourseContent(params.courseId)
    }
}
