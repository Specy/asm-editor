import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import TerminalConsole from './TerminalConsole.svelte'
import { Terminal, type TerminalOptions } from '$lib/languages/peripherals/Terminal.svelte'
import { ExecutionController } from '$lib/languages/ExecutionController'

/**
 * The console a program's reads are typed in (ADR 0036): it draws the Terminal's transcript, hands
 * every key to the Terminal's Line discipline, and keeps the keys from the page while it has them.
 */

let app: ReturnType<typeof mount> | null = null

afterEach(() => {
    if (app) unmount(app)
    app = null
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

type ConsoleProps = {
    terminal: Terminal
    prefix?: string
    escapes?: boolean
    visible?: boolean
    interactive?: boolean
    placeholder?: string
}

function render(options: Omit<TerminalOptions, 'executionController'> = {}) {
    const executionController = new ExecutionController(() => {})
    const terminal = new Terminal({ executionController, ...options })
    const props: ConsoleProps = $state({ terminal, interactive: true, visible: true })
    app = mount(TerminalConsole, { target: document.body, props })
    flushSync()
    return { terminal, props, execution: executionController.capture() }
}

function textarea(): HTMLTextAreaElement {
    const found = document.querySelector('textarea')
    if (!found) throw new Error('the console has no textarea')
    return found
}

function screenText(): string {
    return document.querySelector('.screen')?.textContent ?? ''
}

function transcriptText(): string {
    return document.querySelector('[role="log"]')?.textContent ?? ''
}

function endOfInputButton(): HTMLButtonElement | null {
    const found = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('End of input')
    )
    return found ?? null
}

/**
 * Lets the Line discipline take what was typed, which it does after an await, and the console draw
 * the echo.
 */
async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync()
}

/** What a keyboard types into the focused textarea: its value, then the input event. */
async function type(text: string, init: InputEventInit = {}) {
    const input = textarea()
    input.value += text
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, ...init }))
    await settle()
}

async function press(key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    textarea().dispatchEvent(event)
    await settle()
    return event
}

describe('the transcript', () => {
    it('is drawn after the prefix exactly as written, with nothing between them', () => {
        const { terminal, props } = render()
        props.prefix = 'Error: bad\n'
        terminal.write('hello\n  world')
        flushSync()
        expect(transcriptText()).toBe('Error: bad\nhello\n  world')
        //no read waits and the console has no focus: the caret and its hints are not there yet
        expect(screenText()).toBe('Error: bad\nhello\n  world')
        expect(document.querySelector('.caret.shown')).toBeNull()
    })

    it('says what an empty console is for until something is written', () => {
        const { terminal, props } = render()
        props.placeholder = 'What the program writes appears here.'
        flushSync()
        expect(document.querySelector('.placeholder')?.textContent).toBe(
            'What the program writes appears here.'
        )
        terminal.write('x')
        flushSync()
        expect(document.querySelector('.placeholder')).toBeNull()
    })

    it("draws x86's colours and clear screen while the transcript keeps the bytes", () => {
        const { terminal, props } = render()
        props.escapes = true
        terminal.write('old\n\x1b[2J\x1b[1;31mred\x1b[0m plain \x1b[5;5Hend')
        flushSync()
        const red = document.querySelector('.fg-1')
        expect(red?.textContent).toBe('red')
        expect(red?.classList.contains('bold')).toBe(true)
        expect(document.querySelector('.escape')?.textContent).toBe('␛[5;5H')
        expect(transcriptText()).toBe('red plain ␛[5;5Hend')
        //what a Testcase compares is untouched
        expect(terminal.output).toBe('old\n\x1b[2J\x1b[1;31mred\x1b[0m plain \x1b[5;5Hend')
    })

    it('shows escape sequences as written for the other Targets', () => {
        const { terminal } = render()
        terminal.write('a\x1b[31mb')
        flushSync()
        expect(transcriptText()).toBe('a\x1b[31mb')
        expect(document.querySelector('.fg-1')).toBeNull()
    })
})

describe('a console on the page', () => {
    it('counts as attached only while it is shown', () => {
        const { terminal, props } = render()
        expect(terminal.consoleAttached).toBe(true)
        props.visible = false
        flushSync()
        expect(terminal.consoleAttached).toBe(false)
        props.visible = true
        flushSync()
        expect(terminal.consoleAttached).toBe(true)
        unmount(app!)
        app = null
        expect(terminal.consoleAttached).toBe(false)
    })
})

describe('a host revealing a pending read', () => {
    it('takes focus after the ancestor is revealed, even if the first attempt was too early', async () => {
        const { terminal, props, execution } = render()
        props.visible = false
        flushSync()
        const input = textarea()
        const focus = input.focus.bind(input)
        let hostHidden = true
        vi.spyOn(input, 'focus').mockImplementation(() => {
            if (!hostHidden) focus()
        })
        const read = terminal.readAsync('q', execution)
        flushSync()
        props.visible = true
        flushSync()
        //The child's effect runs while the host has yet to reveal its ancestor.
        expect(document.activeElement).not.toBe(input)
        hostHidden = false
        await settle()
        expect(document.activeElement).toBe(input)
        await press('Enter')
        expect(await read).toBe('')
    })

    it('keeps a text field focused between the early attempt and the deferred attempt', async () => {
        const { terminal, execution } = render()
        const input = textarea()
        vi.spyOn(input, 'focus').mockImplementation(() => {})
        const read = terminal.readAsync('q', execution)
        flushSync()
        const field = document.createElement('input')
        document.body.append(field)
        field.focus()
        await settle()
        expect(document.activeElement).toBe(field)
        expect(input.focus).toHaveBeenCalledTimes(1)
        terminal.pressEnter()
        expect(await read).toBe('')
    })

    it.each(['cancelled read', 'unmounted console'])('does not retry a %s', async (change) => {
        const { terminal, execution } = render()
        const input = textarea()
        vi.spyOn(input, 'focus').mockImplementation(() => {})
        const read = terminal.readAsync('q', execution).catch(() => {})
        flushSync()
        if (change === 'unmounted console') {
            unmount(app!)
            app = null
        }
        terminal.cancelPendingInput()
        flushSync()
        await settle()
        expect(input.focus).toHaveBeenCalledTimes(1)
        expect(document.activeElement).not.toBe(input)
        await read
    })

    it('does not retry a console whose host has ended the program', async () => {
        const { terminal, props, execution } = render()
        const input = textarea()
        vi.spyOn(input, 'focus').mockImplementation(() => {})
        const read = terminal.readAsync('q', execution)
        flushSync()
        props.interactive = false
        flushSync()
        await settle()
        expect(input.focus).toHaveBeenCalledTimes(1)
        expect(document.activeElement).not.toBe(input)
        terminal.pressEnter()
        expect(await read).toBe('')
    })
})

describe('typing a line', () => {
    it('takes the keyboard when a read starts and submits the line on Enter', async () => {
        const { terminal, execution } = render()
        terminal.write('Name: ')
        const read = terminal.readAsync('Enter a string', execution)
        flushSync()
        expect(document.activeElement).toBe(textarea())
        expect(textarea().getAttribute('aria-label')).toBe('Program input: Enter a string')
        expect(document.querySelector('.caret.shown.waiting')).not.toBeNull()
        //the read's question, until something is typed
        expect(document.querySelector('.hint')?.textContent).toContain('Enter a string')
        await type('Ada')
        expect(transcriptText()).toBe('Name: Ada')
        expect(textarea().value).toBe('')
        expect(document.querySelector('.hint')).toBeNull()
        const enter = await press('Enter')
        expect(enter.defaultPrevented).toBe(true)
        expect(await read).toBe('Ada')
        flushSync()
        expect(transcriptText()).toBe('Name: Ada\n')
        expect(document.querySelector('.caret.waiting')).toBeNull()
    })

    it('erases with Backspace, a word with Ctrl+Backspace', async () => {
        const { terminal, execution } = render()
        const read = terminal.readAsync('q', execution)
        flushSync()
        await type('one two')
        await press('Backspace')
        expect(transcriptText()).toBe('one tw')
        await press('Backspace', { ctrlKey: true })
        expect(transcriptText()).toBe('one ')
        await press('Enter')
        expect(await read).toBe('one ')
    })

    it('submits a line break a phone keyboard put in the field as Enter', async () => {
        const { terminal, execution } = render()
        const read = terminal.readAsync('q', execution)
        flushSync()
        await type('42\n')
        expect(await read).toBe('42')
    })

    it('submits a pasted block a line at a time', async () => {
        const { terminal, execution } = render()
        const first = terminal.readAsync('q', execution)
        flushSync()
        const paste = new Event('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(paste, 'clipboardData', {
            value: { getData: () => 'first\nsecond\n' }
        })
        textarea().dispatchEvent(paste)
        expect(paste.defaultPrevented).toBe(true)
        expect(await first).toBe('first')
        expect(await terminal.readAsync('q', execution)).toBe('second')
    })

    it("sends an IME's composition only once it is committed", async () => {
        const { terminal, execution } = render()
        const read = terminal.readAsync('q', execution)
        flushSync()
        textarea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        await type('に', { isComposing: true })
        //drawn at the caret, not yet echoed into the transcript
        expect(document.querySelector('.composition')?.textContent).toBe('に')
        expect(transcriptText()).toBe('')
        await type('ほん', { isComposing: true })
        expect(document.querySelector('.composition')?.textContent).toBe('にほん')
        textarea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
        await settle()
        expect(document.querySelector('.composition')).toBeNull()
        expect(transcriptText()).toBe('にほん')
        await press('Enter')
        expect(await read).toBe('にほん')
    })
})

/**
 * How a program set its reads to show what is typed, EASy68K's tasks 12 and 16: the Terminal says
 * so on the pending read, and the console draws accordingly while it still takes the keys.
 */
describe('a read without its prompt or its echo', () => {
    it('draws no blinking caret and no question without its prompt', async () => {
        const { terminal, execution } = render()
        const read = terminal.readCharAsync('Enter a character', execution, { prompt: false })
        flushSync()
        //it still takes the keyboard, and a focused console keeps its outline
        expect(document.activeElement).toBe(textarea())
        expect(document.querySelector('.caret.waiting')).toBeNull()
        expect(document.querySelector('.caret.shown')).not.toBeNull()
        expect(document.querySelector('.hint')).toBeNull()
        await type('k')
        expect(await read).toBe('k')
        expect(transcriptText()).toBe('k')
    })

    it('shows nothing of the line typed without its echo, an IME composition included', async () => {
        const { terminal, execution } = render()
        terminal.write('Password: ')
        const read = terminal.readAsync('Enter a string', execution, { echo: false })
        flushSync()
        textarea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        await type('に', { isComposing: true })
        expect(document.querySelector('.composition')).toBeNull()
        textarea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
        await settle()
        await type('ab')
        expect(transcriptText()).toBe('Password: ')
        await press('Enter')
        expect(await read).toBe('にab')
        flushSync()
        //the Enter still ends the line
        expect(transcriptText()).toBe('Password: \n')
    })
})

describe('one keystroke', () => {
    it("answers a character read with Enter as the Target's code", async () => {
        const { terminal, execution } = render({ enter: '\r' })
        const read = terminal.readCharAsync('Enter a character', execution)
        flushSync()
        expect(endOfInputButton()).toBeNull()
        await press('Enter')
        expect(await read).toBe('\r')
    })
})

describe('End of input', () => {
    it('is offered on an empty line of standard input, by the button and by Ctrl+D', async () => {
        const { terminal, execution } = render()
        const first = terminal.readStandardInput(64, 'Program input', execution)
        flushSync()
        expect(endOfInputButton()).not.toBeNull()
        endOfInputButton()!.click()
        expect((await first).length).toBe(0)
        const second = terminal.readStandardInput(64, 'Program input', execution)
        flushSync()
        const control = await press('d', { ctrlKey: true })
        expect(control.defaultPrevented).toBe(true)
        expect((await second).length).toBe(0)
    })

    it('is not offered once a line is typed, nor to the other reads', async () => {
        const { terminal, execution } = render()
        const line = terminal.readStandardInput(64, 'Program input', execution)
        flushSync()
        await type('ab')
        expect(endOfInputButton()).toBeNull()
        await press('Enter')
        expect(new TextDecoder().decode(await line)).toBe('ab\n')
        const educational = terminal.readAsync('Enter an integer', execution)
        flushSync()
        expect(endOfInputButton()).toBeNull()
        terminal.cancelPendingInput()
        await expect(educational).rejects.toThrow('Input cancelled')
    })
})

describe('the keyboard', () => {
    it('keeps a key down from the page and lets the release through', async () => {
        const { terminal, execution } = render()
        const seen: string[] = []
        const listener = (event: KeyboardEvent) => seen.push(`${event.type} ${event.key}`)
        window.addEventListener('keydown', listener)
        window.addEventListener('keyup', listener)
        try {
            const read = terminal.readAsync('q', execution)
            flushSync()
            await type('C')
            await press('C', { shiftKey: true })
            textarea().dispatchEvent(new KeyboardEvent('keyup', { key: 'C', bubbles: true }))
            //a combination types nothing and reaches a host's own guard; Ctrl+D is the console's
            const print = await press('p', { ctrlKey: true })
            await press('d', { ctrlKey: true })
            await press('Enter')
            await read
            expect(seen).toEqual(['keyup C', 'keydown p'])
            expect(print.defaultPrevented).toBe(false)
        } finally {
            window.removeEventListener('keydown', listener)
            window.removeEventListener('keyup', listener)
        }
    })

    it('goes back to the page on Escape', async () => {
        const { terminal, execution } = render()
        void terminal.readAsync('q', execution).catch(() => {})
        flushSync()
        expect(document.activeElement).toBe(textarea())
        await press('Escape')
        expect(document.activeElement).not.toBe(textarea())
        terminal.cancelPendingInput()
    })

    it('is not taken from a field someone is typing in when a read starts', () => {
        const { terminal, execution } = render()
        const field = document.createElement('input')
        document.body.append(field)
        field.focus()
        void terminal.readAsync('q', execution).catch(() => {})
        flushSync()
        expect(document.activeElement).toBe(field)
        //the hint says how to get there; which half shows depends on the pointer
        expect(document.querySelector('.hint')?.textContent).toBe('q · click to type · tap to type')
        terminal.cancelPendingInput()
    })

    it('is taken by a click on the console, and given back when the program ends', () => {
        const { props } = render()
        const console = document.querySelector<HTMLElement>('.terminal-console')!
        console.click()
        expect(document.activeElement).toBe(textarea())
        props.interactive = false
        flushSync()
        expect(document.activeElement).not.toBe(textarea())
        expect(textarea().disabled).toBe(true)
        console.click()
        expect(document.activeElement).not.toBe(textarea())
    })

    it('waits for the shown console before a read in a hidden one takes the keyboard', async () => {
        const { terminal, props, execution } = render()
        props.visible = false
        flushSync()
        const read = terminal.readAsync('q', execution)
        flushSync()
        expect(document.activeElement).not.toBe(textarea())
        //the host reveals it
        props.visible = true
        flushSync()
        expect(document.activeElement).toBe(textarea())
        await type('ok\n')
        expect(await read).toBe('ok')
    })
})
