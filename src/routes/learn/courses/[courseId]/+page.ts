import type { Load } from '@sveltejs/kit'
import { type Course, type CourseWithModules, getCourseContent } from '$lib/content/getters'

export const load: Load<Record<'courseId', string>, { course: CourseWithModules }> = async ({ data, params }) => {
    return {
        data,
        children: [
            await getCourseContent(params.courseId)
        ]
    }
}