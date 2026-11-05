import { getAllCourses } from '#lib/content/getters.ts'
import { textResponse } from '#lib/twins/format.ts'
import { llmsTxt } from '#lib/twins/llms.ts'

/** The site's index for language-model agents ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)). */
export const prerender = true

export const GET = async () => textResponse(await llmsTxt(await getAllCourses()))
