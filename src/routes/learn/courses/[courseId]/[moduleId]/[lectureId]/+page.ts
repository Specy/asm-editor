import type { Load } from '@sveltejs/kit'
import type { CourseWithModules, Lecture } from '$lib/content/getters'

export const load: Load<
    Record<'courseId' | 'moduleId' | 'lectureId', string>,
    { course: CourseWithModules; lecture: Lecture }
> = async ({ data }) => {
    return {
        ...data
    }
}
