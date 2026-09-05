import { Prompt } from '$stores/promptStore.svelte'
import type { ExecutionController, ExecutionGeneration } from '$lib/languages/ExecutionController'

export type TerminalInputSource =
    | {
          type: 'interactive'
      }
    | {
          type: 'scripted'
          values: string[]
      }

/**
 * What the Terminal needs from the Keyboard peripheral to answer reads from Screen input
 * ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)). Declared
 * structurally so this module does not depend on the Keyboard, and so a test can hand over a fake.
 * `Keyboard` satisfies it.
 */
export type TerminalKeyboard = {
    hasTypedInput(): boolean
    readCharacter(): string | undefined
    onTypedInput(listener: () => void): () => void
}

/**
 * Where the echo of typed input goes besides the transcript: the Screen's text cursor, because
 * EASy68K and the Z80 have one output window
 * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)). The adapter
 * supplies it; it receives the characters as typed, `\n` for the Enter that ends a line and `\b`
 * for a backspace that erased one.
 */
export type TerminalEcho = (text: string) => void

export type TerminalOptions = {
    executionController: ExecutionController
}

/** A read suspended on Screen input, kept so Stop and clear can release the program. */
type PendingRead = {
    cancel: () => void
}

const NO_INPUT_LEFT_ERROR = 'Input does not have any values left'
const INPUT_CANCELLED_ERROR = 'Input cancelled'
const DIALOG_NOT_AVAILABLE_ERROR = 'Message dialogs are not available while running scripted input'

const BACKSPACE = '\b'
const LINE_FEED = '\n'
const TAB = '\t'
const SPACE = ' '

export class Terminal {
    private readonly executionController: ExecutionController
    private _output = $state('')
    private _inputSource: TerminalInputSource = { type: 'interactive' }
    /**
     * The interactive source, chosen once through the injected peripheral configuration and fixed
     * for the run (ADR 0009). It outlives `useScriptedInput`, so a Testcase run comes back to the
     * Screen keyboard afterwards, and it is null when no Screen keyboard exists, which is when the
     * prompts remain the source.
     */
    private _keyboardInput: { keyboard: TerminalKeyboard; echo?: TerminalEcho } | null = null
    //an array, not a Set: nothing here is reactive state, and a Set in a rune module is a lint error
    private pendingReads: PendingRead[] = []

    constructor(options: TerminalOptions) {
        this.executionController = options.executionController
    }

    get output(): string {
        return this._output
    }

    get inputSource(): TerminalInputSource['type'] {
        return this._inputSource.type
    }

    /** Where an interactive read takes its answer from, for the GUI and for the tests. */
    get interactiveSource(): 'prompt' | 'keyboard' {
        return this._keyboardInput === null ? 'prompt' : 'keyboard'
    }

    write(text: string): void {
        this._output += text
    }

    prepend(text: string): void {
        this._output = text + this._output
    }

    clear(): void {
        this.cancelPendingInput()
        this._output = ''
    }

    useInteractiveInput(): void {
        this._inputSource = { type: 'interactive' }
    }

    useScriptedInput(values: string[]): void {
        this.cancelPendingInput()
        this._inputSource = { type: 'scripted', values: [...values] }
    }

    /**
     * Answers interactive reads from a Screen keyboard instead of from prompts. The echo callback is
     * optional and only environments with a single output window pass one.
     */
    useKeyboardInput(keyboard: TerminalKeyboard, echo?: TerminalEcho): void {
        this.cancelPendingInput()
        this._keyboardInput = { keyboard, echo }
    }

    /** Back to prompts, the source for a program with no Screen. */
    usePromptInput(): void {
        this.cancelPendingInput()
        this._keyboardInput = null
    }

    /**
     * Whether a read would find an answer waiting, without consuming it: EASy68K's task 7 and MARS's
     * receiver Ready bit. It is the poll ADR 0009 keeps compatible with the read that follows it —
     * both look at the same pending input. Prompts can promise nothing, so they answer no.
     */
    hasPendingInput(): boolean {
        const source = this._inputSource
        if (source.type === 'scripted') return source.values.length > 0
        return this._keyboardInput?.keyboard.hasTypedInput() ?? false
    }

    /**
     * Releases a program suspended on Screen keyboard input. Stop and Build invalidate the execution
     * generation and then clear the Terminal, so the released read is superseded and its error never
     * reaches the user; prompts are released by the same path, through `Prompt.cancel`.
     */
    cancelPendingInput(): void {
        const pending = this.pendingReads
        this.pendingReads = []
        for (const read of pending) read.cancel()
    }

    async readAsync(question: string, execution: ExecutionGeneration): Promise<string> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return scripted
        const input = this._keyboardInput
        //a line read waits for Enter whichever interactive source answers it (ADR 0009)
        if (input !== null) return await this.readLineFromKeyboard(input, execution)
        const value = await this.executionController.waitForPrompt(execution, () =>
            Prompt.askText(question, true)
        )
        if (value === null) throw new Error(INPUT_CANCELLED_ERROR)
        //a terminal echoes what the user types (plus the Enter that submitted it); scripted input
        //behaves like piped stdin, which is not echoed — and testcase expected output relies on that
        this.write(`${value}\n`)
        return value
    }

    /**
     * One character, consumed as soon as it is available: EASy68K's task 5 and the Z80's character
     * port. With a Screen keyboard this takes the next typed character and suspends the program
     * until one arrives; with prompts it asks for a line and keeps its first character, which is
     * what the adapters did before the Keyboard existed.
     */
    async readCharAsync(question: string, execution: ExecutionGeneration): Promise<string> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return scripted.charAt(0)
        const input = this._keyboardInput
        if (input === null) return (await this.readAsync(question, execution)).charAt(0)
        for (;;) {
            const character = input.keyboard.readCharacter()
            if (character !== undefined) {
                this.echo(input, character)
                return character
            }
            await this.waitForTypedInput(input.keyboard, execution)
        }
    }

    async confirmAsync(question: string, execution: ExecutionGeneration): Promise<boolean> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return parseScriptedBoolean(scripted)
        const value = await this.executionController.waitForPrompt(execution, () =>
            Prompt.confirm(question, true)
        )
        if (value === null) throw new Error(INPUT_CANCELLED_ERROR)
        return value
    }

    alertSync(message: string): void {
        //a scripted run (testcases) has nobody to dismiss a native modal, and blocking on one would
        //freeze the whole test loop. Legacy registered an `unimplementedHandler` for the dialog
        //syscalls during testcase runs, so keep failing fast instead of blocking.
        if (this._inputSource.type === 'scripted') {
            throw new Error(`${DIALOG_NOT_AVAILABLE_ERROR}: ${message}`)
        }
        window.alert(message)
    }

    /**
     * Collects typed characters until Enter, echoing them like a tty. Backspace edits the line and
     * erases what it echoed; the other control characters are not text and are dropped, so a program
     * reading a line never receives an escape or a bell.
     */
    private async readLineFromKeyboard(
        input: { keyboard: TerminalKeyboard; echo?: TerminalEcho },
        execution: ExecutionGeneration
    ): Promise<string> {
        const line: string[] = []
        for (;;) {
            const character = input.keyboard.readCharacter()
            if (character === undefined) {
                await this.waitForTypedInput(input.keyboard, execution)
                continue
            }
            if (character === LINE_FEED) {
                this.echo(input, LINE_FEED)
                return line.join('')
            }
            if (character === BACKSPACE) {
                if (line.pop() !== undefined) this.eraseEcho(input)
                continue
            }
            if (character < SPACE && character !== TAB) continue
            line.push(character)
            this.echo(input, character)
        }
    }

    /**
     * Suspends until characters are typed. The GUI stays responsive because this is an ordinary
     * await, and Stop releases it through `cancelPendingInput`.
     */
    private waitForTypedInput(
        keyboard: TerminalKeyboard,
        execution: ExecutionGeneration
    ): Promise<void> {
        return this.executionController.waitFor(
            execution,
            () =>
                new Promise<void>((resolve, reject) => {
                    let unsubscribe: (() => void) | null = null
                    const pending: PendingRead = { cancel: () => {} }
                    const settle = (finish: () => void) => {
                        unsubscribe?.()
                        this.pendingReads = this.pendingReads.filter((read) => read !== pending)
                        finish()
                    }
                    pending.cancel = () => settle(() => reject(new Error(INPUT_CANCELLED_ERROR)))
                    this.pendingReads.push(pending)
                    unsubscribe = keyboard.onTypedInput(() => settle(resolve))
                    //a character can arrive between the read that found none and this subscription
                    if (keyboard.hasTypedInput()) settle(resolve)
                })
        )
    }

    private echo(input: { echo?: TerminalEcho }, text: string): void {
        this.write(text)
        input.echo?.(text)
    }

    private eraseEcho(input: { echo?: TerminalEcho }): void {
        //only characters this read echoed are ever erased, so a backspace cannot eat program output
        this._output = this._output.slice(0, -1)
        input.echo?.(BACKSPACE)
    }

    private readScriptedInput(): string | null {
        const source = this._inputSource
        if (source.type !== 'scripted') return null
        const value = source.values.shift()
        if (value === undefined) throw new Error(NO_INPUT_LEFT_ERROR)
        return value
    }
}

function parseScriptedBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (['y', 'yes', 'true', '1'].includes(normalized)) return true
    if (['n', 'no', 'false', '0'].includes(normalized)) return false
    throw new Error(`Expected a boolean input, got "${value}"`)
}
