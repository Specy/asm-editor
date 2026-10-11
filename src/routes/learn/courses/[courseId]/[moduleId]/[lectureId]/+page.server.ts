import type { PageServerLoad } from './$types'
import { getCourse, getLecture, getLectureContent, getTopicLinks } from '#lib/content/getters.ts'
import { redirectRetiredPage } from '#lib/content/redirects.ts'

export const load: PageServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    return {
        course: await getCourse(params.courseId),
        lecture: await getLecture(params.courseId, params.moduleId, params.lectureId),
        content: await getLectureContent(params.courseId, params.moduleId, params.lectureId),
        topicLinks: await getTopicLinks(params.courseId, params.moduleId, params.lectureId)
    }
}
