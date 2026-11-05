import { markdownResponse } from '#lib/twins/format.ts'
import { documentationIndexTwin } from '#lib/twins/documentation.ts'

/** The **Markdown twin** of `/documentation`. */
export const prerender = true

export const GET = async () => markdownResponse(await documentationIndexTwin())
