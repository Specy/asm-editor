import { markdownResponse } from '#lib/twins/format.ts'
import { changelogTwin } from '#lib/twins/content.ts'
import { versions } from '../changelog/versions.ts'

/** The **Markdown twin** of the changelog, from the versions its page lists. */
export const prerender = true

export const GET = () => markdownResponse(changelogTwin(versions))
