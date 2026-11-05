import { markdownResponse } from '#lib/twins/format.ts'
import { blogTwin } from '#lib/twins/content.ts'
import { load } from '../blog/+page.server.ts'

/** The **Markdown twin** of the blog's front page, from what the page's own `load` returns. */
export const prerender = true

export const GET = () => markdownResponse(blogTwin(load()))
