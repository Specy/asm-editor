import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import PromptProvider from './PromptProvider.svelte'
import { Prompt } from '$stores/promptStore.svelte'

/**
 * Who has the keyboard while a dialog asks for text. A program that opens two input dialogs in a
 * row — MARS's service 51 for each of two numbers — answers one prompt and asks the next one in the
 * same turn, before the form of the first has finished leaving. Svelte keeps the element it was
 * about to remove instead of building a new one, so the input's own mount-time focus never runs
 * again and the second prompt was left with the focus wherever the answer put it: on the Ok button
 * when that is what the user clicked. (A program's own reads are typed in the Terminal, ADR 0036.)
 */

/** jsdom has no Web Animations API, and the form leaves through a Svelte transition. */
beforeAll(() => {
    const element = Element.prototype as unknown as {
        animate?: unknown
        getAnimations?: unknown
    }
    if (typeof element.animate === 'function') return
    element.animate = () => {
        const animation = {
            onfinish: null as null | (() => void),
            oncancel: null,
            currentTime: 0,
            playState: 'running',
            cancel() {
                animation.playState = 'idle'
            },
            finish() {
                animation.playState = 'finished'
                animation.onfinish?.()
            },
            play() {},
            pause() {},
            reverse() {}
        }
        setTimeout(() => animation.finish(), 0)
        return animation
    }
    element.getAnimations = () => []
})

let app: ReturnType<typeof mount> | null = null

afterEach(() => {
    Prompt.cancel()
    if (app) unmount(app)
    app = null
    document.body.innerHTML = ''
})

function render() {
    app = mount(PromptProvider, { target: document.body })
}

function input(): HTMLInputElement | null {
    return document.querySelector('input')
}

function okButton(): HTMLButtonElement {
    const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === 'Ok'
    )
    if (!button) throw new Error('the prompt has no Ok button')
    return button as HTMLButtonElement
}

/** Everything the prompt schedules for itself, the effect's own `tick` included. */
async function settled() {
    flushSync()
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the input prompt', () => {
    it('shows a suggested path as a placeholder and clears it for the next prompt', async () => {
        render()
        const file = Prompt.askText('Save File', true, 'scores.txt')
        await settled()
        expect(input()?.placeholder).toBe('scores.txt')
        expect(input()?.value).toBe('')
        Prompt.cancel()
        expect(await file).toBeNull()
        const next = Prompt.askText('Number?')
        await settled()
        expect(input()?.placeholder).toBe('')
        Prompt.answerText('12')
        expect(await next).toBe('12')
    })
    it('focuses the input of the prompt being asked', async () => {
        render()
        const asked = Prompt.askText('first')
        await settled()

        expect(input()).not.toBeNull()
        expect(document.activeElement).toBe(input())

        Prompt.answerText('1')
        expect(await asked).toBe('1')
    })

    it('focuses the input again when a program asks a second time straight away', async () => {
        render()
        const first = Prompt.askText('first')
        await settled()
        const firstInput = input()

        //the user clicks Ok rather than pressing Enter, which leaves the focus on the button, and
        //the program asks its next question in the same turn
        okButton().focus()
        Prompt.answerText('1')
        expect(await first).toBe('1')
        const second = Prompt.askText('second')
        await settled()

        expect(input()).toBe(firstInput)
        expect(document.activeElement).toBe(input())
        expect(input()?.value).toBe('')

        Prompt.answerText('2')
        expect(await second).toBe('2')
    })

    it('focuses the input of a prompt asked long after the last one closed', async () => {
        render()
        const first = Prompt.askText('first')
        await settled()
        Prompt.answerText('1')
        expect(await first).toBe('1')

        //past the form's outro, so this prompt builds an element of its own
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(document.querySelector('form')).toBeNull()

        const second = Prompt.askText('second')
        await settled()
        expect(document.activeElement).toBe(input())

        Prompt.answerText('2')
        expect(await second).toBe('2')
    })
})

function buttons(): HTMLButtonElement[] {
    return [...document.querySelectorAll('button')]
}

function button(label: string): HTMLButtonElement {
    const found = buttons().find((candidate) => candidate.textContent?.trim() === label)
    if (!found) throw new Error(`the prompt has no ${label} button`)
    return found
}

/** The dialogs a MARS or RARS program opens, beside the app's own questions. */
describe('the dialogs of a program', () => {
    it('offers Cancel on a confirm only when asked, so the app keeps its Yes and No', async () => {
        render()
        const appConfirm = Prompt.confirm('Delete the file?')
        await settled()
        expect(buttons().map((candidate) => candidate.textContent?.trim())).toEqual(['No', 'Yes'])
        Prompt.answerConfirm(true)
        expect(await appConfirm).toBe(true)

        const dialog = Prompt.confirmOrCancel('Sure?')
        await settled()
        expect(buttons().map((candidate) => candidate.textContent?.trim())).toEqual([
            'Cancel',
            'No',
            'Yes'
        ])
        button('Cancel').click()
        expect(await dialog).toBeNull()
    })

    it('answers Yes and No on a confirm that offers Cancel', async () => {
        render()
        const dialog = Prompt.confirmOrCancel('Sure?')
        await settled()
        button('No').click()
        expect(await dialog).toBe(false)
    })

    it('shows a message with an Ok that takes the keyboard and dismisses it', async () => {
        render()
        let dismissed = false
        const shown = Prompt.alert('Done').then(() => (dismissed = true))
        await settled()
        expect(document.querySelector('.prompt-text')?.textContent?.trim()).toBe('Done')
        expect(input()).toBeNull()
        expect(document.activeElement).toBe(button('Ok'))
        expect(dismissed).toBe(false)
        button('Ok').click()
        await shown
        expect(dismissed).toBe(true)
    })

    it('dismisses a message on Enter, which submits its form', async () => {
        render()
        const shown = Prompt.alert('Done')
        await settled()
        document.querySelector('form')?.requestSubmit()
        await shown
        expect(Prompt.promise).toBeNull()
    })
})
