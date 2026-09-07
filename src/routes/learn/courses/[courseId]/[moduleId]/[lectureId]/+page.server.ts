import type { Load } from '@sveltejs/kit'
import { getCourse, getLecture, getLectureContent, getTopicLinks } from '$lib/content/getters'
import { redirectRetiredPage } from '$lib/content/redirects'

export const load: Load = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    return {
        course: await getCourse(params.courseId),
        lecture: await getLecture(params.courseId, params.moduleId, params.lectureId),
        content: await getLectureContent(params.courseId, params.moduleId, params.lectureId),
        topicLinks: await getTopicLinks(params.courseId, params.moduleId, params.lectureId)
    }
}
