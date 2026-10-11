import type { LayoutServerLoad } from './$types'
import { getCourse } from '#lib/content/getters.ts'
import { redirectRetiredPage } from '#lib/content/redirects.ts'

export const load: LayoutServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    return {
        course: await getCourse(params.courseId)
    }
}
