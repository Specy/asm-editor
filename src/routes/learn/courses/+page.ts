import type { Load } from '@sveltejs/kit'
import { type Course } from '$lib/content/getters'

export const load: Load<Record<'courseId', string>, { courses: Course[] }> = async ({ data }) => {
    return {
        ...data
    }
}
