import type { Load } from '@sveltejs/kit'
import { getCourse, getCourseContent } from '$lib/content/getters'
import { redirectRetiredPage } from '$lib/content/redirects'

export const load: Load = async ({ params }) => {
    redirectRetiredPage(params.courseId)
    return {
        course: await getCourse(params.courseId),
        content: await getCourseContent(params.courseId)
    }
}
