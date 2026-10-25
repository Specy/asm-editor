import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ErrorPage from './+error.svelte'

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }))

let app: ReturnType<typeof mount> | undefined

afterEach(async () => {
    if (app) await unmount(app)
    app = undefined
    document.body.replaceChildren()
})

it('renders a home button without nesting links or interactive controls', () => {
    app = mount(ErrorPage, { target: document.body })
    flushSync()

    const homeButton = document.querySelector<HTMLAnchorElement>('a.btn')
    expect(homeButton?.textContent).toContain('Click to go back')
    expect(homeButton?.getAttribute('href')).toBe('/')
    expect(document.querySelector('a a, a button, a input, a select, a textarea')).toBeNull()
})
