/**
 * The exam builder's one output is the link Create exam link copies. A browser that will not copy
 * it must not leave the teacher with nothing, so the page then shows the link to copy by hand.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { mount, unmount } from 'svelte'
import { decodeExamPayload } from '#lib/exam.ts'
import { toast } from '#stores/toastStore.ts'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})
//Monaco does not run in jsdom, so the editors wait for it forever; no Core loads in it either
vi.mock('#lib/monaco/Monaco.ts', () => ({
    Monaco: { load: () => Promise.resolve(), dispose: () => {}, get: () => new Promise(() => {}) }
}))
vi.mock('#cmp/shared/providers/EmulatorLoader.svelte', async () => ({
    default: (await import('#cmp/shared/providers/__fixtures__/EmulatorLoaderStub.svelte')).default
}))

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
    vi.spyOn(toast, 'logPill').mockImplementation(() => undefined)
    vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeText.mockReset()
    //jsdom has no clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

/** The exam builder with an unlock password set, and what Create exam link leaves on it. */
async function createExamLink() {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, { target })
    const password = target.querySelector<HTMLInputElement>('input[placeholder="Required"]')!
    password.value = 'teacher'
    password.dispatchEvent(new Event('input', { bubbles: true }))
    const create = [...target.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Create exam link'
    )!
    create.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    return {
        copied: writeText.mock.calls[0][0],
        shown: () =>
            target.querySelector<HTMLTextAreaElement>('textarea[aria-label="Exam link"]')?.value,
        dispose: () => unmount(component)
    }
}

it('shows the exam link to copy by hand when the browser will not copy it', async () => {
    writeText.mockImplementation(async () => {
        throw new DOMException('Document is not focused.', 'NotAllowedError')
    })
    const builder = await createExamLink()
    await vi.waitFor(() => expect(builder.shown()).toBe(builder.copied))
    const exam = new URL(builder.shown()!).searchParams.get('exam')!
    expect(decodeExamPayload(exam)?.title).toBe('Untitled exam')
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy the exam link to the clipboard.")
    await builder.dispose()
})

it('copies the exam link and shows nothing more when the browser lets it', async () => {
    writeText.mockResolvedValue(undefined)
    const builder = await createExamLink()
    await vi.waitFor(() =>
        expect(toast.logPill).toHaveBeenCalledWith('Exam link copied to clipboard')
    )
    expect(builder.shown()).toBeUndefined()
    await builder.dispose()
})
