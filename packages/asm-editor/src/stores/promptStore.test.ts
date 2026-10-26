import { afterEach, describe, expect, it } from 'vite-plus/test'
import { Prompt, PromptType } from '#stores/promptStore.svelte.ts'

afterEach(() => Prompt.cancel())

describe('a confirm an abort takes back', () => {
    it('is answered as any confirm is', async () => {
        const controller = new AbortController()
        const answer = Prompt.confirmUntilAborted('Replace main.s?', controller.signal)
        expect(Prompt.type).toBe(PromptType.Confirm)
        expect(Prompt.question).toBe('Replace main.s?')
        Prompt.answerConfirm(true)
        expect(await answer).toBe(true)
    })

    it('is dismissed by the abort, which answers it as a dismissal does', async () => {
        const controller = new AbortController()
        const answer = Prompt.confirmUntilAborted('Replace main.s?', controller.signal)
        controller.abort()
        expect(await answer).toBeNull()
        expect(Prompt.promise).toBeNull()
    })

    it('leaves alone the prompt that replaced it', async () => {
        const controller = new AbortController()
        const first = Prompt.confirmUntilAborted('Replace main.s?', controller.signal)
        const second = Prompt.askText('Name?')
        expect(await first).toBeNull()
        controller.abort()
        expect(Prompt.question).toBe('Name?')
        Prompt.answerText('main.c')
        expect(await second).toBe('main.c')
    })
})
