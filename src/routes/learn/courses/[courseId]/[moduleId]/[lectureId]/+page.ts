import type { Load } from '@sveltejs/kit'
import {
    type Course,
    type CourseWithModules,
    getLectureContent,
    type Lecture
} from '$lib/content/getters'

export const load: Load<
    Record<'courseId' | 'moduleId' | 'lectureId', string>,
    { course: CourseWithModules; lecture: Lecture }
> = async ({ data, params }) => {
    return {
        ...data
    }
}
