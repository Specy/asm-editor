import type { Load } from '@sveltejs/kit'
import { getAllCourses } from '$lib/content/getters'

export const load: Load = async () => {
    return {
        courses: await getAllCourses()
    }
}