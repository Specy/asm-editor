import { beforeEach, describe, expect, it } from 'vitest'
import { Prompt, PromptType } from '$stores/promptStore.svelte'
import { ExecutionController } from '$lib/languages/ExecutionController'
import { Keyboard } from './Keyboard'
import { Terminal, type TerminalOptions } from './Terminal.svelte'

function makeTerminal(options: Omit<TerminalOptions, 'executionController'> = {}) {
    const executionController = new ExecutionController(() => Prompt.cancel())
    const terminal = new Terminal({ executionController, ...options })
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

/**
 * A Terminal with a console component shown on the page to type in. Reads wait for typing either
 * way; the console is what a person types it in.
 */
function makeConsole(options: Omit<TerminalOptions, 'executionController'> = {}) {
    const made = makeTerminal(options)
    made.terminal.attachConsole()
    return made
}

/** Lets a suspended read see what was typed before the test asserts on it. */
function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

beforeEach(() => Prompt.cancel())

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

    it('does not consume what was typed in the Terminal either', async () => {
        const { terminal, execution } = makeConsole()
        terminal.insertText('typed\n')
        terminal.useScriptedInput(['scripted'])
        expect(await terminal.readAsync('q', execution)).toBe('scripted')
        terminal.useInteractiveInput()
        expect(await terminal.readAsync('q', execution)).toBe('typed')
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
        terminal.useScriptedInput(['xyz', '😀!'])
        expect(await terminal.readCharAsync('q', execution)).toBe('x')
        //a whole character, never half of a surrogate pair
        expect(await terminal.readCharAsync('q', execution)).toBe('😀')
    })

    it('never shows a read as pending, because nobody types its answer', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['a'])
        const read = terminal.readAsync('q', execution)
        expect(terminal.pendingRead).toBeNull()
        await read
    })
})

describe('the Line discipline, typed in the Terminal', () => {
    it('edits a line until Enter, echoing it as it is typed', async () => {
        const { terminal, execution } = makeConsole()
        terminal.write('> ')
        let answer: string | undefined
        const read = terminal
            .readAsync('Enter a string', execution)
            .then((value) => (answer = value))
        terminal.insertText('12')
        await settle()
        expect(answer).toBeUndefined()
        expect(terminal.output).toBe('> 12')
        expect(terminal.pendingRead).toEqual({
            kind: 'line',
            question: 'Enter a string',
            endOfInput: false,
            source: 'terminal',
            enter: '\n',
            echo: true,
            prompt: true,
            line: '12'
        })
        terminal.insertText('3')
        terminal.pressEnter()
        await read
        expect(answer).toBe('123')
        expect(terminal.output).toBe('> 123\n')
        expect(terminal.pendingRead).toBeNull()
    })

    it('takes back what Backspace erases, whole characters included', async () => {
        const { terminal, execution } = makeConsole()
        terminal.write('> ')
        const read = terminal.readAsync('q', execution)
        terminal.insertText('a😀')
        await settle()
        expect(terminal.output).toBe('> a😀')
        //one keystroke takes back the whole emoji, both of its UTF-16 code units
        terminal.pressBackspace()
        await settle()
        expect(terminal.output).toBe('> a')
        expect(terminal.pendingRead?.line).toBe('a')
        terminal.insertText('é')
        terminal.pressEnter()
        expect(await read).toBe('aé')
        expect(terminal.output).toBe('> aé\n')
    })

    it('cannot backspace over output it did not echo', async () => {
        const { terminal, execution } = makeConsole()
        terminal.write('prompt> ')
        const read = terminal.readAsync('q', execution)
        terminal.pressBackspace()
        terminal.pressBackspace()
        terminal.insertText('ok')
        terminal.pressEnter()
        expect(await read).toBe('ok')
        expect(terminal.output).toBe('prompt> ok\n')
    })

    it('submits a pasted block one line at a time, whatever its line endings', async () => {
        const { terminal, execution } = makeConsole()
        terminal.paste('one\r\ntwo\rthree\n')
        expect(await terminal.readAsync('q', execution)).toBe('one')
        expect(await terminal.readAsync('q', execution)).toBe('two')
        expect(await terminal.readAsync('q', execution)).toBe('three')
        expect(terminal.output).toBe('one\ntwo\nthree\n')
    })

    it('takes an IME composition as the text it commits', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readAsync('q', execution)
        terminal.insertText('日本')
        terminal.insertText('語')
        terminal.pressEnter()
        expect(await read).toBe('日本語')
    })

    it('drops the control characters a line read cannot show', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readAsync('q', execution)
        terminal.insertText('a\x1bb\tc\x07')
        terminal.pressEnter()
        expect(await read).toBe('ab\tc')
    })

    it('keeps what was typed ahead for the read that comes, which a poll sees', async () => {
        const { terminal, execution } = makeConsole()
        expect(terminal.hasPendingInput()).toBe(false)
        terminal.insertText('ahead\n')
        expect(terminal.hasPendingInput()).toBe(true)
        //echoed when a read takes it, not before
        expect(terminal.output).toBe('')
        expect(await terminal.readAsync('q', execution)).toBe('ahead')
        expect(terminal.output).toBe('ahead\n')
        expect(terminal.hasPendingInput()).toBe(false)
    })

    it('answers a character read on one keystroke and echoes it', async () => {
        const { terminal, execution } = makeConsole()
        let answer: string | undefined
        const read = terminal.readCharAsync('q', execution).then((value) => (answer = value))
        await settle()
        expect(terminal.pendingRead?.kind).toBe('character')
        terminal.insertText('xy')
        await read
        expect(answer).toBe('x')
        expect(terminal.output).toBe('x')
        //the next keystroke is the next read's
        expect(await terminal.readCharAsync('q', execution)).toBe('y')
    })

    it('gives Enter to a character read as a line feed by default', async () => {
        const { terminal, execution } = makeConsole()
        terminal.pressEnter()
        expect(await terminal.readCharAsync('q', execution)).toBe('\n')
        expect(terminal.output).toBe('\n')
    })

    it("gives Enter as the Target's code, EASy68K's $0D, and still echoes a new line", async () => {
        const { terminal, execution } = makeConsole({ enter: '\r' })
        const read = terminal.readCharAsync('q', execution)
        await settle()
        expect(terminal.pendingRead?.enter).toBe('\r')
        terminal.pressEnter()
        expect(await read).toBe('\r')
        expect(terminal.output).toBe('\n')
    })

    it('hands a character read the other keys as they are', async () => {
        const { terminal, execution } = makeConsole()
        terminal.pressBackspace()
        terminal.insertText('\t')
        expect(await terminal.readCharAsync('q', execution)).toBe('\b')
        expect(await terminal.readCharAsync('q', execution)).toBe('\t')
    })

    it('ends a line read at Enter whatever the Target gives a character read for it', async () => {
        const { terminal, execution } = makeConsole({ enter: '\r' })
        terminal.insertText('line\n')
        expect(await terminal.readAsync('q', execution)).toBe('line')
    })

    it('releases a suspended read on clear, which is how Stop answers during one', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readAsync('q', execution)
        await settle()
        terminal.clear()
        await expect(read).rejects.toThrow('Input cancelled')
        expect(terminal.pendingRead).toBeNull()
    })

    it('forgets what was typed ahead on clear', async () => {
        const { terminal } = makeConsole()
        terminal.insertText('stale')
        terminal.clear()
        expect(terminal.hasPendingInput()).toBe(false)
    })

    it('keeps a read waiting for typing when the last console leaves the page', async () => {
        const { terminal, execution } = makeTerminal()
        const detach = terminal.attachConsole()
        let answer: string | undefined
        const read = terminal
            .readAsync('Enter a string', execution)
            .then((value) => (answer = value))
        await settle()
        detach()
        await settle()
        //no modal prompt takes over: the host reveals a console instead (decision 10)
        expect(Prompt.promise).toBeNull()
        expect(answer).toBeUndefined()
        expect(terminal.pendingRead?.question).toBe('Enter a string')
        terminal.insertText('typed\n')
        await read
        expect(answer).toBe('typed')
    })
})

/**
 * A read can be told how to show what is typed, which EASy68K's programs set with tasks 12 and 16:
 * whether it echoes, whether its prompt is drawn, and whether a character read of Enter echoes a
 * line feed. Every one is on unless the read says otherwise.
 */
describe('read options', () => {
    it('echoes nothing of a line without its echo, but ends it on a new line', async () => {
        const { terminal, keyboard, echoed, execution } = makeConsole()
        terminal.write('> ')
        const read = terminal.readAsync('q', execution, { echo: false })
        terminal.insertText('pass')
        terminal.pressBackspace()
        terminal.insertText('t')
        await settle()
        expect(terminal.output).toBe('> ')
        expect(terminal.pendingRead).toMatchObject({ line: 'past', echo: false, prompt: true })
        terminal.pressEnter()
        expect(await read).toBe('past')
        expect(terminal.output).toBe('> \n')
        //on a Screen too: only the new line reaches its text cursor
        terminal.useKeyboardInput(keyboard, (text) => echoed.push(text))
        keyboard.typeText('xy\b\n')
        expect(await terminal.readAsync('q', execution, { echo: false })).toBe('x')
        expect(echoed).toEqual(['\n'])
        expect(terminal.output).toBe('> \n\n')
    })

    it('echoes nothing of a keystroke without its echo, Enter included', async () => {
        const { terminal, execution } = makeConsole({ enter: '\r' })
        terminal.insertText('a\n')
        expect(await terminal.readCharAsync('q', execution, { echo: false })).toBe('a')
        expect(await terminal.readCharAsync('q', execution, { echo: false })).toBe('\r')
        expect(terminal.output).toBe('')
    })

    it('echoes Enter as a carriage return alone without its line feed', async () => {
        const { terminal, keyboard, echoed, execution } = makeTerminal({ enter: '\r' })
        terminal.useKeyboardInput(keyboard, (text) => echoed.push(text))
        keyboard.typeText('\n\n')
        expect(await terminal.readCharAsync('q', execution, { lineFeed: false })).toBe('\r')
        //the line feed is the default, as for every other Target
        expect(await terminal.readCharAsync('q', execution)).toBe('\r')
        expect(echoed).toEqual(['\r', '\n'])
        expect(terminal.output).toBe('\r\n')
    })

    it('says whether the prompt is drawn, which changes nothing of what is read', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readCharAsync('Enter a character', execution, { prompt: false })
        await settle()
        expect(terminal.pendingRead).toMatchObject({ kind: 'character', prompt: false, echo: true })
        terminal.insertText('k')
        expect(await read).toBe('k')
        expect(terminal.output).toBe('k')
    })

    it('leaves scripted answers as they always were, never echoed', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['line', 'k'])
        expect(await terminal.readAsync('q', execution, { echo: true })).toBe('line')
        expect(await terminal.readCharAsync('q', execution, { lineFeed: false })).toBe('k')
        expect(terminal.output).toBe('')
    })
})

describe('End of input', () => {
    it('answers a read of standard input on an empty line with no bytes', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readStandardInput(64, 'q', execution)
        await settle()
        expect(terminal.pendingRead?.kind).toBe('standard-input')
        expect(terminal.pendingRead?.endOfInput).toBe(true)
        terminal.sendEndOfInput()
        expect((await read).length).toBe(0)
        expect(terminal.output).toBe('')
    })

    it('delivers pending text without a newline and then EOF on an empty read', async () => {
        const { terminal, execution } = makeConsole()
        const read = terminal.readStandardInput(64, 'q', execution)
        terminal.insertText('ab')
        terminal.sendEndOfInput()
        expect(text(await read)).toBe('ab')
        const next = terminal.readStandardInput(64, 'q', execution)
        terminal.sendEndOfInput()
        expect((await next).length).toBe(0)
    })

    it('is no character to the educational reads, which wait on', async () => {
        const { terminal, execution } = makeConsole()
        const line = terminal.readAsync('q', execution)
        await settle()
        expect(terminal.pendingRead?.endOfInput).toBe(false)
        terminal.sendEndOfInput()
        terminal.insertText('line\n')
        expect(await line).toBe('line')
        const character = terminal.readCharAsync('q', execution)
        terminal.sendEndOfInput()
        terminal.insertText('c')
        expect(await character).toBe('c')
    })

    it('reads as no bytes again and again once scripted answers run out, without failing', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['only'])
        expect(text(await terminal.readStandardInput(64, 'q', execution))).toBe('only\n')
        expect((await terminal.readStandardInput(64, 'q', execution)).length).toBe(0)
        expect((await terminal.readStandardInput(64, 'q', execution)).length).toBe(0)
        //the educational read syscalls keep their error
        await expect(terminal.readAsync('q', execution)).rejects.toThrow('does not have any values')
    })

    it('takes an EOT typed on an empty Screen line as End of input', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        keyboard.typeText('\x04')
        expect((await terminal.readStandardInput(8, 'q', execution)).length).toBe(0)
        keyboard.typeText('ab\n')
        expect(text(await terminal.readStandardInput(8, 'q', execution))).toBe('ab\n')
    })
})

describe('standard input', () => {
    it('hands out one line at a time, keeping what a short read left behind', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['12 34', 'next'])
        expect(text(await terminal.readStandardInput(3, 'q', execution))).toBe('12 ')
        //the rest of the line is pending input: the next read takes it without asking
        expect(terminal.hasPendingInput()).toBe(true)
        expect(text(await terminal.readStandardInput(10, 'q', execution))).toBe('34\n')
        expect(text(await terminal.readStandardInput(10, 'q', execution))).toBe('next\n')
    })

    it('encodes a typed line as UTF-8, so a short read can split a character', async () => {
        const { terminal, execution } = makeConsole()
        terminal.insertText('é\n')
        expect(await terminal.readStandardInput(1, 'q', execution)).toEqual(Uint8Array.of(0xc3))
        expect(await terminal.readStandardInput(8, 'q', execution)).toEqual(
            Uint8Array.of(0xa9, 0x0a)
        )
    })

    it('reads nothing at all for a read of no bytes', async () => {
        const { terminal, execution } = makeTerminal()
        expect((await terminal.readStandardInput(0, 'q', execution)).length).toBe(0)
        expect(Prompt.promise).toBeNull()
    })

    it('forgets a partly read line when the Terminal clears', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['abcdef', 'second'])
        await terminal.readStandardInput(2, 'q', execution)
        terminal.clear()
        terminal.useScriptedInput(['fresh'])
        expect(text(await terminal.readStandardInput(64, 'q', execution))).toBe('fresh\n')
    })

    it('keeps a partly read line when only the output is cleared', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['abcdef'])
        await terminal.readStandardInput(2, 'q', execution)
        terminal.write('shown')
        terminal.clearOutput()
        expect(terminal.output).toBe('')
        expect(text(await terminal.readStandardInput(64, 'q', execution))).toBe('cdef\n')
    })
})

describe('byte reads', () => {
    it("hands out a line a byte at a time in the Target's encoding, ending with a line feed", async () => {
        const { terminal, execution } = makeConsole({ encoding: 'latin-1' })
        terminal.insertText('é☃\n')
        expect(await terminal.readByte('q', execution)).toBe(0xe9)
        //a character Latin-1 has no byte for is a question mark, never split in two
        expect(terminal.readBufferedByte()).toBe(0x3f)
        expect(terminal.hasPendingInput()).toBe(true)
        expect(terminal.readBufferedByte()).toBe(0x0a)
        expect(terminal.readBufferedByte()).toBeUndefined()
        expect(terminal.output).toBe('é☃\n')
    })

    it('reads a scripted line the same way, without echoing it', async () => {
        const { terminal, execution } = makeTerminal({ encoding: 'latin-1' })
        terminal.useScriptedInput(['ab'])
        expect(await terminal.readByte('q', execution)).toBe(0x61)
        expect(await terminal.readByte('q', execution)).toBe(0x62)
        expect(await terminal.readByte('q', execution)).toBe(0x0a)
        await expect(terminal.readByte('q', execution)).rejects.toThrow('does not have any values')
        expect(terminal.output).toBe('')
    })

    it('reads one keystroke at a time from the Screen keyboard, Enter being its line feed', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal({
            encoding: 'latin-1'
        })
        useKeyboard()
        keyboard.typeText('x\n')
        expect(await terminal.readByte('q', execution)).toBe(0x78)
        expect(terminal.readBufferedByte()).toBeUndefined()
        expect(await terminal.readByte('q', execution)).toBe(0x0a)
        expect(echoed).toEqual(['x', '\n'])
    })

    it('ignores End of input, which belongs to standard input', async () => {
        const { terminal, execution } = makeConsole({ encoding: 'latin-1' })
        terminal.sendEndOfInput()
        terminal.insertText('k\n')
        expect(await terminal.readByte('q', execution)).toBe(0x6b)
    })
})

describe('keystrokes for a polled device', () => {
    it('shows the next keystroke without taking it, and takes it when asked', () => {
        const { terminal } = makeConsole()
        expect(terminal.peekKeystroke()).toBeUndefined()
        terminal.insertText('ab')
        expect(terminal.peekKeystroke()).toBe(0x61)
        expect(terminal.peekKeystroke()).toBe(0x61)
        expect(terminal.takeKeystroke()).toBe(0x61)
        expect(terminal.takeKeystroke()).toBe(0x62)
        expect(terminal.takeKeystroke()).toBeUndefined()
        //never echoed: the program echoes what it wants to
        expect(terminal.output).toBe('')
    })

    it("prefers the device's own Screen keyboard to what is typed in the Terminal", () => {
        const { terminal, keyboard } = makeConsole()
        terminal.insertText('t')
        keyboard.typeText('s')
        expect(terminal.takeKeystroke(keyboard)).toBe(0x73)
        expect(terminal.takeKeystroke(keyboard)).toBe(0x74)
    })

    it('answers a scripted run with its lines a byte at a time, never with live input', () => {
        const { terminal, keyboard } = makeTerminal()
        keyboard.typeText('live')
        terminal.useScriptedInput(['ok'])
        expect(terminal.peekKeystroke(keyboard)).toBe(0x6f)
        expect(terminal.takeKeystroke(keyboard)).toBe(0x6f)
        expect(terminal.takeKeystroke(keyboard)).toBe(0x6b)
        expect(terminal.takeKeystroke(keyboard)).toBe(0x0a)
        expect(terminal.takeKeystroke(keyboard)).toBeUndefined()
        expect(keyboard.typedCount).toBe(4)
    })

    it('says when the input changed, so a register mirroring it can follow', async () => {
        const { terminal, execution } = makeConsole()
        let changes = 0
        terminal.onInputChange(() => changes++)
        terminal.insertText('x\n')
        const typed = changes
        expect(typed).toBeGreaterThan(0)
        await terminal.readAsync('q', execution)
        expect(changes).toBeGreaterThan(typed)
    })
})

describe('reads with no console on the page', () => {
    it('wait for typing, never for a modal prompt', async () => {
        const { terminal, execution } = makeTerminal()
        expect(terminal.consoleAttached).toBe(false)
        expect(terminal.interactiveSource).toBe('terminal')
        let answer: string | undefined
        const read = terminal
            .readAsync('Enter a line of text', execution)
            .then((value) => (answer = value))
        await settle()
        expect(Prompt.promise).toBeNull()
        expect(answer).toBeUndefined()
        expect(terminal.pendingRead?.kind).toBe('line')
        //what a revealed console then types reaches the read as usual
        terminal.insertText('hello\n')
        await read
        expect(answer).toBe('hello')
        expect(terminal.output).toBe('hello\n')
    })

    it('wait for one keystroke on a character read and for End of input on standard input', async () => {
        const { terminal, execution } = makeTerminal({ enter: '\r' })
        const character = terminal.readCharAsync('Enter a character', execution)
        await settle()
        expect(Prompt.promise).toBeNull()
        terminal.pressEnter()
        expect(await character).toBe('\r')
        const line = terminal.readStandardInput(64, 'Enter a line', execution)
        await settle()
        expect(terminal.pendingRead?.endOfInput).toBe(true)
        terminal.sendEndOfInput()
        expect((await line).length).toBe(0)
    })

    it('are released by clear and superseded by Stop as before', async () => {
        const { terminal, executionController, execution } = makeTerminal()
        const released = terminal.readAsync('q', execution)
        await settle()
        terminal.cancelPendingInput()
        await expect(released).rejects.toThrow('Input cancelled')
        const superseded = terminal.readAsync('q', executionController.capture())
        await settle()
        executionController.invalidate()
        terminal.cancelPendingInput()
        await expect(superseded).rejects.toThrow('Execution superseded')
        expect(terminal.pendingRead).toBeNull()
    })

    it('promise no pending input, because nothing has been typed', () => {
        const { terminal } = makeTerminal()
        expect(terminal.hasPendingInput()).toBe(false)
    })
})

describe('consoles on the page', () => {
    it('are counted while shown, each detaching once however often it is asked to', () => {
        const { terminal } = makeTerminal()
        const first = terminal.attachConsole()
        const second = terminal.attachConsole()
        expect(terminal.consoleAttached).toBe(true)
        first()
        first()
        expect(terminal.consoleAttached).toBe(true)
        second()
        expect(terminal.consoleAttached).toBe(false)
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
        expect(terminal.pendingRead?.source).toBe('keyboard')
        //a Screen read never falls back to the prompt
        expect(Prompt.promise).toBeNull()
        keyboard.typeText('z')
        await read
        expect(answer).toBe('z')
    })

    it("gives Enter as the Target's code here too", async () => {
        const { terminal, keyboard, echoed, execution } = makeTerminal({ enter: '\r' })
        terminal.useKeyboardInput(keyboard, (text) => echoed.push(text))
        keyboard.typeText('\n')
        expect(await terminal.readCharAsync('q', execution)).toBe('\r')
        expect(echoed).toEqual(['\n'])
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

    it('erases a character outside the Basic Multilingual Plane whole', async () => {
        const { terminal, keyboard, echoed, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        terminal.write('> ')
        const read = terminal.readAsync('q', execution)
        keyboard.typeText('x😀\b\n')
        expect(await read).toBe('x')
        expect(terminal.output).toBe('> x\n')
        //one erase for one character on the Screen as well
        expect(echoed).toEqual(['x', '😀', '\b', '\n'])
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

    it('leaves the characters after Enter for the next read', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeTerminal()
        useKeyboard()
        keyboard.typeText('one\ntwo\n')
        expect(await terminal.readAsync('q', execution)).toBe('one')
        expect(await terminal.readAsync('q', execution)).toBe('two')
    })

    it('does not answer from the Terminal while the Screen is the source', async () => {
        const { terminal, keyboard, useKeyboard, execution } = makeConsole()
        useKeyboard()
        const read = terminal.readAsync('q', execution)
        terminal.insertText('console\n')
        keyboard.typeText('screen\n')
        expect(await read).toBe('screen')
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

    it('goes back to the Terminal when the Screen keyboard is taken away', async () => {
        const { terminal, useKeyboard, execution } = makeConsole()
        useKeyboard()
        terminal.useTerminalInput()
        expect(terminal.interactiveSource).toBe('terminal')
        terminal.insertText('typed\n')
        expect(await terminal.readAsync('q', execution)).toBe('typed')
    })
})

describe('output', () => {
    const bytes = (...values: number[]) => Uint8Array.from(values)

    it('decodes UTF-8 a character split across two writes', () => {
        const { terminal } = makeTerminal()
        terminal.writeBytes(bytes(0x61, 0xc3))
        expect(terminal.output).toBe('a')
        terminal.writeBytes(bytes(0xa9, 0x62))
        expect(terminal.output).toBe('aéb')
        //and one written a byte at a time, as x86 hands its output over
        for (const byte of [0xf0, 0x9f, 0x98, 0x80]) terminal.writeBytes(bytes(byte))
        expect(terminal.output).toBe('aéb😀')
    })

    it('shows a character still incomplete when the program terminates as U+FFFD', () => {
        const { terminal } = makeTerminal()
        terminal.writeBytes(bytes(0x6f, 0x6b, 0xe2, 0x82))
        expect(terminal.output).toBe('ok')
        terminal.flushOutput()
        expect(terminal.output).toBe('ok�')
        //and only once
        terminal.flushOutput()
        expect(terminal.output).toBe('ok�')
    })

    it('replaces invalid bytes as the Encoding Standard does', () => {
        const { terminal } = makeTerminal()
        terminal.writeBytes(bytes(0x41, 0xff, 0x80, 0x42))
        expect(terminal.output).toBe('A��B')
    })

    it('keeps the order of byte and text writes', () => {
        const { terminal } = makeTerminal()
        terminal.writeBytes(bytes(0xc3))
        terminal.write('!')
        expect(terminal.output).toBe('�!')
    })

    it('forgets a held-back byte on clear', () => {
        const { terminal } = makeTerminal()
        terminal.writeBytes(bytes(0xc3))
        terminal.clear()
        terminal.writeBytes(bytes(0x41))
        terminal.flushOutput()
        expect(terminal.output).toBe('A')
    })

    it('decodes Windows-1252 for EASy68K, typographic characters included', () => {
        const { terminal } = makeTerminal({ encoding: 'windows-1252' })
        terminal.writeBytes(bytes(0x80, 0x20, 0x93, 0x63, 0x61, 0x66, 0xe9, 0x94, 0x85))
        expect(terminal.output).toBe('€ “café”…')
    })

    it('decodes Latin-1 for the Z80, one character per byte', () => {
        const { terminal } = makeTerminal({ encoding: 'latin-1' })
        terminal.writeBytes(bytes(0x80, 0xe9, 0xff))
        expect(terminal.output).toBe('\u0080éÿ')
    })
})

describe('dialogs', () => {
    it('answers a confirm Yes, No or Cancel, through the modal prompt', async () => {
        const { terminal, execution } = makeConsole()
        const answers = []
        for (const answer of [
            () => Prompt.answerConfirm(true),
            () => Prompt.answerConfirm(false)
        ]) {
            const asked = terminal.confirm('Sure?', execution)
            await settle()
            expect(Prompt.type).toBe(PromptType.Confirm)
            expect(Prompt.offersCancel).toBe(true)
            answer()
            answers.push(await asked)
        }
        const cancelled = terminal.confirm('Sure?', execution)
        await settle()
        Prompt.cancel()
        answers.push(await cancelled)
        expect(answers).toEqual(['yes', 'no', 'cancel'])
        //a dialog is not the console: nothing of it is echoed
        expect(terminal.output).toBe('')
    })

    it('takes a scripted confirm answer, Cancel included', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['yes', '0', 'cancel'])
        expect(await terminal.confirm('q', execution)).toBe('yes')
        expect(await terminal.confirm('q', execution)).toBe('no')
        expect(await terminal.confirm('q', execution)).toBe('cancel')
    })

    it('answers an input dialog with the text, or null for Cancel, never echoed', async () => {
        const { terminal, execution } = makeConsole()
        const answered = terminal.inputDialog('Name?', execution)
        await settle()
        expect(Prompt.question).toBe('Name?')
        Prompt.answerText('Ada')
        expect(await answered).toBe('Ada')
        const cancelled = terminal.inputDialog('Name?', execution)
        await settle()
        Prompt.cancel()
        expect(await cancelled).toBeNull()
        expect(terminal.output).toBe('')
    })

    it('takes an input dialog answer from scripted input', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput(['scripted'])
        expect(await terminal.inputDialog('q', execution)).toBe('scripted')
    })

    it('waits for a message to be dismissed', async () => {
        const { terminal, execution } = makeConsole()
        let dismissed = false
        const shown = terminal.messageDialog('Done', execution).then(() => (dismissed = true))
        await settle()
        expect(Prompt.type).toBe(PromptType.Alert)
        expect(Prompt.question).toBe('Done')
        expect(dismissed).toBe(false)
        Prompt.answerAlert()
        await shown
        expect(dismissed).toBe(true)
    })

    it('fails a message in a scripted run, which has nobody to dismiss it', async () => {
        const { terminal, execution } = makeTerminal()
        terminal.useScriptedInput([])
        await expect(terminal.messageDialog('Done', execution)).rejects.toThrow(
            'Message dialogs are not available'
        )
    })
})
