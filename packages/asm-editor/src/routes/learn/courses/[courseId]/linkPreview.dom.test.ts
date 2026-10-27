/**
 * The link preview of a course and of its lectures: the root layout writes its image, the site's
 * own unless the course's load hands it one, and the pages add none of their own after it.
 */
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount, type Component } from 'svelte'
import { getCourse, type CourseWithModules } from '#lib/content/getters.ts'
import { load } from './+layout.server'

const page = vi.hoisted(() => ({
    params: { courseId: 'm68k', moduleId: 'basics', lectureId: 'registers' },
    url: new URL('https://asm-editor.specy.app/learn/courses/m68k/basics/registers')
}))
vi.mock('$app/state', () => ({ page }))
vi.mock('#lib/content/getters.ts', async (original) => ({
    ...(await original<typeof import('#lib/content/getters.ts')>()),
    getCourse: vi.fn()
}))
//Monaco does not run in jsdom, and no lecture here opens an editor
vi.mock('#lib/monaco/Monaco.ts', () => ({
    Monaco: { load: () => Promise.resolve(), dispose: () => {} }
}))

// jsdom has no Web Animations API, which the pages' transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
})

const lecture = { name: 'Registers', slug: 'registers', order: 0, description: 'The registers' }
const course: CourseWithModules = {
    id: 'm68k',
    name: 'M68K assembly',
    authors: [],
    description: 'The M68K course',
    slug: 'm68k',
    image: '',
    tags: [],
    date: '',
    order: 0,
    modules: [{ name: 'Basics', slug: 'basics', description: '', order: 0, lectures: [lecture] }]
}

/** The `og:image` tags a page writes into the head itself. */
function socialImagesOf(Page: Component<{ data: never }>, data: object) {
    const app = mount(Page, { target: document.body, props: { data: data as never } })
    flushSync()
    const images = [...document.head.querySelectorAll('meta[property="og:image"]')]
    void unmount(app)
    return images.map((meta) => meta.getAttribute('content'))
}

it('leaves the link preview image of a course page to the root layout', async () => {
    const CoursePage = (await import('./+page.svelte')).default
    expect(socialImagesOf(CoursePage, { course, content: '' })).toEqual([])
})

it('leaves the link preview image of a lecture page to the root layout', async () => {
    const LecturePage = (await import('./[moduleId]/[lectureId]/+page.svelte')).default
    const data = { course, lecture, content: '', topicLinks: null, instructions: [] }
    expect(socialImagesOf(LecturePage, data)).toEqual([])
})

it("gives the root layout a course's own image, and none for a course without one", async () => {
    const imageOf = async (image: string) => {
        vi.mocked(getCourse).mockResolvedValue({ ...course, image })
        const data = await load({ params: { courseId: 'm68k' } } as never)
        return data ? data.socialImage : null
    }
    expect(await imageOf('/images/m68k.webp')).toEqual({
        src: '/images/m68k.webp',
        alt: 'M68K assembly'
    })
    expect(await imageOf('')).toBeUndefined()
})
