import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import type { InstructionLesson } from '#lib/content/lectureInstructions.ts'
import InstructionLessons from './InstructionLessons.svelte'

vi.mock('$app/paths', () => ({
    resolve: (path: string, params: Record<string, string> = {}) =>
        path.replace(/\[(\w+)\]/g, (_, key: string) => params[key])
}))

let app: ReturnType<typeof mount> | undefined

afterEach(async () => {
    if (app) await unmount(app)
    app = undefined
    document.body.replaceChildren()
})

function lessons(count: number, courseSlug = 'm68k'): InstructionLesson[] {
    return Array.from({ length: count }, (_, index) => ({
        name: `Lecture ${index + 1}`,
        course: courseSlug === 'm68k' ? 'M68K assembly' : 'Assembly basics',
        courseSlug,
        moduleSlug: 'module',
        lectureSlug: `lecture-${index + 1}`
    }))
}

it('links every Lecture before the list is opened, and opens it in place', () => {
    app = mount(InstructionLessons, {
        target: document.body,
        props: { lessons: [...lessons(5), ...lessons(1, 'assembly-basics')], language: 'M68K' }
    })
    flushSync()

    const links = [...document.querySelectorAll<HTMLAnchorElement>('li a')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
        ...lessons(5).map((lesson) => `/learn/courses/m68k/module/${lesson.lectureSlug}`),
        '/learn/courses/assembly-basics/module/lecture-1'
    ])
    expect(document.querySelectorAll('li.extra')).toHaveLength(3)
    expect(document.querySelectorAll('li.other')).toHaveLength(1)

    const more = document.querySelector<HTMLButtonElement>('button.more')!
    expect(more.textContent?.trim()).toBe('+3 more')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    flushSync()
    expect(document.querySelector('.lessons.open')).not.toBeNull()
    expect(document.querySelector('.label')?.textContent).toBe('Used in 6 lessons')
    expect(more.textContent?.trim()).toBe('Show fewer')
    expect(more.getAttribute('aria-expanded')).toBe('true')
})

it('shows a fourth Lecture rather than hiding it behind "+1 more"', () => {
    app = mount(InstructionLessons, {
        target: document.body,
        props: { lessons: lessons(4), language: 'M68K' }
    })
    flushSync()

    expect(document.querySelectorAll('li a')).toHaveLength(4)
    expect(document.querySelector('button.more')).toBeNull()
})
