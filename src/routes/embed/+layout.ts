// Prerendered as an empty shell: the route has to exist as a real file so it answers 200.
// adapter-static's fallback is 404.html, so a non-prerendered route is served with a 404
// status — which still renders here, but breaks link checkers and any LMS that validates
// a URL before framing it. Everything the page needs (code, testcases, panel settings)
// is read from the query string on mount, so there is nothing to render on the server.
export const prerender = true
export const ssr = false
export const csr = true
