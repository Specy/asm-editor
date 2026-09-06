import type { Load } from '@sveltejs/kit'
import type { CourseWithModules, Lecture, TopicLinks } from '$lib/content/getters'

export const load: Load<
    Record<'courseId' | 'moduleId' | 'lectureId', string>,
    { course: CourseWithModules; lecture: Lecture; topicLinks: TopicLinks | null }
> = async ({ data }) => {
    return {
        ...data
    }
}
