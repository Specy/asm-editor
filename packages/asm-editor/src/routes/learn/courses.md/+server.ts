import { getAllCourses } from '#lib/content/getters.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { coursesTwin } from '#lib/twins/content.ts'

/** The **Markdown twin** of the list of Courses. */
export const prerender = true

export const GET = async () => markdownResponse(coursesTwin(await getAllCourses()))
