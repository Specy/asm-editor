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

export type TerminalOptions = {
    executionController: ExecutionController
}

const NO_INPUT_LEFT_ERROR = 'Input does not have any values left'
const INPUT_CANCELLED_ERROR = 'Input cancelled'
const DIALOG_NOT_AVAILABLE_ERROR = 'Message dialogs are not available while running scripted input'

export class Terminal {
    private readonly executionController: ExecutionController
    private _output = $state('')
    private _inputSource: TerminalInputSource = { type: 'interactive' }

    constructor(options: TerminalOptions) {
        this.executionController = options.executionController
    }

    get output(): string {
        return this._output
    }

    get inputSource(): TerminalInputSource['type'] {
        return this._inputSource.type
    }

    write(text: string): void {
        this._output += text
    }

    prepend(text: string): void {
        this._output = text + this._output
    }

    clear(): void {
        this._output = ''
    }

    useInteractiveInput(): void {
        this._inputSource = { type: 'interactive' }
    }

    useScriptedInput(values: string[]): void {
        this._inputSource = { type: 'scripted', values: [...values] }
    }

    async readAsync(question: string, execution: ExecutionGeneration): Promise<string> {
        const scripted = this.readScriptedInput()
        if (scripted !== null) return scripted
        const value = await this.executionController.waitForPrompt(execution, () =>
            Prompt.askText(question, true)
        )
        if (value === null) throw new Error(INPUT_CANCELLED_ERROR)
        //a terminal echoes what the user types (plus the Enter that submitted it); scripted input
        //behaves like piped stdin, which is not echoed — and testcase expected output relies on that
        this.write(`${value}\n`)
        return value
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
