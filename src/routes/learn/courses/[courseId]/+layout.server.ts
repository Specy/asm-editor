import type { Load } from '@sveltejs/kit'
import { getCourse } from '$lib/content/getters'
import { redirectRetiredPage } from '$lib/content/redirects'

export const load: Load = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    return {
        course: await getCourse(params.courseId)
    }
}
