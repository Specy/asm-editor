export enum PromptType {
    Text,
    Confirm
}
/**
 * The answer to a line prompt that offered End of input, when the user chose it instead of typing a
 * line: a read of standard input then returns no bytes, as Ctrl+D on an empty line does in a tty.
 */
export const END_OF_INPUT = Symbol('End of input')
type Prompt = {
    promise: Promise<PromptResult> | null
    id: number
    question: string
    placeholder: string
    type: PromptType
    resolve: ((value: PromptResult) => void) | null
    cancellable: boolean
    /** Whether the text prompt offers End of input, which only reads of standard input accept. */
    endOfInput: boolean
}
type PromptResult = string | boolean | null | typeof END_OF_INPUT

function createPromptStore() {
    const prompt = $state<Prompt>({
        promise: null,
        question: '',
        id: 0,
        placeholder: '',
        type: PromptType.Text,
        resolve: null,
        cancellable: true,
        endOfInput: false
    })
    function ask(
        question: string,
        type: PromptType,
        cancellable = true,
        placeholder = ''
    ): Promise<PromptResult> {
        settle(null)
        prompt.question = question
        prompt.placeholder = placeholder
        prompt.type = type
        prompt.cancellable = cancellable
        prompt.endOfInput = false
        prompt.id = prompt.id + 1
        const promise = new Promise<PromptResult>((resolve) => {
            prompt.resolve = resolve
        })
        prompt.promise = promise
        return promise
    }

    async function confirm(question: string, cancellable = true): Promise<boolean | null> {
        const result = await ask(question, PromptType.Confirm, cancellable)
        return typeof result === 'boolean' ? result : null
    }

    async function askText(
        question: string,
        cancellable = true,
        placeholder = ''
    ): Promise<string | null> {
        const result = await ask(question, PromptType.Text, cancellable, placeholder)
        return typeof result === 'string' ? result : null
    }

    /**
     * A line for standard input: the typed text, null when cancelled, or END_OF_INPUT when the user
     * ends the input instead.
     */
    async function askLine(
        question: string,
        cancellable = true
    ): Promise<string | null | typeof END_OF_INPUT> {
        const pending = ask(question, PromptType.Text, cancellable)
        prompt.endOfInput = true
        const result = await pending
        return typeof result === 'string' || result === END_OF_INPUT ? result : null
    }

    function answerEndOfInput() {
        if (prompt.type !== PromptType.Text || !prompt.endOfInput) return
        settle(END_OF_INPUT)
    }

    function answerText(value: string) {
        if (prompt.type !== PromptType.Text) return
        settle(value)
    }

    function answerConfirm(value: boolean) {
        if (prompt.type !== PromptType.Confirm) return
        settle(value)
    }

    function cancel() {
        settle(null)
    }

    function settle(value: PromptResult) {
        const resolve = prompt.resolve
        prompt.promise = null
        prompt.resolve = null
        reset()
        resolve?.(value)
    }

    function reset() {
        prompt.question = ''
        prompt.placeholder = ''
        prompt.cancellable = true
        prompt.endOfInput = false
    }
    return {
        get question() {
            return prompt.question
        },
        get placeholder() {
            return prompt.placeholder
        },
        get type() {
            return prompt.type
        },
        get cancellable() {
            return prompt.cancellable
        },
        get endOfInput() {
            return prompt.endOfInput
        },
        get id() {
            return prompt.id
        },
        get promise() {
            return prompt.promise
        },
        confirm,
        askText,
        askLine,
        answerText,
        answerEndOfInput,
        answerConfirm,
        cancel
    }
}

export const Prompt = createPromptStore()
