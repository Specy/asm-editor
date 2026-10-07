import { Prompt } from '$stores/promptStore.svelte'
import type { ExecutionController, ExecutionGeneration } from '$lib/languages/ExecutionController'
import {
    createTextStreamDecoder,
    encodeText,
    type TerminalEncoding,
    type TerminalEnter,
    type TextStreamDecoder
} from './terminalText'

export type TerminalInputSource =
    | {
          type: 'interactive'
      }
    | {
          type: 'scripted'
          values: string[]
      }

/**
 * Where an interactive read takes its keystrokes from: what is typed in the Terminal itself, or the
 * focused Screen's Keyboard once a program is in graphical use
 * ([ADR 0009](../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)). Chosen once
 * per run, so losing focus never moves a read from one to the other.
 */
export type TerminalInteractiveSource = 'terminal' | 'keyboard'

/**
 * A queue of typed characters the Line discipline reads keystrokes from: the Terminal's own, or the
 * Keyboard's when a Screen answers the reads (ADR 0009). Declared structurally so this module does
 * not depend on the Keyboard, and so a test can hand over a fake. `Keyboard` satisfies it. Enter is
 * a line feed, Backspace `\b` and Ctrl+D an EOT, as a tty's line discipline sees them.
 */
export type TerminalKeyboard = {
    hasTypedInput(): boolean
    peekCharacter(): string | undefined
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
    /** How the Target turns characters into bytes, for output written as bytes and byte reads. */
    encoding?: TerminalEncoding
    /** What a character read gives for Enter: the Reference environment's code. */
    enter?: TerminalEnter
}

/**
 * What a waiting read asks for: a line, edited until Enter; one keystroke; or a line of standard
 * input (descriptor 0), the one read that End of input answers.
 */
export type TerminalReadKind = 'line' | 'character' | 'standard-input'

/**
 * How one read shows what is typed, where the Target's program decides it: EASy68K's task 12 (the
 * echo) and task 16 (the input prompt, and the line feed after Enter). Each is on unless a read says
 * otherwise, which is how every other Target's reads behave.
 */
export type TerminalReadOptions = {
    /**
     * Whether what is typed is echoed, into the transcript and onto the Screen. Off, a line read
     * still ends on a new line when Enter is pressed, and a character read echoes nothing at all, as
     * in EASy68K.
     */
    echo?: boolean
    /** Whether the console draws its prompt, the caret and the read's question, while it waits. */
    prompt?: boolean
    /**
     * Whether a character read that takes Enter echoes a new line. Off, it echoes a carriage return
     * alone, which takes the Screen's text cursor back to the start of its line.
     */
    lineFeed?: boolean
}

/** A read the program is waiting on, for the view that shows where to type. */
export type TerminalPendingRead = {
    readonly kind: TerminalReadKind
    /** What the read asks for in words, such as "Enter an integer", for a label or a hint. */
    readonly question: string
    /** Whether Ctrl+D and the End of input button answer it, which only standard input accepts. */
    readonly endOfInput: boolean
    /** Where its keystrokes are typed: the Terminal, or the focused Screen (ADR 0009). */
    readonly source: TerminalInteractiveSource
    /** What Enter gives a character read on this Target. */
    readonly enter: TerminalEnter
    /** Whether what is typed is echoed (`TerminalReadOptions.echo`). */
    readonly echo: boolean
    /** Whether the view draws the read's prompt, its caret and question (`TerminalReadOptions.prompt`). */
    readonly prompt: boolean
    /**
     * The line typed so far, which Enter submits. A read that echoes has already put it at the end
     * of the transcript: the view needs it only to know what Backspace can still take back.
     */
    readonly line: string
}

/** A MARS or RARS confirm dialog's answer, Cancel included. */
export type TerminalConfirmAnswer = 'yes' | 'no' | 'cancel'

/** A read suspended on typed input, kept so Stop and clear can release the program. */
type PendingRead = {
    cancel: () => void
}

/** One interactive read in progress, from its first keystroke to the Enter that ends it. */
type ActiveRead = {
    kind: TerminalReadKind
    question: string
    queue: TerminalKeyboard
    echo?: TerminalEcho
    /** The read's own `TerminalReadOptions`, with every one that was left out on. */
    options: Required<TerminalReadOptions>
    /** The characters of the line typed so far, one code point each, echoed when the read echoes. */
    line: string[]
}

const NO_INPUT_LEFT_ERROR = 'Input does not have any values left'
const INPUT_CANCELLED_ERROR = 'Input cancelled'
const DIALOG_NOT_AVAILABLE_ERROR = 'Message dialogs are not available while running scripted input'

const BACKSPACE = '\b'
const LINE_FEED = '\n'
const CARRIAGE_RETURN = '\r'
/** EOT, what Ctrl+D and the End of input button type: End of input on an empty stdin line. */
const END_OF_TRANSMISSION = '\x04'
const TAB = '\t'
const SPACE = ' '

/**
 * The Terminal's own typed-input queue: what is typed in the Terminal, in order, as the console
 * component delivers it, held until a read takes it. Nothing here waits or echoes; that is the Line
 * discipline's part.
 */
class TerminalTypedInput implements TerminalKeyboard {
    //plain arrays: nothing here is reactive state, and a Set in a rune module is a lint error
    private readonly typed: string[] = []
    private listeners: (() => void)[] = []

    type(text: string): void {
        if (text.length === 0) return
        for (const character of text) this.typed.push(character)
        for (const listener of [...this.listeners]) listener()
    }

    hasTypedInput(): boolean {
        return this.typed.length > 0
    }

    peekCharacter(): string | undefined {
        return this.typed[0]
    }

    readCharacter(): string | undefined {
        return this.typed.shift()
    }

    onTypedInput(listener: () => void): () => void {
        this.listeners.push(listener)
        return () => {
            this.listeners = this.listeners.filter((candidate) => candidate !== listener)
        }
    }

    clear(): void {
        this.typed.length = 0
    }
}

/**
 * The Peripheral owning a program's output and its reads
 * ([ADR 0001](../../../../docs/adr/0001-peripheral-based-emulator-io.md)), with the **Line
 * discipline** that turns typed keys into what each read receives
 * ([ADR 0036](../../../../docs/adr/0036-programs-read-input-typed-in-the-terminal.md)):
 *
 * - a line read edits a line until Enter, echoing as it goes, and Backspace takes back what it
 *   echoed;
 * - a character read returns on one keystroke, with Enter as the Target's code;
 * - a read the program set up not to echo, or not to prompt, does neither (`TerminalReadOptions`);
 * - Ctrl+D or the End of input button gives End of input to a read of standard input on an empty
 *   line, and is ignored by the educational reads, which keep their errors;
 * - a Testcase's scripted answers are taken as they are and never echoed, like piped stdin.
 *
 * The keystrokes come from the Terminal's own queue, typed in the console (`TerminalConsole`), or
 * from the Screen's Keyboard in graphical use (ADR 0009). Every read waits for them, whether or not
 * a console is on the page: a host whose console is hidden reveals one when a read starts. Dialogs,
 * which are modal in their reference, stay in the app's Prompt.
 */
export class Terminal {
    private readonly executionController: ExecutionController
    private readonly encoding: TerminalEncoding
    private readonly enter: TerminalEnter
    private readonly decoder: TextStreamDecoder
    private _output = $state('')
    private _pendingRead = $state.raw<TerminalPendingRead | null>(null)
    private _inputSource: TerminalInputSource = { type: 'interactive' }
    /**
     * The Screen keyboard answering interactive reads, chosen once through the peripheral
     * configuration and fixed for the run (ADR 0009). It outlives `useScriptedInput`, so a
     * Testcase run comes back to the Screen keyboard afterwards, and it is null while the
     * Terminal's own queue is the source.
     */
    private _keyboardInput: { keyboard: TerminalKeyboard; echo?: TerminalEcho } | null = null
    /** Echo for the Terminal's own queue when text and graphics share the output window. */
    private terminalEcho: TerminalEcho | undefined
    private readonly typedInput = new TerminalTypedInput()
    private activeRead: ActiveRead | null = null
    private pendingReads: PendingRead[] = []
    /**
     * The bytes of the current line the program has not read yet, kept like a tty's line buffer:
     * `scanf("%d")` followed by `fgets` sees the newline the number left behind, and a Z80 `CHAR`
     * read takes a line one byte at a time.
     */
    private lineBuffer: Uint8Array = new Uint8Array(0)
    private inputListeners: (() => void)[] = []
    /**
     * How many console components are shown on the page to type in, see `attachConsole`. Plain,
     * because a console attaches from an effect, which must not read what it writes; the boolean
     * beside it is what the GUI reacts to.
     */
    private consoles = 0
    private _consoleAttached = $state(false)

    constructor(options: TerminalOptions) {
        this.executionController = options.executionController
        this.encoding = options.encoding ?? 'utf-8'
        this.enter = options.enter ?? LINE_FEED
        this.decoder = createTextStreamDecoder(this.encoding)
    }

    // ------------------------------------------------------------------ state

    /** The transcript: everything the program wrote and every echo of what was typed, in order. */
    get output(): string {
        return this._output
    }

    /** The read the program is waiting on, or null. Scripted reads never wait, so never show. */
    get pendingRead(): TerminalPendingRead | null {
        return this._pendingRead
    }

    get inputSource(): TerminalInputSource['type'] {
        return this._inputSource.type
    }

    /** Where an interactive read takes its keystrokes from, for the GUI and for the tests. */
    get interactiveSource(): TerminalInteractiveSource {
        return this._keyboardInput === null ? 'terminal' : 'keyboard'
    }

    /**
     * Whether a console component is shown on the page to type in, see `attachConsole`. Reactive,
     * so a host can reveal its hidden console when a read starts and none is.
     */
    get consoleAttached(): boolean {
        return this._consoleAttached
    }

    // ----------------------------------------------------------------- output

    /** Text the program wrote, or an echo. Ends a character a byte write left incomplete first. */
    write(text: string): void {
        this.flushOutput()
        this._output += text
    }

    /**
     * Bytes the program wrote, decoded in the Target's encoding as they stream: a character split
     * across two writes is held back until the rest of it arrives.
     */
    writeBytes(bytes: ArrayLike<number>): void {
        const text = this.decoder.decode(bytes)
        if (text.length > 0) this._output += text
    }

    /** The end of the program's output: a character left incomplete shows as U+FFFD. */
    flushOutput(): void {
        const rest = this.decoder.end()
        if (rest.length > 0) this._output += rest
    }

    prepend(text: string): void {
        this._output = text + this._output
    }

    /**
     * Empties the transcript only, what MARS's form feed does to its display: a read in progress
     * and the bytes of the current standard-input line are the program's input, not its output.
     */
    clearOutput(): void {
        this.decoder.reset()
        this._output = ''
    }

    /** Everything a program left behind, for Build, Stop and the start of each Testcase. */
    clear(): void {
        this.cancelPendingInput()
        this.clearOutput()
        this.lineBuffer = new Uint8Array(0)
        this.typedInput.clear()
        this.notifyInputChange()
    }

    // ---------------------------------------------------------- configuration

    useInteractiveInput(): void {
        this._inputSource = { type: 'interactive' }
        this.lineBuffer = new Uint8Array(0)
        this.notifyInputChange()
    }

    useScriptedInput(values: string[]): void {
        this.cancelPendingInput()
        this._inputSource = { type: 'scripted', values: [...values] }
        this.lineBuffer = new Uint8Array(0)
        this.notifyInputChange()
    }

    /**
     * Answers interactive reads from a Screen keyboard instead of from the Terminal's own queue.
     * The echo callback is optional and only environments with a single output window pass one.
     */
    useKeyboardInput(keyboard: TerminalKeyboard, echo?: TerminalEcho): void {
        this.cancelPendingInput()
        this._keyboardInput = { keyboard, echo }
        this.notifyInputChange()
    }

    /** Back to the Terminal's own queue, the source for a program that is not in graphical use. */
    useTerminalInput(echo?: TerminalEcho): void {
        this.cancelPendingInput()
        this._keyboardInput = null
        this.terminalEcho = echo
        this.notifyInputChange()
    }

    /**
     * A console component that shows this Terminal and takes typing for it is shown on the page;
     * call the returned function when it is hidden or leaves. Reads never depend on it: they wait
     * for typing either way, and a host uses `consoleAttached` to reveal a console for them
     * ([plan](../../../../docs/design/environment-library-plan.md), decision 10).
     */
    attachConsole(): () => void {
        this.consoles += 1
        this._consoleAttached = true
        let attached = true
        return () => {
            if (!attached) return
            attached = false
            this.consoles -= 1
            this._consoleAttached = this.consoles > 0
        }
    }

    /**
     * Called whenever the input a read or a device would see may have changed: something typed in
     * the Terminal, a keystroke or a line taken, a scripted run starting or ending. A device that
     * mirrors the next keystroke in a register, MARS's receiver, refreshes it from here.
     */
    onInputChange(listener: () => void): () => void {
        this.inputListeners.push(listener)
        return () => {
            this.inputListeners = this.inputListeners.filter((candidate) => candidate !== listener)
        }
    }

    // ----------------------------------------------------------- typed input

    /**
     * Text typed in the Terminal, an IME's committed composition or a paste. Line endings become a
     * single Enter each, so a pasted block submits one line per line, as a paste into a tty does.
     */
    insertText(text: string): void {
        this.type(text.replace(/\r\n?/g, LINE_FEED))
    }

    paste(text: string): void {
        this.insertText(text)
    }

    pressEnter(): void {
        this.type(LINE_FEED)
    }

    pressBackspace(): void {
        this.type(BACKSPACE)
    }

    /** Ctrl+D or the End of input button: End of input for a read of standard input. */
    sendEndOfInput(): void {
        this.type(END_OF_TRANSMISSION)
    }

    /**
     * Whether a read would find an answer waiting, without consuming it: EASy68K's task 7 and the
     * Z80's key port. It is the poll ADR 0009 keeps compatible with the read that follows it, both
     * looking at the same pending input: the rest of the current line, the scripted answers, or the
     * typed queue the reads take from.
     */
    hasPendingInput(): boolean {
        if (this.lineBuffer.length > 0) return true
        const source = this._inputSource
        if (source.type === 'scripted') return source.values.length > 0
        return this.readQueue().hasTypedInput()
    }

    /**
     * Releases a program suspended on input. Stop and Build invalidate the execution generation and
     * then clear the Terminal, so the released read is superseded and its error never reaches the
     * user; the prompts of dialogs are released by the same path, through `Prompt.cancel`.
     */
    cancelPendingInput(): void {
        const pending = this.pendingReads
        this.pendingReads = []
        for (const read of pending) read.cancel()
        //the released read settles a microtask later; the view stops showing it now
        if (pending.length === 0) return
        this.activeRead = null
        this._pendingRead = null
    }

    // ------------------------------------------------------------------ reads

    /** A line, without its Enter: the educational line and number reads. */
    async readAsync(
        question: string,
        execution: ExecutionGeneration,
        options: TerminalReadOptions = {}
    ): Promise<string> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return scripted
        return (await this.readLine('line', question, execution, options)) ?? ''
    }

    /**
     * One character, as soon as one keystroke is typed: EASy68K's task 5, MARS's read char. Enter
     * is the Target's code. A scripted answer gives its first character.
     */
    async readCharAsync(
        question: string,
        execution: ExecutionGeneration,
        options: TerminalReadOptions = {}
    ): Promise<string> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return [...scripted][0] ?? ''
        return this.readCharacter(question, execution, options)
    }

    /**
     * A read of standard input (descriptor 0): the bytes left over from the current line, or else
     * one new line from the Input Source with its newline, never more than `length` bytes. No bytes
     * is End of input: a Testcase whose scripted answers are exhausted, or Ctrl+D on an empty line.
     * The educational read syscalls never see End of input; they keep their errors.
     */
    async readStandardInput(
        length: number,
        question: string,
        execution: ExecutionGeneration
    ): Promise<Uint8Array> {
        if (length <= 0) return new Uint8Array(0)
        if (this.lineBuffer.length === 0) {
            const line = await this.readStandardInputLine(question, execution)
            if (line === null) return new Uint8Array(0)
            this.lineBuffer = encodeText(line + LINE_FEED, this.encoding)
        }
        const bytes = this.lineBuffer.slice(0, length)
        this.lineBuffer = this.lineBuffer.subarray(bytes.length)
        this.notifyInputChange()
        return bytes
    }

    /**
     * One byte, the Z80's `CHAR` port: the next byte of the current line, or else a new one. In
     * graphical use that is a single keystroke from the Screen keyboard (ADR 0009); otherwise it is
     * a line, edited until Enter, which the port then hands out a byte at a time ending with its
     * line feed, as a scripted answer is. End of input does not apply.
     */
    async readByte(question: string, execution: ExecutionGeneration): Promise<number> {
        const buffered = this.readBufferedByte()
        if (buffered !== undefined) return buffered
        const scripted = this.readScriptedInput()
        let text: string
        if (scripted !== null) text = scripted + LINE_FEED
        else if (this._keyboardInput !== null) text = await this.readCharacter(question, execution)
        else text = `${(await this.readLine('line', question, execution)) ?? ''}${LINE_FEED}`
        this.lineBuffer = encodeText(text, this.encoding)
        const byte = this.readBufferedByte()
        if (byte === undefined) throw new Error(NO_INPUT_LEFT_ERROR)
        return byte
    }

    /**
     * The next byte of the current line without waiting, or undefined when it has none left: what a
     * program reading a line a byte at a time gets on every byte after the first.
     */
    readBufferedByte(): number | undefined {
        if (this.lineBuffer.length === 0) return undefined
        const byte = this.lineBuffer[0]
        this.lineBuffer = this.lineBuffer.subarray(1)
        this.notifyInputChange()
        return byte
    }

    /**
     * The keystroke a keyboard device a program polls would deliver next, without taking it:
     * MARS's receiver register. A scripted run answers with its lines, a byte at a time and each
     * ending in a line feed, as a Z80 `CHAR` read is answered; interactively it is the next
     * character typed on the device's Screen keyboard, or else in the Terminal. Nothing is echoed:
     * a program polling a device echoes what it wants to itself.
     */
    peekKeystroke(screenKeyboard?: TerminalKeyboard): number | undefined {
        const source = this._inputSource
        if (source.type === 'scripted') {
            if (this.lineBuffer.length > 0) return this.lineBuffer[0]
            const next = source.values[0]
            return next === undefined ? undefined : encodeText(next + LINE_FEED, this.encoding)[0]
        }
        for (const queue of this.keystrokeQueues(screenKeyboard)) {
            const character = queue.peekCharacter()
            if (character !== undefined) return character.codePointAt(0)
        }
        return undefined
    }

    /** Takes the keystroke `peekKeystroke` names, for the device the program just read it from. */
    takeKeystroke(screenKeyboard?: TerminalKeyboard): number | undefined {
        const source = this._inputSource
        if (source.type === 'scripted') {
            if (this.lineBuffer.length === 0) {
                const next = source.values.shift()
                if (next === undefined) return undefined
                this.lineBuffer = encodeText(next + LINE_FEED, this.encoding)
            }
            return this.readBufferedByte()
        }
        for (const queue of this.keystrokeQueues(screenKeyboard)) {
            const character = queue.readCharacter()
            if (character === undefined) continue
            this.notifyInputChange()
            return character.codePointAt(0)
        }
        return undefined
    }

    // ---------------------------------------------------------------- dialogs

    /**
     * MARS's and RARS's confirm dialog, modal in its reference: Yes, No or Cancel, never echoed. A
     * scripted answer is yes, no or cancel in any of the spellings `parseScriptedConfirm` takes.
     */
    async confirm(
        question: string,
        execution: ExecutionGeneration
    ): Promise<TerminalConfirmAnswer> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return parseScriptedConfirm(scripted)
        const answer = await this.executionController.waitForPrompt(execution, () =>
            Prompt.confirmOrCancel(question)
        )
        return answer === null ? 'cancel' : answer ? 'yes' : 'no'
    }

    /** An input dialog: the text typed, or null for Cancel. Never echoed. */
    async inputDialog(
        question: string,
        execution: ExecutionGeneration,
        placeholder = ''
    ): Promise<string | null> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return scripted
        return this.executionController.waitForPrompt(execution, () =>
            Prompt.askText(question, true, placeholder)
        )
    }

    /**
     * A message dialog, which the program waits on until it is dismissed. A scripted run has nobody
     * to dismiss it, so it fails at once rather than leave a Testcase waiting for ever.
     */
    async messageDialog(message: string, execution: ExecutionGeneration): Promise<void> {
        if (this._inputSource.type === 'scripted') {
            throw new Error(`${DIALOG_NOT_AVAILABLE_ERROR}: ${message}`)
        }
        await this.executionController.waitForPrompt(execution, () => Prompt.alert(message))
    }

    // --------------------------------------------------------- line discipline

    private async readStandardInputLine(
        question: string,
        execution: ExecutionGeneration
    ): Promise<string | null> {
        const source = this._inputSource
        if (source.type === 'scripted') return source.values.shift() ?? null
        return this.readLine('standard-input', question, execution)
    }

    /**
     * Collects keystrokes until Enter, echoing them like a tty. Backspace edits the line and erases
     * what it echoed; the other control characters are not text and are dropped, so a program
     * reading a line never receives an escape or a bell. Null is End of input: an EOT on an empty
     * line of standard input. Any other read ignores an EOT, which is no character.
     *
     * A read that does not echo shows nothing of the line, but the Enter that ends it still starts
     * a new line, which is what EASy68K does with its echo off.
     */
    private async readLine(
        kind: 'line' | 'standard-input',
        question: string,
        execution: ExecutionGeneration,
        options: TerminalReadOptions = {}
    ): Promise<string | null> {
        const read = this.beginRead(kind, question, options)
        try {
            for (;;) {
                const character = await this.nextKeystroke(read, execution)
                if (character === END_OF_TRANSMISSION) {
                    if (kind === 'standard-input' && read.line.length === 0) return null
                    continue
                }
                if (character === LINE_FEED) {
                    this.echo(read, LINE_FEED)
                    return read.line.join('')
                }
                if (character === BACKSPACE) {
                    const erased = read.line.pop()
                    if (erased === undefined) continue
                    if (read.options.echo) this.eraseEcho(read, erased)
                    this.publish(read)
                    continue
                }
                if (character < SPACE && character !== TAB) continue
                read.line.push(character)
                if (read.options.echo) this.echo(read, character)
                this.publish(read)
            }
        } finally {
            this.endRead(read)
        }
    }

    /**
     * One keystroke, echoed, with Enter as the Target's code. An EOT is no keystroke to it. A read
     * without its line feed echoes Enter as a carriage return alone; one without its echo echoes
     * nothing, as EASy68K's task 5 does.
     */
    private async readCharacter(
        question: string,
        execution: ExecutionGeneration,
        options: TerminalReadOptions = {}
    ): Promise<string> {
        const read = this.beginRead('character', question, options)
        try {
            for (;;) {
                const character = await this.nextKeystroke(read, execution)
                if (character === END_OF_TRANSMISSION) continue
                if (read.options.echo) {
                    const enter = read.options.lineFeed ? LINE_FEED : CARRIAGE_RETURN
                    this.echo(read, character === LINE_FEED ? enter : character)
                }
                return character === LINE_FEED ? this.enter : character
            }
        } finally {
            this.endRead(read)
        }
    }

    private beginRead(
        kind: TerminalReadKind,
        question: string,
        { echo = true, prompt = true, lineFeed = true }: TerminalReadOptions = {}
    ): ActiveRead {
        const keyboardInput = this._keyboardInput
        const read: ActiveRead = {
            kind,
            question,
            queue: keyboardInput?.keyboard ?? this.typedInput,
            echo: keyboardInput ? keyboardInput.echo : this.terminalEcho,
            options: { echo, prompt, lineFeed },
            line: []
        }
        this.activeRead = read
        this.publish(read)
        return read
    }

    private endRead(read: ActiveRead): void {
        if (this.activeRead !== read) return
        this.activeRead = null
        this._pendingRead = null
    }

    /** The pending read as the view sees it, republished whenever its line changes. */
    private publish(read: ActiveRead): void {
        if (this.activeRead !== read) return
        this._pendingRead = {
            kind: read.kind,
            question: read.question,
            endOfInput: read.kind === 'standard-input',
            source: read.queue === this.typedInput ? 'terminal' : 'keyboard',
            enter: this.enter,
            echo: read.options.echo,
            prompt: read.options.prompt,
            line: read.line.join('')
        }
    }

    private async nextKeystroke(read: ActiveRead, execution: ExecutionGeneration): Promise<string> {
        for (;;) {
            const character = read.queue.readCharacter()
            if (character !== undefined) {
                this.notifyInputChange()
                return character
            }
            await this.waitForTypedInput(read.queue, execution)
        }
    }

    /**
     * Suspends until characters are typed, in the console or on the focused Screen. The GUI stays
     * responsive because this is an ordinary await, and Stop releases it through
     * `cancelPendingInput`.
     */
    private waitForTypedInput(
        queue: TerminalKeyboard,
        execution: ExecutionGeneration
    ): Promise<void> {
        return this.executionController.waitFor(
            execution,
            () =>
                new Promise<void>((resolve, reject) => {
                    const unsubscribers: (() => void)[] = []
                    const pending: PendingRead = { cancel: () => {} }
                    let settled = false
                    const settle = (finish: () => void) => {
                        if (settled) return
                        settled = true
                        for (const unsubscribe of unsubscribers) unsubscribe()
                        this.pendingReads = this.pendingReads.filter((read) => read !== pending)
                        finish()
                    }
                    pending.cancel = () => settle(() => reject(new Error(INPUT_CANCELLED_ERROR)))
                    this.pendingReads.push(pending)
                    unsubscribers.push(queue.onTypedInput(() => settle(resolve)))
                    //a character can arrive between the read that found none and this subscription
                    if (queue.hasTypedInput()) settle(resolve)
                })
        )
    }

    private echo(read: ActiveRead, text: string): void {
        this.write(text)
        read.echo?.(text)
    }

    /**
     * Takes one echoed character back off the transcript: a whole code point, which is two code
     * units for a character outside the Basic Multilingual Plane. Only characters this read echoed
     * are ever erased, so a backspace cannot eat program output.
     */
    private eraseEcho(read: ActiveRead, erased: string): void {
        if (this._output.endsWith(erased)) this._output = this._output.slice(0, -erased.length)
        read.echo?.(BACKSPACE)
    }

    private type(text: string): void {
        this.typedInput.type(text)
        this.notifyInputChange()
    }

    /** The queue the reads take from: the Screen keyboard in graphical use, else the Terminal's. */
    private readQueue(): TerminalKeyboard {
        return this._keyboardInput?.keyboard ?? this.typedInput
    }

    /** Where a polled device's keystrokes come from, its own Screen keyboard first. */
    private keystrokeQueues(screenKeyboard?: TerminalKeyboard): TerminalKeyboard[] {
        const keyboard = screenKeyboard ?? this._keyboardInput?.keyboard
        return keyboard === undefined ? [this.typedInput] : [keyboard, this.typedInput]
    }

    private readScriptedInput(): string | null {
        const source = this._inputSource
        if (source.type !== 'scripted') return null
        const value = source.values.shift()
        if (value === undefined) throw new Error(NO_INPUT_LEFT_ERROR)
        this.notifyInputChange()
        return value
    }

    private notifyInputChange(): void {
        for (const listener of [...this.inputListeners]) listener()
    }
}

/** A scripted confirm answer: yes, no or cancel, spelled as scripted booleans have always been. */
function parseScriptedConfirm(value: string): TerminalConfirmAnswer {
    const normalized = value.trim().toLowerCase()
    if (['y', 'yes', 'true', '1'].includes(normalized)) return 'yes'
    if (['n', 'no', 'false', '0'].includes(normalized)) return 'no'
    if (['c', 'cancel'].includes(normalized)) return 'cancel'
    throw new Error(`Expected yes, no or cancel, got "${value}"`)
}
