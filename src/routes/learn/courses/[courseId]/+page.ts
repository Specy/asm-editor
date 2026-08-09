import type { Load } from '@sveltejs/kit'
import type { CourseWithModules } from '$lib/content/getters'

export const load: Load<Record<'courseId', string>, { course: CourseWithModules }> = async ({
    data
}) => {
    return data
}
