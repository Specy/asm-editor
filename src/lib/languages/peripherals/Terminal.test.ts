import { beforeEach, describe, expect, it } from 'vitest'
import { Prompt } from '$stores/promptStore.svelte'
import { ExecutionController } from '$lib/languages/ExecutionController'
import { Keyboard } from './Keyboard'
import { Terminal } from './Terminal.svelte'

function makeTerminal() {
    const executionController = new ExecutionController(() => Prompt.cancel())
    const terminal = new Terminal({ executionController })
    const keyboard = new Keyboard()
    const echoed: string[] = []
    return {
        terminal,
        keyboard,
        echoed,
        executionController,
        execution: executionController.capture(),
        useKeyboard: () => terminal.useKeyboardInput(keyboard, (text) => echoed.push(text))
    }
}

/** Lets a suspended read see what was typed before the test asserts on it. */
function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('scripted input', () => {
    it('still answers reads in order, without echoing them', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['first', '42'])
        expect(await terminal.readAsync('q', execution)).toBe('first')
        expect(await terminal.readAsync('q', execution)).toBe('42')
        expect(terminal.output).toBe('')
    })

    it('still fails when it runs out', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput([])
        await expect(terminal.readAsync('q', execution)).rejects.toThrow('does not have any values')
    })

    it('does not consume live Screen input', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        keyboard.typeText('live\n')
        terminal.useScriptedInput(['scripted'])
        expect(await terminal.readAsync('q', execution)).toBe('scripted')
        expect(keyboard.typedCount).toBe(5)
    })

    it('reports its remaining values as pending input', () => {
        const { terminal } = makeTerminal()
        terminal.useScriptedInput(['one'])
        expect(terminal.hasPendingInput()).toBe(true)
        terminal.useScriptedInput([])
        expect(terminal.hasPendingInput()).toBe(false)
    })

    it('takes the first character of its value for a character read', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['xyz'])
        expect(await terminal.readCharAsync('q', execution)).toBe('x')
    })
})

describe('prompt input', () => {
    beforeEach(() => Prompt.cancel())

    it('remains the source when no Keyboard is configured', async () => {
        const { terminal, execution } = makeTerminal()
        expect(terminal.interactiveSource).toBe('prompt')
        const read = terminal.readAsync('Enter a line of text', execution)
        expect(Prompt.question).toBe('Enter a line of text')
        Prompt.answerText('hello')
        expect(await read).toBe('hello')
        //the prompt path echoes the whole line plus the Enter that submitted it, as it always did
        expect(terminal.output).toBe('hello\n')
    })

    it('answers a character read with the first character of the line', async () => {
        const { terminal, execution } = makeTerminal()
        const read = terminal.readCharAsync('Enter a character', execution)
        Prompt.answerText('ab')
        expect(await read).toBe('a')
    })

    it('promises no pending input, because a prompt cannot know', () => {
        const { terminal } = makeTerminal()
        expect(terminal.hasPendingInput()).toBe(false)
    })
})

describe('Screen keyboard input', () => {
    it('consumes one typed character as soon as one is available', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        expect(terminal.interactiveSource).toBe('keyboard')
        keyboard.typeText('ab')
        expect(await terminal.readCharAsync('q', execution)).toBe('a')
        expect(await terminal.readCharAsync('q', execution)).toBe('b')
        //echoed into the transcript and, through the callback, onto the Screen's text layer
        expect(terminal.output).toBe('ab')
        expect(echoed).toEqual(['a', 'b'])
    })

    it('suspends a character read until something is typed', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        let answer: string | undefined
        const read = terminal.readCharAsync('q', execution).then((value) => (answer = value))
        await settle()
        expect(answer).toBeUndefined()
        keyboard.typeText('z')
        await read
        expect(answer).toBe('z')
    })

    it('reports the typed queue as pending input, without consuming it', () => {
        const { terminal, keyboard, useKeyboard } = makeTerminal()
        useKeyboard()
        expect(terminal.hasPendingInput()).toBe(false)
        keyboard.typeText('a')
        expect(terminal.hasPendingInput()).toBe(true)
        expect(keyboard.typedCount).toBe(1)
    })

    it('waits for Enter on a line read and keeps the line out of the answer', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        let answer: string | undefined
        const read = terminal.readAsync('q', execution).then((value) => (answer = value))
        keyboard.typeText('12')
        await settle()
        expect(answer).toBeUndefined()
        keyboard.typeText('3\n')
        await read
        expect(answer).toBe('123')
        expect(terminal.output).toBe('123\n')
        expect(echoed).toEqual(['1', '2', '3', '\n'])
    })

    it('edits the line with backspace and erases what it echoed', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        terminal.write('> ')
        const read = terminal.readAsync('q', execution)
        keyboard.typeText('ab\bc\n')
        expect(await read).toBe('ac')
        expect(terminal.output).toBe('> ac\n')
        expect(echoed).toEqual(['a', 'b', '\b', 'c', '\n'])
    })

    it('cannot backspace over output it did not echo', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        terminal.write('prompt> ')
        const read = terminal.readAsync('q', execution)
        keyboard.typeText('\b\b\bok\n')
        expect(await read).toBe('ok')
        expect(terminal.output).toBe('prompt> ok\n')
        expect(echoed).toEqual(['o', 'k', '\n'])
    })

    it('drops the control characters a line read cannot show', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        const read = terminal.readAsync('q', execution)
        keyboard.typeText('a\x1bb\tc\n')
        expect(await read).toBe('ab\tc')
    })

    it('leaves the characters after Enter for the next read', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        keyboard.typeText('one\ntwo\n')
        expect(await terminal.readAsync('q', execution)).toBe('one')
        expect(await terminal.readAsync('q', execution)).toBe('two')
    })

    it('keeps the Screen keyboard across a scripted testcase run', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        terminal.useScriptedInput(['scripted'])
        expect(await terminal.readAsync('q', execution)).toBe('scripted')
        terminal.useInteractiveInput()
        expect(terminal.interactiveSource).toBe('keyboard')
        keyboard.typeText('back\n')
        expect(await terminal.readAsync('q', execution)).toBe('back')
    })

    it('releases a suspended read on clear, which is how Stop answers during one', async () => {
        const { terminal, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        const read = terminal.readAsync('q', execution)
        await settle()
        terminal.clear()
        await expect(read).rejects.toThrow('Input cancelled')
    })

    it('supersedes a suspended read when the execution generation changed', async () => {
        const { terminal, executionController, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        const read = terminal.readAsync('q', execution)
        await settle()
        executionController.invalidate()
        terminal.cancelPendingInput()
        await expect(read).rejects.toThrow('Execution superseded')
    })

    it('goes back to prompts when the Screen keyboard is taken away', async () => {
        const { terminal, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        terminal.usePromptInput()
        expect(terminal.interactiveSource).toBe('prompt')
        const read = terminal.readAsync('q', execution)
        Prompt.answerText('typed')
        expect(await read).toBe('typed')
    })
})
