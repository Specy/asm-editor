/**
 * The guards an exam session runs under: leaving fullscreen or the tab pauses the exam, and the
 * browser's find and print shortcuts are held back. Unlocking a finished exam with the teacher's
 * password reopens it under the same guards it started with.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { mount, unmount } from 'svelte'
import { encodeExamPayload, ExamSectionType, type ExamPayload } from '#lib/exam.ts'
import { makeHash } from '#lib/utils.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})
const page = vi.hoisted(() => ({ url: new URL('https://asm-editor.specy.app/exam/session') }))
vi.mock('$app/state', () => ({ page }))
vi.mock('$app/navigation', () => ({ goto: vi.fn() }))
//Monaco does not run in jsdom, and the exam here has no code to write
vi.mock('#lib/monaco/Monaco.ts', () => ({ Monaco: { load: () => {}, dispose: () => {} } }))
vi.mock('#lib/languages/Emulator.ts', async (original) => ({
    ...(await original<typeof import('#lib/languages/Emulator.ts')>()),
    preloadAllEmulators: () => {}
}))

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

beforeEach(() => {
    vi.spyOn(Prompt, 'askText').mockResolvedValue('Ada')
    vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    vi.spyOn(toast, 'logPill').mockImplementation(() => undefined)
    vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    //jsdom has neither fullscreen nor a clipboard
    document.documentElement.requestFullscreen = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn(async () => {}) }
    })
})
afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
    localStorage.clear()
})

/** An exam session of one multiple-choice question, once the student has started it. */
async function startExam(unlockPassword: string) {
    const exam: ExamPayload = {
        version: 2,
        title: 'Registers',
        instructions: '',
        unlockPasswordHash: (await makeHash(unlockPassword)).slice(0, 6),
        timeLimit: -1,
        sections: [
            {
                id: 'q1',
                type: ExamSectionType.MultipleChoice,
                title: '',
                prompt: 'Which register holds the result?',
                allowMultiple: false,
                options: [
                    { id: 'd0', text: 'd0' },
                    { id: 'a7', text: 'a7' }
                ]
            }
        ]
    }
    page.url = new URL(`https://asm-editor.specy.app/exam/session?exam=${encodeExamPayload(exam)}`)
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, { target })
    const button = (label: string) =>
        [...target.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === label
        )
    await vi.waitFor(() => expect(button('Finish exam')).toBeDefined())
    return {
        button,
        heading: () => target.querySelector('.overlay h1')?.textContent?.trim(),
        dispose: () => unmount(component)
    }
}

/** Whether the exam holds back the browser's find shortcut. */
function holdsBackFind() {
    const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
}

it('puts the guards back on a finished exam the teacher unlocks', async () => {
    const session = await startExam('teacher')
    expect(holdsBackFind()).toBe(true)

    session.button('Finish exam')!.click()
    await vi.waitFor(() => expect(session.heading()).toBe('Exam Finished'))
    expect(holdsBackFind()).toBe(false)

    const password = document.querySelector<HTMLInputElement>(
        'input[placeholder="Unlock password"]'
    )!
    password.value = 'teacher'
    password.dispatchEvent(new Event('input', { bubbles: true }))
    session.button('Unlock')!.click()
    await vi.waitFor(() => expect(toast.logPill).toHaveBeenCalledWith('Exam unlocked'))
    expect(session.heading()).toBeUndefined()

    expect(holdsBackFind()).toBe(true)
    //the student switches to another window
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    window.dispatchEvent(new Event('blur'))
    await vi.waitFor(() => expect(session.heading()).toBe('Exam disabled'))
    session.dispose()
})
