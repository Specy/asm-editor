import type { EntryGenerator } from './$types'

/**
 * `[project]` is normally an id from the reader's own browser, which cannot be enumerated
 * at build time. Two values can: `share` and `exam` are the fixed targets every link out
 * of this app points at (see `createShareLink`), so they need files of their own.
 *
 * adapter-static's fallback is 404.html, so a route with no file is served with a 404
 * status. It still renders — the fallback hydrates and routes client-side — which is why
 * this went unnoticed, but it means every share link anyone posts reads as dead to a link
 * checker, an LMS, a chat client generating a preview, or a crawler.
 *
 * Only these two entries are generated, so per-project URLs behave exactly as before.
 */
export const prerender = true

export const entries: EntryGenerator = () => [{ project: 'share' }, { project: 'exam' }]
