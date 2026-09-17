import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import PromptProvider from './PromptProvider.svelte'
import { Prompt } from '$stores/promptStore.svelte'

/**
 * Who has the keyboard while a program asks for input. A program that reads twice in a row — the
 * two numbers of EASy68K's task 18, a MARS `read_int` loop — answers one prompt and asks the next
 * one in the same turn, before the form of the first has finished leaving. Svelte keeps the element
 * it was about to remove instead of building a new one, so the input's own mount-time focus never
 * runs again and the second prompt was left with the focus wherever the answer put it: on the Ok
 * button when that is what the user clicked.
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
