// Prerendered as empty shells, as `/embed` is, so `/exam` and `/exam/session` answer 200 instead of
// adapter-static's 404.html fallback. The session reads its exam from the query string on mount,
// so there is nothing to render at build time; the robots noindex and the titles are written by
// `hooks.server.ts`.
export const prerender = true
export const ssr = false
export const csr = true
