import { parseExamplesIndex } from '#lib/examples.ts'
import { markdownResponse } from '#lib/twins/format.ts'
import { examplesTwin } from '#lib/twins/content.ts'
import index from '../../../../examples/dist/index.json?raw'

/**
 * The **Markdown twin** of the Examples page, from the index the page fetches as
 * `/examples/index.json`, read through the same parser.
 */
export const prerender = true

export const GET = () => markdownResponse(examplesTwin(parseExamplesIndex(JSON.parse(index))))
