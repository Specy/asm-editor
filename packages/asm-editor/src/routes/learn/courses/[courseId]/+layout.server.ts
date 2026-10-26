import type { LayoutServerLoad } from './$types'
import { getCourse } from '#lib/content/getters.ts'
import { redirectRetiredPage } from '#lib/content/redirects.ts'

export const load: LayoutServerLoad = async ({ params }) => {
    redirectRetiredPage(params.courseId, params.moduleId, params.lectureId)
    const course = await getCourse(params.courseId)
    return {
        course,
        //the root layout writes the link preview's image, the site's own unless a course has one
        socialImage: course.image ? { src: course.image, alt: course.name } : undefined
    }
}
