/**
 * The button that opens a lecture's coding agent lives in the course navbar, which the layout
 * owns, while the agent itself belongs to the lecture page below it. A lecture announces itself
 * here while it is mounted, so the navbar offers "Ask AI" on a lecture and the plain AI Chat link
 * everywhere else in the course.
 */
export const lectureAgent = $state({
    available: false,
    open: false
})
