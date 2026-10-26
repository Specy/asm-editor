import type { EntryGenerator, PageServerLoad } from './$types'
import { getCourse, getLecture, getLectureContent, getTopicLinks } from '#lib/content/getters.ts'
import { redirectRetiredPage, retiredPages } from '#lib/content/redirects.ts'
import { lectureInstructions } from '#lib/content/lectureInstructions.ts'

/** The retired lectures, which only a redirect page keeps reachable; the crawl finds the rest. */
export const entries: EntryGenerator = () =>
    retiredPages()
        .filter((slugs) => slugs.length === 3)
        .map(([courseId, moduleId, lectureId]) => ({ courseId, moduleId, lectureId }))

export const load: PageServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    const content = await getLectureContent(params.courseId, params.moduleId, params.lectureId)
    return {
        course: await getCourse(params.courseId),
        lecture: await getLecture(params.courseId, params.moduleId, params.lectureId),
        content,
        topicLinks: await getTopicLinks(params.courseId, params.moduleId, params.lectureId),
        instructions: lectureInstructions(content)
    }
}
