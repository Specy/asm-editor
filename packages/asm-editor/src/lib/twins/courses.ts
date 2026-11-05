import { getAllCourses, getCourse } from '#lib/content/getters.ts'

/** Every Lecture of every Course, as the Lecture routes' params, in each Course's order. */
export async function lectureParams(
    course?: string
): Promise<{ courseId: string; moduleId: string; lectureId: string }[]> {
    const slugs = course ? [course] : (await getAllCourses()).map((course) => course.slug)
    const out: { courseId: string; moduleId: string; lectureId: string }[] = []
    for (const slug of slugs) {
        for (const module of (await getCourse(slug)).modules) {
            for (const lecture of module.lectures) {
                out.push({ courseId: slug, moduleId: module.slug, lectureId: lecture.slug })
            }
        }
    }
    return out
}
