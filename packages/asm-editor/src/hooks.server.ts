import type { Handle } from '@sveltejs/kit/hooks'
import { NOINDEX_PAGES } from '#lib/seo.ts'

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The robots noindex, and the title of a page prerendered as an empty shell, for the pages in
 * `NOINDEX_PAGES`. Written here because `transformPageChunk` runs while prerendering, where a
 * client-only page renders none of its own head.
 */
export const handle: Handle = async ({ event, resolve }) => {
    const noindex = NOINDEX_PAGES.get(event.url.pathname)
    if (!noindex) return resolve(event)
    const tags = [
        '<meta name="robots" content="noindex" />',
        ...(noindex.title ? [`<title>${escapeHtml(noindex.title)}</title>`] : [])
    ].join('\n        ')
    return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('</head>', `    ${tags}\n    </head>`)
    })
}
