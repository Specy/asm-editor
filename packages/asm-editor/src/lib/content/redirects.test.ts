import { isRedirect } from '@sveltejs/kit'
import { expect, it } from 'vite-plus/test'
import { redirectRetiredPage, retiredPages } from './redirects'
import { entries as courseEntries } from '../../routes/learn/courses/[courseId]/+page.server'
import { entries as lectureEntries } from '../../routes/learn/courses/[courseId]/[moduleId]/[lectureId]/+page.server'

/** Where a page's slugs are sent, or undefined when the page was not retired. */
function redirectOf(...slugs: string[]) {
    try {
        redirectRetiredPage(...slugs)
    } catch (thrown) {
        if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location }
        throw thrown
    }
    return undefined
}

it('hands every retired page to the prerender, which is the only way the static site has it', async () => {
    const prerendered = [
        ...(await courseEntries()).map(({ courseId }) => [courseId]),
        ...(await lectureEntries()).map(({ courseId, moduleId, lectureId }) => [
            courseId,
            moduleId,
            lectureId
        ])
    ]
    expect(prerendered.map((slugs) => slugs.join('/')).sort()).toEqual(
        retiredPages()
            .map((slugs) => slugs.join('/'))
            .sort()
    )
    expect(prerendered.length).toBeGreaterThan(0)
    for (const slugs of prerendered) expect(redirectOf(...slugs)?.status).toBe(301)
})

it('sends a retired lecture to the one that replaced it, not to where its course went', () => {
    expect(redirectOf('examples', 'm68k', 'fibonacci')).toEqual({
        status: 301,
        location: '/learn/courses/m68k/examples/factorial-and-fibonacci'
    })
    expect(redirectOf('examples')).toEqual({ status: 301, location: '/learn/courses' })
    expect(redirectOf('m68k', 'examples', 'factorial-and-fibonacci')).toBeUndefined()
})
