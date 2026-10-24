// Prerendered as an empty shell, as `/embed` is, so the navbar's link answers 200 instead of
// adapter-static's 404.html fallback. The chat lives in the browser and reads nothing at
// prerender time; its robots noindex and title are written by `hooks.server.ts`.
export const prerender = true
export const ssr = false
export const csr = true
