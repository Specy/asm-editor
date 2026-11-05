import { getAllCourses } from '#lib/content/getters.ts'
import { loaded } from '#lib/twins/pageData.ts'
import { textResponse } from '#lib/twins/format.ts'
import { courseFull, courseTwin, lectureTwin } from '#lib/twins/content.ts'
import { lectureParams } from '#lib/twins/courses.ts'
import { load as courseLoad } from '../+page.server.ts'
import { load as lectureLoad } from '../[moduleId]/[lectureId]/+page.server.ts'
import type { EntryGenerator, RequestHandler } from './$types'

/**
 * A whole Course in one file: its **Markdown twin**, then every Lecture's, in order, each from what
 * its page's own `load` returns.
 */
export const prerender = true

export const entries: EntryGenerator = async () =>
    (await getAllCourses()).map((course) => ({ courseId: course.slug }))

export const GET: RequestHandler = async ({ params }) => {
    const course = await loaded(courseLoad({ params } as Parameters<typeof courseLoad>[0]))
    const lectures: string[] = []
    for (const lecture of await lectureParams(params.courseId)) {
        const data = await loaded(
            lectureLoad({ params: lecture } as Parameters<typeof lectureLoad>[0])
        )
        lectures.push(await lectureTwin(lecture.moduleId, data))
    }
    return textResponse(courseFull(await courseTwin(course.course, course.content), lectures))
}
