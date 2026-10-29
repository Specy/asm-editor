import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ErrorPage from './+error.svelte'

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }))
// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []
const page = vi.hoisted(() => ({
    status: 404,
    url: new URL('http://localhost/missing/page'),
    error: { message: 'Not Found' } as { message: string } | null
}))
vi.mock('$app/state', () => ({ page }))

let app: ReturnType<typeof mount> | undefined

afterEach(async () => {
    if (app) await unmount(app)
    app = undefined
    document.body.replaceChildren()
})

function heading() {
    return document.querySelector('[role="alert"] [role="heading"]')?.textContent
}

it('says a missing page is missing, with ways back and no links nested in links', () => {
    page.status = 404
    app = mount(ErrorPage, { target: document.body })
    flushSync()

    expect(heading()).toBe("This page doesn't exist")
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('/missing/page')
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[role="alert"] a.btn')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/',
        '/projects',
        '/documentation'
    ])
    //a missing page is no error of the site's, so there is nothing to report
    expect(document.querySelector('.error-message')).toBeNull()
    expect(document.querySelector('a a, a button, a input, a select, a textarea')).toBeNull()
})

it('offers Reload and a report for a failure of the site itself', () => {
    page.status = 500
    page.error = { message: 'Internal Error' }
    app = mount(ErrorPage, { target: document.body })
    flushSync()

    expect(heading()).toBe('Something went wrong')
    expect(document.querySelector('.error-message')?.textContent).toBe('Internal Error')
    const buttons = [...document.querySelectorAll('[role="alert"] button')]
    expect(buttons.some((button) => button.textContent?.includes('Reload the page'))).toBe(true)
})
