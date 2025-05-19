import type { Load } from '@sveltejs/kit';
import { getCourse, getCourseContent } from '$lib/content/getters'

export const load: Load = async ({ params }) => {
    return {
        course: await getCourse(params.courseId),
        content: await getCourseContent(params.courseId)
    }
};